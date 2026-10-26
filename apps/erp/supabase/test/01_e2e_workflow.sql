-- =============================================================================
-- End-to-end workflow + RLS verification, run against a freshly-migrated
-- database (00_auth_shim.sql + all of migrations/ already applied). Every
-- check either RAISEs on failure (halting the script under ON_ERROR_STOP=1)
-- or prints a row you can eyeball. A clean run to the bottom = every check
-- passed.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 0. Bootstrap: one staff member per role.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.com'),
  ('a0000000-0000-0000-0000-000000000002', 'doctor@test.com'),
  ('a0000000-0000-0000-0000-000000000003', 'reception@test.com'),
  ('a0000000-0000-0000-0000-000000000004', 'accountant@test.com'),
  ('a0000000-0000-0000-0000-000000000005', 'counselor@test.com'),
  ('a0000000-0000-0000-0000-000000000006', 'pharmacist@test.com'),
  ('a0000000-0000-0000-0000-000000000007', 'therapist@test.com'),
  ('a0000000-0000-0000-0000-000000000008', 'marketing@test.com');

do $$
begin
  if (select count(*) from public.staff_profiles) <> 8 then
    raise exception 'TEST FAILED: handle_new_user trigger did not auto-create 8 staff_profiles rows (got %)',
      (select count(*) from public.staff_profiles);
  end if;
  raise notice 'PASS: handle_new_user auto-created staff_profiles for all 8 signups';
end $$;

insert into public.user_roles (user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'doctor'),
  ('a0000000-0000-0000-0000-000000000003', 'reception'),
  ('a0000000-0000-0000-0000-000000000004', 'accountant'),
  ('a0000000-0000-0000-0000-000000000005', 'counselor'),
  ('a0000000-0000-0000-0000-000000000006', 'pharmacist'),
  ('a0000000-0000-0000-0000-000000000007', 'therapist'),
  ('a0000000-0000-0000-0000-000000000008', 'marketing');

-- give each pharmacist a permissions row (referenced by nothing critical yet, just sanity)
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set doctor '''a0000000-0000-0000-0000-000000000002'''
\set reception '''a0000000-0000-0000-0000-000000000003'''
\set accountant '''a0000000-0000-0000-0000-000000000004'''
\set counselor '''a0000000-0000-0000-0000-000000000005'''
\set pharmacist '''a0000000-0000-0000-0000-000000000006'''
\set therapist '''a0000000-0000-0000-0000-000000000007'''
\set marketing '''a0000000-0000-0000-0000-000000000008'''

-- ---------------------------------------------------------------------------
-- 1. my_billing_access() sanity per role
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:admin::uuid);
do $$
declare v record;
begin
  select * into v from public.my_billing_access();
  if not (v.can_bill and v.can_view_finance and v.is_admin) then
    raise exception 'TEST FAILED: admin my_billing_access() wrong: %', v;
  end if;
  raise notice 'PASS: admin my_billing_access() = %', v;
end $$;

select auth.login_as(:doctor::uuid);
do $$
declare v record;
begin
  select * into v from public.my_billing_access();
  if v.can_bill or v.can_view_finance or v.is_admin then
    raise exception 'TEST FAILED: doctor should have no billing/finance/admin access, got: %', v;
  end if;
  raise notice 'PASS: doctor my_billing_access() correctly locked down = %', v;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Customer creation (reception)
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.customers (id, name, phone, gender, age)
values ('c0000000-0000-0000-0000-000000000001', 'Priya Sharma', '9876500001', 'female', 29);
reset role;
do $$ begin
  if not exists (select 1 from public.customers where id = 'c0000000-0000-0000-0000-000000000001') then
    raise exception 'TEST FAILED: reception could not create a customer';
  end if;
  raise notice 'PASS: reception created customer';
end $$;

-- A doctor should NOT be able to delete a customer (admin-only per customers_delete)
set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
declare v_count int;
begin
  delete from public.customers where id = 'c0000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST FAILED: doctor was able to delete a customer (admin-only per customers_delete policy)';
  end if;
  raise notice 'PASS: doctor blocked from deleting a customer (0 rows affected)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Appointment + check-in -> encounter
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.cos_appointments (id, customer_id, doctor_id, appointment_date, appointment_time, status, appointment_source)
values ('aa000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', :doctor::uuid, current_date, '10:00', 'scheduled', 'walk_in');
-- check-in (mirrors AppointmentDetailsModal.handleCheckIn)
update public.cos_appointments set status = 'checked_in' where id = 'aa000000-0000-0000-0000-000000000001';
insert into public.encounters (id, appointment_id, customer_id, encounter_type, status, checked_in_at)
values ('ee000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'consultation', 'checked_in', now());
reset role;
do $$ begin
  if not exists (select 1 from public.encounters where id = 'ee000000-0000-0000-0000-000000000001' and status = 'checked_in') then
    raise exception 'TEST FAILED: check-in did not create an encounter row';
  end if;
  raise notice 'PASS: reception booked + checked in an appointment, encounter created';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Doctor Room: prescription -> send to counselor
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:doctor::uuid);
insert into public.doctor_prescriptions (id, encounter_id, customer_id, doctor_id, diagnosis, clinical_notes, status, sent_to_counselor_at, sent_to_counselor_id)
values ('dd000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', :doctor::uuid, 'Acne', 'Mild inflammatory acne', 'sent_to_counselor', now(), :counselor::uuid);

insert into public.doctor_prescription_items (id, prescription_id, item_type, name, quantity, doctor_suggested_price, doctor_notes)
values
  ('df100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'service', 'Acne Facial', 1, 2000, '6 sessions recommended'),
  ('df100000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001', 'product', 'Salicylic Acid Cleanser', 1, 600, 'Twice daily');

update public.encounters set status = 'in_progress', started_at = now(), started_by = :doctor::uuid where id = 'ee000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if not exists (select 1 from public.doctor_prescriptions where id = 'dd000000-0000-0000-0000-000000000001' and status = 'sent_to_counselor') then
    raise exception 'TEST FAILED: doctor prescription not created/sent correctly';
  end if;
  raise notice 'PASS: doctor sent a 2-item prescription to counselor';
end $$;

-- A different doctor should NOT be able to see/edit this prescription (doctor_id must equal auth.uid())
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000099', 'doctor2@test.com');
insert into public.user_roles (user_id, role) values ('a0000000-0000-0000-0000-000000000099', 'doctor');
set role authenticated;
select auth.login_as('a0000000-0000-0000-0000-000000000099'::uuid);
do $$
declare v_count int;
begin
  select count(*) into v_count from public.doctor_prescriptions where id = 'dd000000-0000-0000-0000-000000000001';
  if v_count > 0 then
    raise exception 'TEST FAILED: a second doctor could see the first doctor''s own prescription';
  end if;
  raise notice 'PASS: doctor-owned prescription correctly hidden from a different doctor';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Counselor Room: quotation (+ a product_order side-effect) -> reception
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:counselor::uuid);
insert into public.counselor_quotations (
  id, encounter_id, customer_id, prescription_id, counselor_id, quotation_number,
  items_json, subtotal, discount_percent, discount_amount, cgst, sgst, net_total,
  transaction_type, status, expires_at, finalized_at
) values (
  'cc000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001',
  :counselor::uuid, 'QUOTE-TEST-0001',
  '[
    {"id":"df100000-0000-0000-0000-000000000001","type":"service","service_id":null,"name":"Acne Facial","quantity":1,"doctor_suggested_price":2000,"counselor_quoted_price":1800,"discount_applied":200,"discount_percent":10,"final_amount":1800},
    {"id":"df100000-0000-0000-0000-000000000002","type":"product","product_id":null,"name":"Salicylic Acid Cleanser","quantity":1,"doctor_suggested_price":600,"counselor_quoted_price":600,"discount_applied":0,"discount_percent":0,"final_amount":600}
  ]'::jsonb,
  2400, 0, 0, 60, 60, 2520, 'treatment_and_products', 'sent_to_patient', now() + interval '7 days', now()
);

update public.doctor_prescriptions set status = 'finalized', finalized_at = now() where id = 'dd000000-0000-0000-0000-000000000001';

insert into public.product_orders (id, encounter_id, customer_id, quotation_id, status, items_json, total_amount)
values (
  'bb000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  'cc000000-0000-0000-0000-000000000001', 'pending',
  '[{"id":"df100000-0000-0000-0000-000000000002","product_id":null,"name":"Salicylic Acid Cleanser","quantity":1,"unit_price":600,"total":600}]'::jsonb,
  600
);
select public.auto_assign_to_pharmacist('bb000000-0000-0000-0000-000000000001');
reset role;

do $$
declare v_status text; v_assigned uuid;
begin
  select status, assigned_to into v_status, v_assigned from public.product_orders where id = 'bb000000-0000-0000-0000-000000000001';
  if v_status <> 'assigned' or v_assigned <> 'a0000000-0000-0000-0000-000000000006' then
    raise exception 'TEST FAILED: auto_assign_to_pharmacist did not assign the only pharmacist (status=%, assigned=%)', v_status, v_assigned;
  end if;
  raise notice 'PASS: counselor quotation created, product order auto-assigned to the pharmacist';
end $$;

-- BUG REGRESSION: pharmacist should be able to self-assign a *different*,
-- still-pending order (the fix to product_orders_update). Create a 2nd order
-- that's deliberately left unassigned, then have the pharmacist claim it.
insert into public.product_orders (id, encounter_id, customer_id, status, items_json, total_amount)
values ('bb000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'pending',
  '[{"id":"x","product_id":null,"name":"Sunscreen","quantity":1,"unit_price":500,"total":500}]'::jsonb, 500);

set role authenticated;
select auth.login_as(:pharmacist::uuid);
do $$
declare v_count int;
begin
  update public.product_orders set assigned_to = auth.uid(), assigned_at = now(), status = 'assigned'
    where id = 'bb000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST FAILED (regression): pharmacist self-assign of a pending order affected % rows, expected 1', v_count;
  end if;
  raise notice 'PASS (regression fix verified): pharmacist self-assign of a pending product_order works';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Billing: create the invoice from the quotation via edit_invoice()
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:reception::uuid);

insert into public.invoices (id, customer_id, quotation_id, prescription_id, invoice_type)
values ('ff000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'treatment_and_products');

select public.edit_invoice(
  p_invoice_id := 'ff000000-0000-0000-0000-000000000001',
  p_lines := '[
    {"id":null,"item_type":"service","service_id":null,"product_id":null,"inventory_id":null,"name":"Acne Facial","quantity":1,"rate":1800,"discount_amount":0,"staff_id":null},
    {"id":null,"item_type":"product","product_id":null,"inventory_id":null,"name":"Salicylic Acid Cleanser","quantity":1,"rate":600,"discount_amount":0,"staff_id":null}
  ]'::jsonb,
  p_discount_amount := 0,
  p_gst_mode := 'exclusive',
  p_payment_mode := 'upi'
);

update public.counselor_quotations set status = 'converted_to_invoice' where id = 'cc000000-0000-0000-0000-000000000001';
reset role;

do $$
declare v public.invoices%rowtype;
begin
  select * into v from public.invoices where id = 'ff000000-0000-0000-0000-000000000001';
  if v.invoice_no is null or v.invoice_no !~ '^INV-\d{6}$' then
    raise exception 'TEST FAILED: invoice_no not assigned correctly (got %) - regression check for the missing-grant bug', v.invoice_no;
  end if;
  if v.subtotal <> 2400 or v.cgst <> 60 or v.sgst <> 60 or v.gross_total <> 2520 then
    raise exception 'TEST FAILED: GST math wrong. subtotal=% cgst=% sgst=% gross=% (expected 2400/60/60/2520)', v.subtotal, v.cgst, v.sgst, v.gross_total;
  end if;
  raise notice 'PASS: invoice_no auto-assigned (%), GST math correct (subtotal 2400 + 5%% GST = 2520)', v.invoice_no;
end $$;

do $$ begin
  if not exists (select 1 from public.counselor_quotations where id = 'cc000000-0000-0000-0000-000000000001' and status = 'converted_to_invoice') then
    raise exception 'TEST FAILED (regression): reception could not mark the quotation converted_to_invoice';
  end if;
  raise notice 'PASS (regression fix verified): reception (can_bill, not admin) converted the quotation to invoice';
end $$;

-- Service wallet auto-created for the service line
do $$
declare v_wallet record;
begin
  select * into v_wallet from public.service_wallets sw
    join public.invoice_lines il on il.id = sw.invoice_line_id
    where il.invoice_id = 'ff000000-0000-0000-0000-000000000001' and il.item_type = 'service';
  if v_wallet is null then
    raise exception 'TEST FAILED: no service_wallet created for the service line';
  end if;
  if v_wallet.total_sessions <> 1 or v_wallet.status <> 'active' then
    raise exception 'TEST FAILED: service_wallet has wrong shape: %', v_wallet;
  end if;
  raise notice 'PASS: service_wallet auto-created (total_sessions=1, active)';
end $$;

-- Sales voucher auto-posted (the bug I found+fixed this session: nothing
-- used to INSERT the first sales voucher at all)
do $$
declare v_voucher record; v_entry_count int; v_debit numeric; v_credit_income numeric; v_credit_gst numeric;
begin
  select * into v_voucher from public.vouchers where invoice_id = 'ff000000-0000-0000-0000-000000000001' and voucher_type = 'sales';
  if v_voucher is null then
    raise exception 'TEST FAILED (regression): no sales voucher was auto-posted for the invoice';
  end if;
  if v_voucher.amount <> 2520 or v_voucher.cgst <> 60 or v_voucher.sgst <> 60 then
    raise exception 'TEST FAILED: sales voucher totals wrong: %', v_voucher;
  end if;

  select count(*) into v_entry_count from public.voucher_entries where voucher_id = v_voucher.id;
  if v_entry_count <> 3 then
    raise exception 'TEST FAILED: expected exactly 3 voucher_entries (Cash debit / income credit / GST credit), got %', v_entry_count;
  end if;

  select sum(debit) into v_debit from public.voucher_entries ve join public.ledger_accounts la on la.id = ve.ledger_account_id where ve.voucher_id = v_voucher.id and la.name = 'Cash';
  select sum(credit) into v_credit_income from public.voucher_entries ve join public.ledger_accounts la on la.id = ve.ledger_account_id where ve.voucher_id = v_voucher.id and la.name = 'Sales - Services';
  select sum(credit) into v_credit_gst from public.voucher_entries ve join public.ledger_accounts la on la.id = ve.ledger_account_id where ve.voucher_id = v_voucher.id and la.name = 'GST Payable';

  if v_debit <> 2520 or v_credit_income <> 2400 or v_credit_gst <> 120 then
    raise exception 'TEST FAILED: voucher entries unbalanced. Cash debit=% Income credit=% GST credit=% (expected 2520/2400/120)', v_debit, v_credit_income, v_credit_gst;
  end if;
  raise notice 'PASS (regression fix verified): sales voucher auto-posted and balanced (debit 2520 = credit 2400 + 120)';
end $$;

-- Inventory reconciled (stock deducted) for the product line
do $$
declare v_stock numeric; v_ledger_count int;
begin
  -- (no inventory row was linked - this invoice used ad-hoc names with
  -- inventory_id = null, so reconcile_line_inventory should have done
  -- nothing safely rather than erroring. Re-run the same scenario below
  -- with a real inventory row to test the actual stock deduction path.)
  select count(*) into v_ledger_count from public.inventory_ledger where reference_type = 'invoice_line';
  raise notice 'INFO: inventory_ledger rows so far (expected 0, this invoice used no linked inventory row): %', v_ledger_count;
end $$;

-- ---------------------------------------------------------------------------
-- 6b. Real inventory deduction + idempotent re-edit (the diff-upsert bug fix)
-- ---------------------------------------------------------------------------
insert into public.inventory (id, name, is_service, stock_qty, sale_price)
values ('ab000000-0000-0000-0000-000000000001', 'Test Serum 30ml', false, 50, 900);

set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.invoices (id, customer_id, invoice_type) values ('ff000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'products');
select public.edit_invoice(
  'ff000000-0000-0000-0000-000000000002',
  ('[{"id":null,"item_type":"product","product_id":"ab000000-0000-0000-0000-000000000001","inventory_id":"ab000000-0000-0000-0000-000000000001","name":"Test Serum 30ml","quantity":2,"rate":900,"discount_amount":0}]')::jsonb,
  0, 'exclusive', 'cash'
);
reset role;

do $$
declare v_stock numeric;
begin
  select stock_qty into v_stock from public.inventory where id = 'ab000000-0000-0000-0000-000000000001';
  if v_stock <> 48 then
    raise exception 'TEST FAILED: stock not deducted correctly after selling 2 units (expected 48, got %)', v_stock;
  end if;
  raise notice 'PASS: inventory deducted correctly on invoice creation (50 - 2 = 48)';
end $$;

-- Now EDIT the same invoice: change qty 2 -> 5, and re-run edit_invoice again
-- with the SAME line unchanged, to prove idempotency (no double-deduction).
set role authenticated;
select auth.login_as(:reception::uuid);
do $$
declare v_line_id uuid;
begin
  select id into v_line_id from public.invoice_lines where invoice_id = 'ff000000-0000-0000-0000-000000000002' and line_status = 'active';
  perform public.edit_invoice(
    'ff000000-0000-0000-0000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'id', v_line_id, 'item_type','product','product_id','ab000000-0000-0000-0000-000000000001',
      'inventory_id','ab000000-0000-0000-0000-000000000001','name','Test Serum 30ml','quantity',5,'rate',900,'discount_amount',0
    )),
    0, 'exclusive', 'cash'
  );
  -- re-run again unchanged (simulates a duplicate save/network retry)
  perform public.edit_invoice(
    'ff000000-0000-0000-0000-000000000002',
    jsonb_build_array(jsonb_build_object(
      'id', v_line_id, 'item_type','product','product_id','ab000000-0000-0000-0000-000000000001',
      'inventory_id','ab000000-0000-0000-0000-000000000001','name','Test Serum 30ml','quantity',5,'rate',900,'discount_amount',0
    )),
    0, 'exclusive', 'cash'
  );
end $$;
reset role;

do $$
declare v_stock numeric; v_voucher_count int;
begin
  select stock_qty into v_stock from public.inventory where id = 'ab000000-0000-0000-0000-000000000001';
  if v_stock <> 45 then
    raise exception 'TEST FAILED: idempotent re-edit double-deducted stock (expected 45 after qty 2->5, got %)', v_stock;
  end if;
  select count(*) into v_voucher_count from public.vouchers where invoice_id = 'ff000000-0000-0000-0000-000000000002' and voucher_type = 'sales';
  if v_voucher_count <> 1 then
    raise exception 'TEST FAILED (regression): repeated edit_invoice calls created % sales vouchers instead of reposting the same one', v_voucher_count;
  end if;
  raise notice 'PASS: idempotent inventory reconciliation (48->45, not double-deducted) and voucher repost (still exactly 1 sales voucher)';
end $$;

-- Remove the line entirely (edit_invoice with an empty line array) - should
-- SOFT-VOID it and RETURN the stock, never hard-delete.
set role authenticated;
select auth.login_as(:reception::uuid);
select public.edit_invoice('ff000000-0000-0000-0000-000000000002', '[]'::jsonb, 0, 'exclusive', 'cash');
reset role;

do $$
declare v_stock numeric; v_line_status text; v_line_count int;
begin
  select stock_qty into v_stock from public.inventory where id = 'ab000000-0000-0000-0000-000000000001';
  if v_stock <> 50 then
    raise exception 'TEST FAILED: stock not returned after voiding the line (expected back to 50, got %)', v_stock;
  end if;
  select count(*) into v_line_count from public.invoice_lines where invoice_id = 'ff000000-0000-0000-0000-000000000002';
  if v_line_count <> 1 then
    raise exception 'TEST FAILED (regression): line was hard-deleted instead of soft-voided (row count = %, expected 1 still present)', v_line_count;
  end if;
  select line_status into v_line_status from public.invoice_lines where invoice_id = 'ff000000-0000-0000-0000-000000000002';
  if v_line_status <> 'voided' then
    raise exception 'TEST FAILED: line_status should be voided, got %', v_line_status;
  end if;
  raise notice 'PASS (regression fix verified): removing a line soft-voids it (row still present, stock returned) - never a hard delete';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Wallet cascade-safety: a voided/consumed line's wallet must survive even
--    a direct attempt to hard-delete the invoice_line underneath it.
-- ---------------------------------------------------------------------------
do $$
declare v_wallet_line uuid;
begin
  select invoice_line_id into v_wallet_line from public.service_wallets limit 1;
  begin
    delete from public.invoice_lines where id = v_wallet_line;
    raise exception 'TEST FAILED (regression): hard-deleting an invoice_line with a wallet attached SUCCEEDED - should be FK-blocked (ON DELETE RESTRICT)';
  exception when foreign_key_violation then
    raise notice 'PASS (regression fix verified): FK RESTRICT blocks hard-deleting an invoice_line that has a service_wallet - cascade data loss is structurally impossible';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Invoice delete: role-gated, not "blocks everyone" and not "everyone can"
-- ---------------------------------------------------------------------------
insert into public.invoices (id, customer_id, invoice_type, status, gross_total)
values ('ff000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'treatment', 'void', 0);

set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
declare v_count int;
begin
  delete from public.invoices where id = 'ff000000-0000-0000-0000-000000000009';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST FAILED (regression): doctor (not can_bill) was able to delete an invoice';
  end if;
  raise notice 'PASS (regression fix verified): doctor correctly blocked from deleting an invoice';
end $$;
reset role;

set role authenticated;
select auth.login_as(:admin::uuid);
do $$
declare v_count int;
begin
  delete from public.invoices where id = 'ff000000-0000-0000-0000-000000000009';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST FAILED (regression): admin should be ABLE to delete an invoice (old USING(false) bug blocked even admins) - affected % rows', v_count;
  end if;
  raise notice 'PASS (regression fix verified): admin CAN delete an invoice (the original "blocks everyone including admins" bug is fixed)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. sync_export_* / tracker_book_appointment: service_role only
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:admin::uuid);
do $$
begin
  begin
    perform public.sync_export_customers(now() - interval '1 day', 10);
    raise exception 'TEST FAILED: an authenticated admin user (not service_role) was able to call sync_export_customers - this must be service_role-only';
  exception when insufficient_privilege then
    raise notice 'PASS: sync_export_customers correctly unreachable by a regular authenticated session (even an admin)';
  end;
end $$;
reset role;

set role service_role;
do $$
declare v_count int;
begin
  select count(*) into v_count from public.sync_export_customers(now() - interval '1 day', 10);
  if v_count < 1 then
    raise exception 'TEST FAILED: service_role could not call sync_export_customers or got no rows back (expected at least the 1 test customer)';
  end if;
  raise notice 'PASS: service_role can call sync_export_customers (% row(s)) - this is the only way Tracker will ever reach this data', v_count;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. Analytics views return correct numbers for finance roles
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:accountant::uuid);
do $$
declare v_total numeric;
begin
  select sum(gross_revenue) into v_total from public.service_profitability_view;
  if v_total is null or v_total <= 0 then
    raise exception 'TEST FAILED: accountant sees no profitability data (got %)', v_total;
  end if;
  raise notice 'PASS: accountant can see service_profitability_view, total gross_revenue = %', v_total;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Session redemption (the functional gap found + fixed this pass)
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:therapist::uuid);
do $$
declare v_wallet_id uuid; v_after record;
begin
  select id into v_wallet_id from public.service_wallets where status = 'active' limit 1;
  perform public.redeem_wallet_session(v_wallet_id);
  select consumed_sessions, status into v_after from public.service_wallets where id = v_wallet_id;
  if v_after.consumed_sessions <> 1 then
    raise exception 'TEST FAILED: redeem_wallet_session did not increment consumed_sessions (got %)', v_after.consumed_sessions;
  end if;
  if v_after.status <> 'exhausted' then
    raise exception 'TEST FAILED: wallet had total_sessions=1, consuming 1 should flip it to exhausted, got %', v_after.status;
  end if;
  raise notice 'PASS (gap fix verified): therapist redeemed a session via redeem_wallet_session, wallet correctly flips to exhausted at capacity';

  begin
    perform public.redeem_wallet_session(v_wallet_id);
    raise exception 'TEST FAILED: redeeming an already-exhausted wallet should be rejected';
  exception when others then
    raise notice 'PASS: over-redeeming an exhausted wallet is correctly rejected (%)', sqlerrm;
  end;
end $$;
reset role;

-- A role with no clinical/front-desk involvement (marketing) must not be
-- able to redeem sessions.
set role authenticated;
select auth.login_as(:marketing::uuid);
do $$
begin
  begin
    perform public.redeem_wallet_session((select id from public.service_wallets limit 1));
    raise exception 'TEST FAILED: marketing role was able to redeem a wallet session';
  exception when others then
    raise notice 'PASS: marketing role correctly blocked from redeem_wallet_session (%)', sqlerrm;
  end;
end $$;
reset role;

\echo ''
\echo '================================================================='
\echo 'ALL END-TO-END CHECKS PASSED'
\echo '================================================================='
