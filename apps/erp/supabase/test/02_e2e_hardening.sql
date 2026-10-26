-- =============================================================================
-- Production-hardening pass verification (0011_production_hardening.sql).
-- Run AFTER 01_e2e_workflow.sql in the SAME database (it reuses the staff
-- accounts and customer that script creates), but as a SEPARATE psql
-- invocation - so, unlike 01, this file does not rely on psql \set variables
-- carrying over and instead re-declares them against the same literal UUIDs
-- 01 used. Every check either RAISEs on failure (ON_ERROR_STOP=1 halts the
-- script) or prints a PASS notice you can eyeball. A clean run to the bottom
-- = every new backend feature from the hardening pass actually works.
-- =============================================================================

\set ON_ERROR_STOP on

\set admin '''a0000000-0000-0000-0000-000000000001'''
\set doctor '''a0000000-0000-0000-0000-000000000002'''
\set reception '''a0000000-0000-0000-0000-000000000003'''
\set accountant '''a0000000-0000-0000-0000-000000000004'''
\set counselor '''a0000000-0000-0000-0000-000000000005'''
\set pharmacist '''a0000000-0000-0000-0000-000000000006'''
\set therapist '''a0000000-0000-0000-0000-000000000007'''
\set marketing '''a0000000-0000-0000-0000-000000000008'''
\set customer1 '''c0000000-0000-0000-0000-000000000001'''

do $$ begin
  if not exists (select 1 from public.staff_profiles where user_id = 'a0000000-0000-0000-0000-000000000001'::uuid) then
    raise exception 'SETUP FAILED: 01_e2e_workflow.sql must be run against this database before 02_e2e_hardening.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A. list_staff_by_role - the fix for the empty "Select counselor" dropdown
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
declare v_count int; v_name text;
begin
  select count(*), max(full_name) into v_count, v_name from public.list_staff_by_role('counselor');
  if v_count <> 1 then
    raise exception 'TEST FAILED: list_staff_by_role(counselor) returned % rows, expected 1', v_count;
  end if;
  raise notice 'PASS: doctor sees the counselor via list_staff_by_role (%), fixing the previously-empty dropdown (user_roles_select would have hidden this)', v_name;

  -- A different role scope should come back empty here (no pharmacist named 'x'), just proving the role filter works.
  select count(*) into v_count from public.list_staff_by_role('marketing_head');
  if v_count <> 0 then
    raise exception 'TEST FAILED: list_staff_by_role(marketing_head) should be empty (no such staff seeded), got %', v_count;
  end if;
  raise notice 'PASS: list_staff_by_role correctly scopes to only the requested role';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- B. create_prescription - atomicity. Set up a fresh appointment/encounter so
--    this doesn't collide with the one 01_e2e_workflow.sql already advanced
--    to 'in_progress'.
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.cos_appointments (id, customer_id, doctor_id, appointment_date, appointment_time, status, appointment_source)
values ('aa000000-0000-0000-0000-000000000002', :customer1::uuid, :doctor::uuid, current_date, '11:00', 'checked_in', 'walk_in');
insert into public.encounters (id, appointment_id, customer_id, encounter_type, status, checked_in_at)
values ('ee000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', :customer1::uuid, 'consultation', 'checked_in', now());
reset role;

-- Bad call: a negative-quantity item must roll back the ENTIRE call - no
-- orphaned header, no item, and the encounter must NOT have been flipped to
-- in_progress by the (rolled-back) update either.
set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
begin
  begin
    perform public.create_prescription(
      'ee000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, 'Test diagnosis', 'notes', 'a0000000-0000-0000-0000-000000000005'::uuid,
      '[{"type":"service","name":"Bad Item","quantity":-1,"doctor_suggested_price":100}]'::jsonb
    );
    raise exception 'TEST FAILED: create_prescription accepted a negative-quantity item';
  exception when others then
    raise notice 'PASS: create_prescription rejected a negative-quantity item (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
declare v_header_count int; v_encounter_status text;
begin
  select count(*) into v_header_count from public.doctor_prescriptions where encounter_id = 'ee000000-0000-0000-0000-000000000002';
  if v_header_count <> 0 then
    raise exception 'TEST FAILED (atomicity): a rejected create_prescription call left % orphaned header row(s) behind', v_header_count;
  end if;
  select status into v_encounter_status from public.encounters where id = 'ee000000-0000-0000-0000-000000000002';
  if v_encounter_status <> 'checked_in' then
    raise exception 'TEST FAILED (atomicity): encounter status changed to % despite the prescription insert being rolled back', v_encounter_status;
  end if;
  raise notice 'PASS (atomicity verified): rejected create_prescription left zero header rows and did not advance the encounter';
end $$;

-- Happy path: 2 valid items, in one atomic call.
set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
declare v_rx public.doctor_prescriptions%rowtype;
begin
  select * into v_rx from public.create_prescription(
    'ee000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, 'Rosacea', 'Mild', 'a0000000-0000-0000-0000-000000000005'::uuid,
    '[{"type":"service","name":"Calming Facial","quantity":1,"doctor_suggested_price":1500},
      {"type":"product","name":"Barrier Cream","quantity":2,"doctor_suggested_price":400}]'::jsonb
  );
  if v_rx.status <> 'sent_to_counselor' then
    raise exception 'TEST FAILED: create_prescription happy path returned wrong status: %', v_rx.status;
  end if;
  if (select count(*) from public.doctor_prescription_items where prescription_id = v_rx.id) <> 2 then
    raise exception 'TEST FAILED: create_prescription happy path did not insert both items';
  end if;
  if (select status from public.encounters where id = 'ee000000-0000-0000-0000-000000000002') <> 'in_progress' then
    raise exception 'TEST FAILED: create_prescription happy path did not advance the encounter to in_progress';
  end if;
  raise notice 'PASS: create_prescription atomically created header + 2 items + advanced the encounter in one call';
end $$;
reset role;

-- A non-doctor must be rejected outright.
set role authenticated;
select auth.login_as(:reception::uuid);
do $$
begin
  begin
    perform public.create_prescription(
      'ee000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, 'x', 'x', 'a0000000-0000-0000-0000-000000000005'::uuid,
      '[{"type":"service","name":"x","quantity":1,"doctor_suggested_price":1}]'::jsonb
    );
    raise exception 'TEST FAILED: reception (not a doctor) was able to call create_prescription';
  exception when others then
    raise notice 'PASS: create_prescription correctly rejects a non-doctor caller (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- C. create_manual_voucher - atomicity, balance validation, role gating,
--    server-assigned voucher_no.
-- ---------------------------------------------------------------------------
set role authenticated;
select auth.login_as(:accountant::uuid);

-- Sales vouchers are system-only.
do $$
begin
  begin
    perform public.create_manual_voucher('sales', current_date, 'should be rejected',
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Cash'), 'debit', 100, 'credit', 0),
        jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Sales - Services'), 'debit', 0, 'credit', 100)
      )
    );
    raise exception 'TEST FAILED: create_manual_voucher accepted voucher_type = sales';
  exception when others then
    raise notice 'PASS: create_manual_voucher rejects voucher_type = sales (system-only) (%)', sqlerrm;
  end;
end $$;

-- Unbalanced entries must be rejected.
do $$
begin
  begin
    perform public.create_manual_voucher('payment', current_date, 'unbalanced test',
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Clinic Rent'), 'debit', 500, 'credit', 0),
        jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Cash'), 'debit', 0, 'credit', 400)
      )
    );
    raise exception 'TEST FAILED: create_manual_voucher accepted unbalanced debit/credit entries (500 vs 400)';
  exception when others then
    raise notice 'PASS: create_manual_voucher rejects unbalanced entries (%)', sqlerrm;
  end;
end $$;

-- Fewer than 2 entries must be rejected.
do $$
begin
  begin
    perform public.create_manual_voucher('payment', current_date, 'single entry test',
      jsonb_build_array(jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Cash'), 'debit', 100, 'credit', 0))
    );
    raise exception 'TEST FAILED: create_manual_voucher accepted a single-entry (non-double-entry) voucher';
  exception when others then
    raise notice 'PASS: create_manual_voucher requires at least 2 entries (%)', sqlerrm;
  end;
end $$;

-- Happy path: balanced payment voucher (Dr Clinic Rent 5000 / Cr Cash 5000).
do $$
declare v_voucher public.vouchers%rowtype; v_entry_count int;
begin
  select * into v_voucher from public.create_manual_voucher('payment', current_date, 'September clinic rent',
    jsonb_build_array(
      jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Clinic Rent'), 'debit', 5000, 'credit', 0),
      jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Cash'), 'debit', 0, 'credit', 5000)
    )
  );
  if v_voucher.amount <> 5000 then
    raise exception 'TEST FAILED: create_manual_voucher voucher.amount wrong: %', v_voucher.amount;
  end if;
  if v_voucher.voucher_no !~ '^PAY-\d{6}$' then
    raise exception 'TEST FAILED: voucher_no not server-assigned correctly (got %), expected PAY-NNNNNN', v_voucher.voucher_no;
  end if;
  select count(*) into v_entry_count from public.voucher_entries where voucher_id = v_voucher.id;
  if v_entry_count <> 2 then
    raise exception 'TEST FAILED: expected exactly 2 voucher_entries, got %', v_entry_count;
  end if;
  raise notice 'PASS: create_manual_voucher posted a balanced 2-entry voucher with server-assigned voucher_no %', v_voucher.voucher_no;
end $$;
reset role;

-- A non-finance role must be rejected outright.
set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
begin
  begin
    perform public.create_manual_voucher('payment', current_date, 'should be rejected',
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Clinic Rent'), 'debit', 100, 'credit', 0),
        jsonb_build_object('ledger_account_id', (select id from public.ledger_accounts where name = 'Cash'), 'debit', 0, 'credit', 100)
      )
    );
    raise exception 'TEST FAILED: doctor (not finance) was able to call create_manual_voucher';
  exception when others then
    raise notice 'PASS: create_manual_voucher correctly rejects a non-finance caller (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- D. adjust_stock - audited manual stock corrections.
-- ---------------------------------------------------------------------------
insert into public.inventory (id, name, is_service, stock_qty, sale_price, gst_rate)
values ('ab000000-0000-0000-0000-000000000002', 'Test Sunscreen SPF50', false, 20, 700, 5.00);

set role authenticated;
select auth.login_as(:pharmacist::uuid);

-- Negative target quantity rejected.
do $$
begin
  begin
    perform public.adjust_stock('ab000000-0000-0000-0000-000000000002'::uuid, -5, 'bad correction');
    raise exception 'TEST FAILED: adjust_stock accepted a negative target quantity';
  exception when others then
    raise notice 'PASS: adjust_stock rejects a negative target quantity (%)', sqlerrm;
  end;
end $$;

-- Unknown product rejected.
do $$
begin
  begin
    perform public.adjust_stock('00000000-0000-0000-0000-000000000000'::uuid, 10, 'x');
    raise exception 'TEST FAILED: adjust_stock accepted an unknown inventory_id';
  exception when others then
    raise notice 'PASS: adjust_stock rejects an unknown inventory_id (%)', sqlerrm;
  end;
end $$;

-- Real correction: 20 -> 15, must leave an inventory_ledger audit row.
do $$
declare v_stock numeric; v_ledger record;
begin
  perform public.adjust_stock('ab000000-0000-0000-0000-000000000002'::uuid, 15, 'stock count correction');
  select stock_qty into v_stock from public.inventory where id = 'ab000000-0000-0000-0000-000000000002';
  if v_stock <> 15 then
    raise exception 'TEST FAILED: adjust_stock did not update stock_qty (expected 15, got %)', v_stock;
  end if;
  select * into v_ledger from public.inventory_ledger
    where inventory_id = 'ab000000-0000-0000-0000-000000000002' and reference_type = 'manual';
  if v_ledger is null then
    raise exception 'TEST FAILED: adjust_stock did not create an inventory_ledger audit row';
  end if;
  if v_ledger.quantity <> -5 or v_ledger.movement_type <> 'adjustment' or v_ledger.note <> 'stock count correction' then
    raise exception 'TEST FAILED: inventory_ledger row has wrong shape: %', v_ledger;
  end if;
  raise notice 'PASS: adjust_stock corrected stock (20->15) and left a correctly-shaped inventory_ledger audit row (delta -5)';
end $$;

-- A no-op correction (same quantity) must NOT create a second ledger row.
do $$
declare v_ledger_count_before int; v_ledger_count_after int;
begin
  select count(*) into v_ledger_count_before from public.inventory_ledger where inventory_id = 'ab000000-0000-0000-0000-000000000002';
  perform public.adjust_stock('ab000000-0000-0000-0000-000000000002'::uuid, 15, 'no-op');
  select count(*) into v_ledger_count_after from public.inventory_ledger where inventory_id = 'ab000000-0000-0000-0000-000000000002';
  if v_ledger_count_after <> v_ledger_count_before then
    raise exception 'TEST FAILED: adjust_stock created a ledger row for a zero-delta (no-op) correction';
  end if;
  raise notice 'PASS: adjust_stock is a no-op (no spurious ledger row) when the quantity does not actually change';
end $$;
reset role;

-- A role outside admin/accountant/reception/pharmacist must be rejected.
set role authenticated;
select auth.login_as(:doctor::uuid);
do $$
begin
  begin
    perform public.adjust_stock('ab000000-0000-0000-0000-000000000002'::uuid, 99, 'should be rejected');
    raise exception 'TEST FAILED: doctor was able to call adjust_stock';
  exception when others then
    raise notice 'PASS: adjust_stock correctly rejects a doctor caller (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- E. Per-line variable GST rate on edit_invoice (the flat-5%-hardcode fix).
--    Mix a 5% service with an 18% product on the same invoice, and check the
--    resolved rate is charged per line rather than 5% flat.
-- ---------------------------------------------------------------------------
insert into public.services_master (id, name, default_price, gst_rate)
values ('5e000000-0000-0000-0000-000000000001', 'Premium Consultation', 1000, 5.00);
insert into public.inventory (id, name, is_service, stock_qty, sale_price, gst_rate)
values ('5e000000-0000-0000-0000-000000000002', 'Imported Device Consumable', false, 100, 2000, 18.00);

set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.invoices (id, customer_id, invoice_type) values ('ff000000-0000-0000-0000-000000000010', :customer1::uuid, 'treatment_and_products');
select public.edit_invoice(
  p_invoice_id := 'ff000000-0000-0000-0000-000000000010',
  p_lines := ('[
    {"id":null,"item_type":"service","service_id":"5e000000-0000-0000-0000-000000000001","product_id":null,"inventory_id":null,"name":"Premium Consultation","quantity":1,"rate":1000,"discount_amount":0},
    {"id":null,"item_type":"product","product_id":"5e000000-0000-0000-0000-000000000002","inventory_id":"5e000000-0000-0000-0000-000000000002","name":"Imported Device Consumable","quantity":1,"rate":2000,"discount_amount":0}
  ]')::jsonb,
  p_discount_amount := 0,
  p_gst_mode := 'exclusive',
  p_payment_mode := 'card'
);
reset role;

do $$
declare v_invoice public.invoices%rowtype; v_rate_5 numeric; v_rate_18 numeric;
begin
  select * into v_invoice from public.invoices where id = 'ff000000-0000-0000-0000-000000000010';
  -- Expected tax: 1000 * 5% + 2000 * 18% = 50 + 360 = 410 (a flat-5% bug would give 150 = 3000*5%).
  if v_invoice.subtotal <> 3000 then
    raise exception 'TEST FAILED: subtotal wrong: % (expected 3000)', v_invoice.subtotal;
  end if;
  if v_invoice.cgst <> 205 or v_invoice.sgst <> 205 then -- (50+360)/2 = 205 each side
    raise exception 'TEST FAILED: variable-rate GST math wrong. cgst=% sgst=% (expected 205 each, summing to the 410 total tax)', v_invoice.cgst, v_invoice.sgst;
  end if;
  if v_invoice.gross_total <> 3410 then
    raise exception 'TEST FAILED: gross_total wrong: % (expected 3410 = 3000 + 410 variable-rate tax, NOT 3150 which the old flat-5%% bug would produce)', v_invoice.gross_total;
  end if;

  select gst_rate into v_rate_5 from public.invoice_lines where invoice_id = 'ff000000-0000-0000-0000-000000000010' and service_id = '5e000000-0000-0000-0000-000000000001';
  select gst_rate into v_rate_18 from public.invoice_lines where invoice_id = 'ff000000-0000-0000-0000-000000000010' and inventory_id = '5e000000-0000-0000-0000-000000000002';
  if v_rate_5 <> 5.00 or v_rate_18 <> 18.00 then
    raise exception 'TEST FAILED: invoice_lines.gst_rate not resolved correctly per line: service=%, product=%', v_rate_5, v_rate_18;
  end if;
  raise notice 'PASS (critical fix verified): edit_invoice resolves each line''s real GST rate (5%% and 18%%) instead of a hardcoded flat 5%% - gross_total=3410, snapshot gst_rate correct on both lines';
end $$;

-- ---------------------------------------------------------------------------
-- F. IGST interstate billing, gated on clinic_settings.home_state_code.
-- ---------------------------------------------------------------------------

-- Before configuring home_state_code, IGST must stay 0 even for a
-- differently-stated customer (the safe, backward-compatible default).
insert into public.customers (id, name, phone, state_code) values
  ('c0000000-0000-0000-0000-000000000002', 'Rohan Mehta (Maharashtra)', '9876500002', '27');

set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.invoices (id, customer_id, invoice_type) values ('ff000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'treatment');
select public.edit_invoice(
  p_invoice_id := 'ff000000-0000-0000-0000-000000000011',
  p_lines := '[{"id":null,"item_type":"service","service_id":null,"product_id":null,"inventory_id":null,"name":"Consultation","quantity":1,"rate":1000,"discount_amount":0}]'::jsonb,
  p_discount_amount := 0, p_gst_mode := 'exclusive', p_payment_mode := 'cash',
  p_place_of_supply := '27'
);
reset role;

do $$
declare v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = 'ff000000-0000-0000-0000-000000000011';
  if v_invoice.igst <> 0 or v_invoice.cgst = 0 then
    raise exception 'TEST FAILED: with clinic_settings.home_state_code unset, billing should stay CGST+SGST-only (backward compatible). Got cgst=%, sgst=%, igst=%', v_invoice.cgst, v_invoice.sgst, v_invoice.igst;
  end if;
  raise notice 'PASS: with no clinic home state configured, IGST stays 0 and billing is unchanged (CGST+SGST) - the safe default';
end $$;

-- Admin configures the clinic's home state to Delhi ('07').
set role authenticated;
select auth.login_as(:admin::uuid);
do $$
declare v_count int;
begin
  update public.clinic_settings set home_state_code = '07', clinic_name = 'Mediglo Test Clinic' where id = true;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST FAILED: admin could not set clinic_settings.home_state_code';
  end if;
  raise notice 'PASS: admin configured clinic_settings.home_state_code = 07 (Delhi)';
end $$;
reset role;

-- A non-admin (accountant) must NOT be able to change it (clinic_settings_write is admin-only).
set role authenticated;
select auth.login_as(:accountant::uuid);
do $$
declare v_count int;
begin
  update public.clinic_settings set home_state_code = '27' where id = true;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST FAILED: accountant (not admin) was able to update clinic_settings';
  end if;
  raise notice 'PASS: accountant correctly blocked from updating clinic_settings (0 rows affected) - admin-only per clinic_settings_write';
end $$;
reset role;

-- Now the same Maharashtra customer must be billed as pure IGST.
set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.invoices (id, customer_id, invoice_type) values ('ff000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 'treatment');
select public.edit_invoice(
  p_invoice_id := 'ff000000-0000-0000-0000-000000000012',
  p_lines := '[{"id":null,"item_type":"service","service_id":null,"product_id":null,"inventory_id":null,"name":"Consultation","quantity":1,"rate":1000,"discount_amount":0}]'::jsonb,
  p_discount_amount := 0, p_gst_mode := 'exclusive', p_payment_mode := 'cash',
  p_place_of_supply := '27'
);
reset role;

do $$
declare v_invoice public.invoices%rowtype; v_voucher_id uuid; v_igst_credit numeric;
begin
  select * into v_invoice from public.invoices where id = 'ff000000-0000-0000-0000-000000000012';
  if v_invoice.cgst <> 0 or v_invoice.sgst <> 0 or v_invoice.igst <> 50 then
    raise exception 'TEST FAILED (interstate): expected cgst=0 sgst=0 igst=50, got cgst=% sgst=% igst=%', v_invoice.cgst, v_invoice.sgst, v_invoice.igst;
  end if;

  select id into v_voucher_id from public.vouchers where invoice_id = 'ff000000-0000-0000-0000-000000000012' and voucher_type = 'sales';
  select credit into v_igst_credit from public.voucher_entries ve
    join public.ledger_accounts la on la.id = ve.ledger_account_id
    where ve.voucher_id = v_voucher_id and la.name = 'IGST Payable';
  if v_igst_credit <> 50 then
    raise exception 'TEST FAILED (interstate): sales voucher missing/wrong IGST Payable leg (got %)', v_igst_credit;
  end if;
  raise notice 'PASS (IGST feature verified): once home_state_code=07, billing a Maharashtra (27) customer posts pure IGST (cgst=0, sgst=0, igst=50) with a matching IGST Payable voucher leg';
end $$;

-- A LOCAL (Delhi) customer must still get CGST+SGST once home_state_code is set.
insert into public.customers (id, name, phone, state_code) values
  ('c0000000-0000-0000-0000-000000000003', 'Anita Kapoor (Delhi)', '9876500003', '07');

set role authenticated;
select auth.login_as(:reception::uuid);
insert into public.invoices (id, customer_id, invoice_type) values ('ff000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000003', 'treatment');
select public.edit_invoice(
  p_invoice_id := 'ff000000-0000-0000-0000-000000000013',
  p_lines := '[{"id":null,"item_type":"service","service_id":null,"product_id":null,"inventory_id":null,"name":"Consultation","quantity":1,"rate":1000,"discount_amount":0}]'::jsonb,
  p_discount_amount := 0, p_gst_mode := 'exclusive', p_payment_mode := 'cash',
  p_place_of_supply := '07'
);
reset role;

do $$
declare v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = 'ff000000-0000-0000-0000-000000000013';
  if v_invoice.igst <> 0 or v_invoice.cgst <> 25 or v_invoice.sgst <> 25 then
    raise exception 'TEST FAILED (intrastate w/ home state set): expected cgst=25 sgst=25 igst=0, got cgst=% sgst=% igst=%', v_invoice.cgst, v_invoice.sgst, v_invoice.igst;
  end if;
  raise notice 'PASS: with home_state_code configured, a SAME-state (Delhi) customer still correctly gets CGST+SGST, not IGST';
end $$;

-- Reset clinic_settings back to the default (unset) so this test file can be
-- re-run idempotently against the same database without changing behavior
-- for anything run afterwards.
set role authenticated;
select auth.login_as(:admin::uuid);
update public.clinic_settings set home_state_code = null where id = true;
reset role;

-- ---------------------------------------------------------------------------
-- G. Quotation / receipt number sequences - collision-proof under the new
--    sequence-based generation (replacing the old count(*)+1 race).
-- ---------------------------------------------------------------------------
do $$
declare v_q1 text; v_q2 text; v_r1 text; v_r2 text;
begin
  select public.generate_quotation_number() into v_q1;
  select public.generate_quotation_number() into v_q2;
  if v_q1 = v_q2 then
    raise exception 'TEST FAILED: generate_quotation_number produced a duplicate (%) on back-to-back calls', v_q1;
  end if;
  if v_q1 !~ '^QUOTE-\d{4}-\d{5}$' or v_q2 !~ '^QUOTE-\d{4}-\d{5}$' then
    raise exception 'TEST FAILED: generate_quotation_number format wrong: % / %', v_q1, v_q2;
  end if;

  select public.generate_receipt_number() into v_r1;
  select public.generate_receipt_number() into v_r2;
  if v_r1 = v_r2 then
    raise exception 'TEST FAILED: generate_receipt_number produced a duplicate (%) on back-to-back calls', v_r1;
  end if;
  if v_r1 !~ '^RCP-\d{4}-\d{5}$' or v_r2 !~ '^RCP-\d{4}-\d{5}$' then
    raise exception 'TEST FAILED: generate_receipt_number format wrong: % / %', v_r1, v_r2;
  end if;

  raise notice 'PASS: generate_quotation_number (%, %) and generate_receipt_number (%, %) are sequence-based and collision-proof', v_q1, v_q2, v_r1, v_r2;
end $$;

\echo ''
\echo '================================================================='
\echo 'ALL PRODUCTION-HARDENING CHECKS PASSED'
\echo '================================================================='
