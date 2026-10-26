-- =============================================================================
-- 0011_production_hardening.sql
-- "Take the ERP to production-ready" pass: two independent code-audit agents
-- read every page against the real schema/RLS and found real, reachable bugs.
-- This migration carries every backend-side fix. The matching frontend fixes
-- are in the same commit. See README.md "Production hardening pass" for the
-- full list with severities.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clinic settings - a one-row table so the GST engine knows the clinic's
--    own state (for CGST+SGST vs IGST) without hardcoding a guess. Left
--    unset (home_state_code = null) by default, which preserves the exact
--    prior behaviour (always CGST+SGST) until an admin explicitly sets it
--    from the new Clinic Settings card on the Staff page - this is a real
--    compliance decision and a single-branch clinic serving only local,
--    intrastate customers may never need to touch it.
-- ---------------------------------------------------------------------------
create table public.clinic_settings (
  id boolean primary key default true check (id),   -- singleton row
  clinic_name text,
  home_state_code text references public.gst_state_codes(code),
  updated_at timestamptz not null default now()
);

insert into public.clinic_settings (id) values (true) on conflict (id) do nothing;

create trigger set_updated_at_clinic_settings before update on public.clinic_settings
  for each row execute function app_private.set_updated_at();

alter table public.clinic_settings enable row level security;

create policy clinic_settings_select on public.clinic_settings for select
  using (auth.uid() is not null);
create policy clinic_settings_write on public.clinic_settings for update
  using (app_private.is_admin(auth.uid())) with check (app_private.is_admin(auth.uid()));

create or replace function app_private.clinic_home_state()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select home_state_code from public.clinic_settings where id = true;
$$;

-- ---------------------------------------------------------------------------
-- 2. IGST support - the schema already tracked customers.state_code and
--    invoices.place_of_supply for exactly this, and public.vouchers already
--    had an igst column, but public.invoices never did and nothing ever
--    computed it - every sale was posted as CGST+SGST even where the
--    customer's recorded state differed from the clinic's own. Fixed in
--    edit_invoice() below, gated on clinic_settings.home_state_code being
--    explicitly set (see comment above).
-- ---------------------------------------------------------------------------
alter table public.invoices add column igst numeric(10,2) not null default 0;

insert into public.ledger_accounts (name, account_group, is_system) values
  ('IGST Payable', 'liabilities', true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Per-line GST rate - CRITICAL fix. edit_invoice() previously hardcoded
--    a flat 5% for every invoice regardless of the per-item gst_rate that
--    InventoryPage lets admin/accountant configure on services_master /
--    inventory (some real treatments/products are taxed at 12% or 18%).
--    Changing a product's GST% had silently had zero effect on any invoice.
--    invoice_lines.gst_rate is a snapshot of the rate actually resolved and
--    charged at billing time (looked up live from the master tables via
--    service_id/inventory_id, NOT a stale copy from an earlier doctor
--    recommendation or counselor quotation) so a later master-rate change
--    never rewrites the tax on an already-posted invoice, and so
--    TaxExportPage can show the rate that was actually charged.
-- ---------------------------------------------------------------------------
alter table public.invoice_lines add column gst_rate numeric(5,2);

-- ---------------------------------------------------------------------------
-- 4. Voucher numbering - the frontend was generating voucher_no client-side
--    as `${type}-${Date.now().toString().slice(-6)}`, which repeats every
--    ~16.7 minutes and collides with the `voucher_no unique` constraint.
--    Also: auto-posted 'sales' vouchers from edit_invoice() never got a
--    voucher_no at all (always null) - this single sequence+trigger fixes
--    both at once.
-- ---------------------------------------------------------------------------
create sequence if not exists public.voucher_no_seq start 1;

create or replace function public.next_voucher_no(p_voucher_type public.voucher_type)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
begin
  v_prefix := case p_voucher_type
    when 'sales' then 'SAL'
    when 'purchase' then 'PUR'
    when 'payment' then 'PAY'
    when 'receipt' then 'RCT'
    when 'contra' then 'CON'
    when 'credit_note' then 'CRN'
    when 'debit_note' then 'DRN'
  end;
  return v_prefix || '-' || lpad(nextval('public.voucher_no_seq')::text, 6, '0');
end;
$$;

grant execute on function public.next_voucher_no(public.voucher_type) to authenticated;

create or replace function app_private.set_voucher_no()
returns trigger
language plpgsql
as $$
begin
  if new.voucher_no is null or new.voucher_no = '' then
    new.voucher_no := public.next_voucher_no(new.voucher_type);
  end if;
  return new;
end;
$$;

create trigger set_voucher_no_on_insert
  before insert on public.vouchers
  for each row execute function app_private.set_voucher_no();

-- ---------------------------------------------------------------------------
-- 5. Quotation / receipt numbering - both were `count(*) + 1`, which two
--    counselors/pharmacists finalizing at the same moment can compute
--    identically, hitting the `unique` constraint and surfacing as a raw,
--    confusing save failure. Switched to a real sequence per the same
--    pattern next_invoice_no() already used - still globally unique and
--    monotonic; the "how many this year" framing is now a running count
--    rather than a strict per-year reset, which is a fine trade for
--    guaranteed correctness under concurrency.
-- ---------------------------------------------------------------------------
create sequence if not exists public.quotation_no_seq start 1;
create sequence if not exists public.receipt_no_seq start 1;

create or replace function public.generate_quotation_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'QUOTE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quotation_no_seq')::text, 5, '0');
$$;

create or replace function public.generate_receipt_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'RCP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_no_seq')::text, 5, '0');
$$;

-- ---------------------------------------------------------------------------
-- 6. list_staff_by_role - CRITICAL fix. DoctorRoomPage's "Select counselor"
--    dropdown queried public.user_roles directly filtered to role='counselor',
--    but user_roles_select only lets a non-admin see their OWN role row - so
--    the dropdown was silently empty for every real (non-admin) doctor,
--    hard-blocking the entire Doctor -> Counselor handoff. A SECURITY
--    DEFINER function scoped to exactly "id + name for this one role" is
--    the fix, rather than widening user_roles SELECT itself (which would
--    let any staff member enumerate everyone's full role list).
-- ---------------------------------------------------------------------------
create or replace function public.list_staff_by_role(p_role public.staff_role)
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select ur.user_id, sp.full_name
  from public.user_roles ur
  join public.staff_profiles sp on sp.user_id = ur.user_id
  where ur.role = p_role and sp.active = true
  order by sp.full_name;
$$;

grant execute on function public.list_staff_by_role(public.staff_role) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. create_prescription - atomic doctor-prescription creation. Previously
--    the frontend ran THREE separate calls (insert header, insert items,
--    update encounter) with no transaction tying them together. A failure
--    on the second or third call (e.g. a negative quantity tripping the
--    doctor_prescription_items quantity>0 check) left a permanently
--    orphaned, zero-item prescription sitting in the counselor's queue with
--    no way for anyone to add items or remove it (counselor's Finalize
--    button requires items.length > 0). Wrapping all three writes in one
--    plpgsql function means a failure on the items insert rolls back the
--    header insert too - nothing partial is ever left behind.
-- ---------------------------------------------------------------------------
create or replace function public.create_prescription(
  p_encounter_id uuid,
  p_customer_id uuid,
  p_diagnosis text,
  p_clinical_notes text,
  p_counselor_id uuid,
  p_items jsonb
)
returns public.doctor_prescriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_prescription public.doctor_prescriptions%rowtype;
begin
  if not app_private.has_role(auth.uid(), 'doctor') then
    raise exception 'only a doctor can create a prescription';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'add at least one service or product before sending to a counselor';
  end if;
  if p_counselor_id is null then
    raise exception 'select a counselor to send this to';
  end if;

  -- Validate every item BEFORE writing anything, so a bad row never leaves
  -- a half-written prescription behind.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
      raise exception 'quantity must be positive for every item (got % for "%")',
        v_item->>'quantity', v_item->>'name';
    end if;
  end loop;

  insert into public.doctor_prescriptions (
    encounter_id, customer_id, doctor_id, diagnosis, clinical_notes,
    status, sent_to_counselor_at, sent_to_counselor_id
  ) values (
    p_encounter_id, p_customer_id, auth.uid(), p_diagnosis, p_clinical_notes,
    'sent_to_counselor', now(), p_counselor_id
  )
  returning * into v_prescription;

  -- NOTE: the FROM-clause alias here is deliberately NOT v_item - reusing
  -- the declared plpgsql variable name as a query alias makes every
  -- `v_item->>'...'` in the SELECT list ambiguous between "the plpgsql
  -- variable" and "the FROM-clause row", which Postgres rejects outright
  -- (42702, not a warning) - this RPC would fail on every real call with
  -- at least one item. Caught by 02_e2e_hardening.sql's happy-path check.
  insert into public.doctor_prescription_items (
    prescription_id, item_type, service_id, product_id, name, quantity, doctor_suggested_price, doctor_notes
  )
  select
    v_prescription.id,
    v_elem->>'type',
    nullif(v_elem->>'service_id','')::uuid,
    nullif(v_elem->>'product_id','')::uuid,
    v_elem->>'name',
    (v_elem->>'quantity')::numeric,
    coalesce((v_elem->>'doctor_suggested_price')::numeric, 0),
    v_elem->>'doctor_notes'
  from jsonb_array_elements(p_items) as v_elem;

  update public.encounters
    set status = 'in_progress', started_at = now(), started_by = auth.uid()
    where id = p_encounter_id;

  return v_prescription;
end;
$$;

grant execute on function public.create_prescription(uuid, uuid, text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. create_manual_voucher - atomic manual double-entry posting for the
--    Accounting page. Previously the frontend ran two separate inserts
--    (vouchers, then voucher_entries) with no transaction: a failure on the
--    second insert left a voucher header with a real amount and ZERO
--    entries - a broken double-entry invariant on the one page whose whole
--    purpose is enforcing double-entry bookkeeping. This RPC also rejects
--    an unbalanced entry set outright (defense in depth beyond the
--    per-row `debit=0 or credit=0` check, which does nothing to guarantee
--    total debits equal total credits) and assigns voucher_no server-side
--    via next_voucher_no() instead of the collision-prone client clock.
--    p_cgst/p_sgst/p_igst are optional tax figures for Credit Note / Debit
--    Note vouchers (stored on the voucher for GST reporting); the actual
--    debit/credit ledger legs remain fully up to the accountant, same as
--    every other manual voucher on this page.
-- ---------------------------------------------------------------------------
create or replace function public.create_manual_voucher(
  p_voucher_type public.voucher_type,
  p_voucher_date date,
  p_narration text,
  p_entries jsonb,   -- [{ledger_account_id, debit, credit}, ...]
  p_cgst numeric default 0,
  p_sgst numeric default 0,
  p_igst numeric default 0
)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_voucher public.vouchers%rowtype;
begin
  if not app_private.is_finance(auth.uid()) then
    raise exception 'not authorized to post vouchers';
  end if;
  if p_voucher_type = 'sales' then
    raise exception 'sales vouchers are posted automatically from billing and cannot be created manually';
  end if;
  if p_entries is null or jsonb_array_length(p_entries) < 2 then
    raise exception 'a voucher needs at least two ledger entries';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    if coalesce((v_entry->>'debit')::numeric, 0) > 0 and coalesce((v_entry->>'credit')::numeric, 0) > 0 then
      raise exception 'a single ledger entry cannot carry both a debit and a credit';
    end if;
    v_total_debit := v_total_debit + coalesce((v_entry->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_entry->>'credit')::numeric, 0);
  end loop;

  if v_total_debit <= 0 then
    raise exception 'enter a non-zero amount';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'entries are not balanced: total debit % does not equal total credit %', v_total_debit, v_total_credit;
  end if;

  insert into public.vouchers (voucher_type, voucher_date, narration, amount, cgst, sgst, igst, created_by)
  values (p_voucher_type, p_voucher_date, p_narration, v_total_debit, coalesce(p_cgst,0), coalesce(p_sgst,0), coalesce(p_igst,0), auth.uid())
  returning * into v_voucher;

  -- Alias deliberately not v_entry - see the matching note in
  -- create_prescription() above; reusing the declared variable name as a
  -- FROM-clause alias makes every v_entry->>'...' below ambiguous and
  -- Postgres rejects the statement outright.
  insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit)
  select v_voucher.id, (v_elem->>'ledger_account_id')::uuid,
         coalesce((v_elem->>'debit')::numeric, 0), coalesce((v_elem->>'credit')::numeric, 0)
  from jsonb_array_elements(p_entries) as v_elem;

  return v_voucher;
end;
$$;

grant execute on function public.create_manual_voucher(public.voucher_type, date, text, jsonb, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. adjust_stock - routes manual stock corrections through the same
--    inventory_ledger audit trail every other stock movement uses.
--    InventoryPage previously let admin/accountant/reception/pharmacist
--    directly UPDATE inventory.stock_qty with no inventory_ledger row at
--    all, which is both unaudited (no record of who changed stock, when,
--    or why) and invisible to service_profitability_view's cost
--    calculation (it sources product cost from inventory_ledger).
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_inventory_id uuid,
  p_new_qty numeric,
  p_reason text default null
)
returns public.inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_delta numeric;
  v_row public.inventory%rowtype;
begin
  if not app_private.has_any_role(auth.uid(), array['admin','accountant','reception','pharmacist']::public.staff_role[]) then
    raise exception 'not authorized to adjust stock';
  end if;
  if p_new_qty < 0 then
    raise exception 'stock quantity cannot be negative';
  end if;

  select stock_qty into v_current from public.inventory where id = p_inventory_id for update;
  if not found then
    raise exception 'product not found';
  end if;

  v_delta := p_new_qty - v_current;
  if v_delta <> 0 then
    update public.inventory set stock_qty = p_new_qty where id = p_inventory_id returning * into v_row;
    insert into public.inventory_ledger (inventory_id, movement_type, quantity, reference_type, note, created_by)
    values (p_inventory_id, 'adjustment', v_delta, 'manual', coalesce(p_reason, 'manual stock correction'), auth.uid());
  else
    select * into v_row from public.inventory where id = p_inventory_id;
  end if;

  return v_row;
end;
$$;

grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. edit_invoice - rewritten to resolve each line's real GST rate (fix #3
--     above) and to split CGST+SGST vs IGST once a clinic home state is
--     configured (fix #2 above). Everything else (diff-based upsert,
--     idempotent inventory reconciliation, soft-void, sales-voucher
--     auto-posting) is unchanged from 0008_functions.sql.
-- ---------------------------------------------------------------------------
-- The new version adds a trailing parameter, which Postgres treats as a
-- different overload rather than a replacement of the 0008 version (`create
-- or replace` only replaces a function with the IDENTICAL argument list) -
-- without this explicit drop, both versions would coexist and every call
-- using named arguments (as the frontend does) would fail with "is not
-- unique" instead of picking the new one.
drop function if exists public.edit_invoice(uuid, jsonb, numeric, text, public.payment_mode, text, boolean);

create or replace function public.edit_invoice(
  p_invoice_id uuid,
  p_lines jsonb,
  p_discount_amount numeric default 0,
  p_gst_mode text default 'exclusive',
  p_payment_mode public.payment_mode default 'cash',
  p_notes text default null,
  p_force_void_with_history boolean default false,
  p_place_of_supply text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_line_id uuid;
  v_kept_ids uuid[] := '{}';
  v_removed record;
  v_subtotal numeric := 0;
  v_gst numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_igst numeric := 0;
  v_gross numeric := 0;
  v_invoice public.invoices%rowtype;
  v_old_total numeric;
  v_voucher_id uuid;
  v_cash_id uuid;
  v_income_id uuid;
  v_gst_id uuid;
  v_igst_ledger_id uuid;
  v_place_of_supply text;
  v_home_state text;
  v_interstate boolean;
  v_line_row record;
  v_line_discount_share numeric;
  v_line_net numeric;
  v_line_base numeric;
  v_line_tax numeric;
begin
  if not app_private.can_bill(auth.uid()) then
    raise exception 'not authorized to edit invoices';
  end if;

  select gross_total into v_old_total from public.invoices where id = p_invoice_id;

  -- 1. Upsert each submitted line.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_id := nullif(v_line->>'id', '')::uuid;

    if v_line_id is not null then
      update public.invoice_lines set
        item_type = v_line->>'item_type',
        service_id = nullif(v_line->>'service_id','')::uuid,
        product_id = nullif(v_line->>'product_id','')::uuid,
        inventory_id = nullif(v_line->>'inventory_id','')::uuid,
        name = v_line->>'name',
        quantity = (v_line->>'quantity')::numeric,
        rate = (v_line->>'rate')::numeric,
        discount_amount = coalesce((v_line->>'discount_amount')::numeric, 0),
        line_amount = (v_line->>'quantity')::numeric * (v_line->>'rate')::numeric - coalesce((v_line->>'discount_amount')::numeric, 0),
        staff_id = nullif(v_line->>'staff_id','')::uuid,
        line_status = 'active'
      where id = v_line_id and invoice_id = p_invoice_id;
    else
      insert into public.invoice_lines (
        invoice_id, item_type, service_id, product_id, inventory_id, name,
        quantity, rate, discount_amount, line_amount, staff_id
      ) values (
        p_invoice_id,
        v_line->>'item_type',
        nullif(v_line->>'service_id','')::uuid,
        nullif(v_line->>'product_id','')::uuid,
        nullif(v_line->>'inventory_id','')::uuid,
        v_line->>'name',
        (v_line->>'quantity')::numeric,
        (v_line->>'rate')::numeric,
        coalesce((v_line->>'discount_amount')::numeric, 0),
        (v_line->>'quantity')::numeric * (v_line->>'rate')::numeric - coalesce((v_line->>'discount_amount')::numeric, 0),
        nullif(v_line->>'staff_id','')::uuid
      )
      returning id into v_line_id;
    end if;

    v_kept_ids := array_append(v_kept_ids, v_line_id);
  end loop;

  -- 2. Soft-void any active line that was NOT in the submitted set.
  for v_removed in
    select il.id, sw.consumed_sessions
    from public.invoice_lines il
    left join public.service_wallets sw on sw.invoice_line_id = il.id
    where il.invoice_id = p_invoice_id
      and il.line_status = 'active'
      and not (il.id = any(v_kept_ids))
  loop
    if coalesce(v_removed.consumed_sessions, 0) > 0 and not p_force_void_with_history then
      raise exception
        'Line % has % consumed session(s); pass p_force_void_with_history=true to remove it anyway (history is preserved either way).',
        v_removed.id, v_removed.consumed_sessions;
    end if;

    update public.invoice_lines
      set line_status = 'voided', voided_at = now(), voided_by = auth.uid(), voided_reason = 'removed during invoice edit'
      where id = v_removed.id;

    perform app_private.reconcile_line_inventory(v_removed.id);
  end loop;

  -- 3. Reconcile inventory for every kept/new active line.
  for v_line_id in select unnest(v_kept_ids) loop
    perform app_private.reconcile_line_inventory(v_line_id);
  end loop;

  -- 4. Resolve place of supply + interstate status. A null p_place_of_supply
  --    (the common case - most callers never pass it) leaves whatever is
  --    already on the invoice row untouched.
  update public.invoices
    set place_of_supply = coalesce(p_place_of_supply, place_of_supply)
    where id = p_invoice_id
    returning place_of_supply into v_place_of_supply;

  v_home_state := app_private.clinic_home_state();
  v_interstate := v_home_state is not null and v_place_of_supply is not null and v_place_of_supply <> v_home_state;

  -- 5. Recompute totals from active lines. Each line's GST rate is resolved
  --    LIVE from services_master/inventory via its service_id/inventory_id
  --    (falling back to 5.00% for a custom line with neither), and the
  --    header discount is distributed across lines proportionally so a
  --    mixed-rate bill still totals correctly.
  select coalesce(sum(line_amount), 0) into v_subtotal
  from public.invoice_lines where invoice_id = p_invoice_id and line_status = 'active';

  v_gst := 0;
  for v_line_row in
    select il.id, il.line_amount,
      coalesce(sm.gst_rate, inv.gst_rate, 5.00) as resolved_rate
    from public.invoice_lines il
    left join public.services_master sm on sm.id = il.service_id
    left join public.inventory inv on inv.id = il.inventory_id
    where il.invoice_id = p_invoice_id and il.line_status = 'active'
  loop
    v_line_discount_share := case when v_subtotal > 0 then v_line_row.line_amount / v_subtotal * p_discount_amount else 0 end;
    v_line_net := v_line_row.line_amount - v_line_discount_share;

    if p_gst_mode = 'inclusive' then
      v_line_base := v_line_net / (1 + v_line_row.resolved_rate / 100);
      v_line_tax := v_line_net - v_line_base;
    else
      v_line_tax := v_line_net * v_line_row.resolved_rate / 100;
    end if;

    v_gst := v_gst + v_line_tax;

    update public.invoice_lines set gst_rate = v_line_row.resolved_rate where id = v_line_row.id;
  end loop;

  if v_interstate then
    v_igst := v_gst;
    v_cgst := 0;
    v_sgst := 0;
  else
    v_cgst := v_gst / 2;
    v_sgst := v_gst / 2;
    v_igst := 0;
  end if;

  v_gross := case when p_gst_mode = 'inclusive'
    then v_subtotal - p_discount_amount
    else (v_subtotal - p_discount_amount) + v_gst
  end;

  update public.invoices set
    subtotal = v_subtotal,
    discount_amount = p_discount_amount,
    cgst = v_cgst,
    sgst = v_sgst,
    igst = v_igst,
    gross_total = v_gross,
    gst_mode = p_gst_mode,
    payment_mode = p_payment_mode,
    notes = coalesce(p_notes, notes)
  where id = p_invoice_id
  returning * into v_invoice;

  -- 6. Post the linked 'sales' voucher the FIRST time this invoice gets real
  --    totals (see 0008_functions.sql for the fuller history of this
  --    comment). GST Payable / IGST Payable legs are only inserted when
  --    actually nonzero, matching repost_invoice_voucher()'s insert-if-
  --    missing handling of the (rare) case where a later edit flips an
  --    invoice between interstate and intrastate.
  if v_gross > 0 then
    select id into v_voucher_id from public.vouchers
      where invoice_id = p_invoice_id and voucher_type = 'sales';

    if v_voucher_id is null then
      select id into v_cash_id from public.ledger_accounts where name = 'Cash';
      select id into v_gst_id from public.ledger_accounts where name = 'GST Payable';
      select id into v_igst_ledger_id from public.ledger_accounts where name = 'IGST Payable';
      select id into v_income_id from public.ledger_accounts
        where name = case when v_invoice.invoice_type = 'products' then 'Sales - Products' else 'Sales - Services' end;

      insert into public.vouchers (voucher_type, invoice_id, narration, amount, cgst, sgst, igst)
      values ('sales', p_invoice_id, 'Auto-posted from invoice ' || coalesce(v_invoice.invoice_no, p_invoice_id::text), v_gross, v_cgst, v_sgst, v_igst)
      returning id into v_voucher_id;

      insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit) values
        (v_voucher_id, v_cash_id, v_gross, 0),
        (v_voucher_id, v_income_id, 0, v_gross - v_cgst - v_sgst - v_igst);

      if (v_cgst + v_sgst) > 0 then
        insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit)
        values (v_voucher_id, v_gst_id, 0, v_cgst + v_sgst);
      end if;

      if v_igst > 0 then
        insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit)
        values (v_voucher_id, v_igst_ledger_id, 0, v_igst);
      end if;
    end if;
  end if;

  insert into public.billing_audit_log (actor_id, entity_type, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), 'invoice', p_invoice_id, 'update',
          jsonb_build_object('gross_total', v_old_total),
          jsonb_build_object('gross_total', v_gross),
          'edit_invoice diff-upsert');

  return v_invoice;
end;
$$;

grant execute on function public.edit_invoice(uuid, jsonb, numeric, text, public.payment_mode, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. repost_invoice_voucher - extended for IGST, and made robust to a later
--     edit of the SAME invoice flipping it between interstate and
--     intrastate (updates the matching leg in place if it already exists,
--     inserts it if not, zeroes it out if no longer applicable). The
--     original version only ever updated existing rows, which was fine
--     under the old CGST+SGST-always design but would silently under/over-
--     state tax if a customer's recorded state changed between edits once
--     IGST exists as a possibility.
-- ---------------------------------------------------------------------------
create or replace function app_private.repost_invoice_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voucher_id uuid;
  v_gst_account_id uuid;
  v_igst_account_id uuid;
begin
  if (new.gross_total is distinct from old.gross_total)
     or (new.cgst is distinct from old.cgst)
     or (new.sgst is distinct from old.sgst)
     or (new.igst is distinct from old.igst) then

    select id into v_voucher_id from public.vouchers where invoice_id = new.id and voucher_type = 'sales';
    if v_voucher_id is null then
      return new; -- nothing posted yet (e.g. gross_total was 0 until now)
    end if;

    update public.vouchers
      set amount = new.gross_total, cgst = new.cgst, sgst = new.sgst, igst = new.igst, updated_at = now()
      where id = v_voucher_id;

    update public.voucher_entries ve
      set debit = case when la.account_group = 'assets' then new.gross_total else ve.debit end,
          credit = case when la.account_group = 'income' then new.gross_total - new.cgst - new.sgst - new.igst else ve.credit end
      from public.ledger_accounts la
      where ve.voucher_id = v_voucher_id and la.id = ve.ledger_account_id
        and la.account_group in ('assets','income');

    select id into v_gst_account_id from public.ledger_accounts where name = 'GST Payable';
    if (new.cgst + new.sgst) > 0 then
      if exists (select 1 from public.voucher_entries where voucher_id = v_voucher_id and ledger_account_id = v_gst_account_id) then
        update public.voucher_entries set credit = new.cgst + new.sgst
          where voucher_id = v_voucher_id and ledger_account_id = v_gst_account_id;
      else
        insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit)
          values (v_voucher_id, v_gst_account_id, 0, new.cgst + new.sgst);
      end if;
    else
      update public.voucher_entries set credit = 0
        where voucher_id = v_voucher_id and ledger_account_id = v_gst_account_id;
    end if;

    select id into v_igst_account_id from public.ledger_accounts where name = 'IGST Payable';
    if new.igst > 0 then
      if exists (select 1 from public.voucher_entries where voucher_id = v_voucher_id and ledger_account_id = v_igst_account_id) then
        update public.voucher_entries set credit = new.igst
          where voucher_id = v_voucher_id and ledger_account_id = v_igst_account_id;
      else
        insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit)
          values (v_voucher_id, v_igst_account_id, 0, new.igst);
      end if;
    else
      update public.voucher_entries set credit = 0
        where voucher_id = v_voucher_id and ledger_account_id = v_igst_account_id;
    end if;
  end if;
  return new;
end;
$$;
