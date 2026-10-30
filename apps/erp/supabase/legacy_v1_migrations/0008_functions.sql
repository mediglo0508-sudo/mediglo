-- =============================================================================
-- 0008_functions.sql
-- Every RPC / trigger function the frontend calls, with the fixes from
-- invoice-edit-delete-root-cause-audit.md applied directly (this is the
-- "spec-driven rebuild, fix them now" version):
--
--   1. next_invoice_no() is GRANTed to authenticated from the start (the
--      audit found this GRANT missing, blocking every new invoice save).
--   2. Invoice line edits are a diff-based UPSERT keyed by id (update in
--      place / insert new / soft-void removed) - never delete-all-recreate,
--      so service_wallets and wallet_redemptions can never be cascade-wiped.
--   3. Inventory reconciliation is idempotent (tracks how much stock has
--      already been synced per line) so re-editing a bill never double-
--      deducts or double-returns stock.
--   4. A trigger keeps linked accounting vouchers in sync with an invoice's
--      current totals automatically (the audit recommended the trigger form
--      specifically because it "can't be silently dropped the next time the
--      edit UI is rewritten").
-- =============================================================================

-- Track how much stock has already been deducted for a line, so edits are
-- idempotent (added here rather than 0005 to keep the "what and why" together).
alter table public.invoice_lines add column stock_synced_qty numeric(10,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Invoice numbering
-- ---------------------------------------------------------------------------
create sequence if not exists public.invoice_no_seq start 1;

create or replace function public.next_invoice_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no bigint;
begin
  v_no := nextval('public.invoice_no_seq');
  return 'INV-' || lpad(v_no::text, 6, '0');
end;
$$;

-- The fix: this was missing in the audited production database, and every
-- invoice insert that left invoice_no blank failed outright as a result.
grant execute on function public.next_invoice_no() to authenticated;

create or replace function app_private.set_invoice_no()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_no is null or new.invoice_no = '' then
    new.invoice_no := public.next_invoice_no();
  end if;
  return new;
end;
$$;

create trigger set_invoice_no_on_insert
  before insert on public.invoices
  for each row execute function app_private.set_invoice_no();

-- ---------------------------------------------------------------------------
-- Quotation / receipt numbering
-- ---------------------------------------------------------------------------
create or replace function public.generate_quotation_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'QUOTE-' || to_char(now(), 'YYYY') || '-' ||
    lpad((
      select count(*) + 1 from public.counselor_quotations
      where created_at > date_trunc('year', now())
    )::text, 5, '0');
$$;

grant execute on function public.generate_quotation_number() to authenticated;

create or replace function public.generate_receipt_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'RCP-' || to_char(now(), 'YYYY') || '-' ||
    lpad((
      select count(*) + 1 from public.product_orders
      where created_at > date_trunc('year', now())
    )::text, 5, '0');
$$;

grant execute on function public.generate_receipt_number() to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory reconciliation - idempotent, keyed off stock_synced_qty so
-- repeated edits never double-count.
-- ---------------------------------------------------------------------------
create or replace function app_private.reconcile_line_inventory(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.invoice_lines%rowtype;
  v_desired numeric;
  v_delta numeric;
begin
  select * into v_line from public.invoice_lines where id = p_line_id;
  if not found or v_line.inventory_id is null then
    return;
  end if;

  v_desired := case when v_line.line_status = 'active' then v_line.quantity else 0 end;
  v_delta := v_desired - coalesce(v_line.stock_synced_qty, 0);

  if v_delta <> 0 then
    update public.inventory
      set stock_qty = stock_qty - v_delta
      where id = v_line.inventory_id;

    insert into public.inventory_ledger (inventory_id, movement_type, quantity, reference_type, reference_id, note)
    values (
      v_line.inventory_id,
      case when v_delta > 0 then 'sale' else 'return' end,
      -v_delta,
      'invoice_line',
      v_line.id,
      'auto-reconciled on invoice save'
    );

    update public.invoice_lines set stock_synced_qty = v_desired where id = v_line.id;
  end if;
end;
$$;

create or replace function public.rebill_invoice_inventory(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_id uuid;
begin
  if not app_private.can_bill(auth.uid()) then
    raise exception 'not authorized to rebill inventory for this invoice';
  end if;

  for v_line_id in
    select id from public.invoice_lines where invoice_id = p_invoice_id
  loop
    perform app_private.reconcile_line_inventory(v_line_id);
  end loop;
end;
$$;

grant execute on function public.rebill_invoice_inventory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Service wallet lifecycle - created when a service line is added, adjusted
-- (never deleted) as the line is edited or voided.
-- ---------------------------------------------------------------------------
create or replace function app_private.trg_invoice_line_service_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.item_type = 'service' then
      select customer_id into v_customer_id from public.invoices where id = new.invoice_id;
      insert into public.service_wallets (invoice_line_id, customer_id, service_id, service_name, total_sessions)
      values (new.id, v_customer_id, new.service_id, new.name, new.quantity);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.item_type = 'service' then
    if new.line_status = 'voided' and old.line_status <> 'voided' then
      update public.service_wallets set status = 'voided'
      where invoice_line_id = new.id and status = 'active';
    elsif new.line_status = 'active' and new.quantity <> old.quantity then
      update public.service_wallets
        set total_sessions = greatest(new.quantity, consumed_sessions)
      where invoice_line_id = new.id;
    end if;
    return new;
  end if;

  return new;
end;
$$;

create trigger invoice_line_service_wallet
  after insert or update on public.invoice_lines
  for each row execute function app_private.trg_invoice_line_service_wallet();

-- ---------------------------------------------------------------------------
-- Voucher repost - keeps the accounting ledger in sync with an edited
-- invoice automatically. Applied as a TRIGGER (not an app-level call the
-- edit function has to remember) per the audit's own recommendation.
-- ---------------------------------------------------------------------------
create or replace function app_private.repost_invoice_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.gross_total is distinct from old.gross_total)
     or (new.cgst is distinct from old.cgst)
     or (new.sgst is distinct from old.sgst) then
    update public.vouchers
      set amount = new.gross_total, cgst = new.cgst, sgst = new.sgst, updated_at = now()
      where invoice_id = new.id and voucher_type = 'sales';

    update public.voucher_entries ve
      set debit = case when la.account_group = 'assets' then new.gross_total else ve.debit end,
          credit = case when la.account_group in ('income','liabilities') then
                      case
                        when la.name = 'GST Payable' then new.cgst + new.sgst
                        else new.gross_total - new.cgst - new.sgst
                      end
                    else ve.credit end
    from public.vouchers v, public.ledger_accounts la
    where ve.voucher_id = v.id and v.invoice_id = new.id and v.voucher_type = 'sales'
      and la.id = ve.ledger_account_id;
  end if;
  return new;
end;
$$;

create trigger repost_invoice_voucher_on_update
  after update on public.invoices
  for each row execute function app_private.repost_invoice_voucher();

-- ---------------------------------------------------------------------------
-- edit_invoice - the diff-based upsert that replaces "delete all lines,
-- reinsert" (the change that was cascade-wiping service_wallets/redemptions
-- per the audit's root-cause finding).
--
-- p_lines: jsonb array of
--   { id: uuid|null, item_type, service_id, product_id, inventory_id,
--     name, quantity, rate, discount_amount, staff_id }
-- A line with `id` matching an existing active line is UPDATED in place.
-- A line with `id` = null is INSERTED as new.
-- An existing active line NOT present in p_lines is VOIDED (soft), never
-- hard-deleted, unless p_force_void_with_history is true when it has
-- consumed wallet sessions.
-- ---------------------------------------------------------------------------
create or replace function public.edit_invoice(
  p_invoice_id uuid,
  p_lines jsonb,
  p_discount_amount numeric default 0,
  p_gst_mode text default 'exclusive',
  p_payment_mode public.payment_mode default 'cash',
  p_notes text default null,
  p_force_void_with_history boolean default false
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
  v_gross numeric := 0;
  v_invoice public.invoices%rowtype;
  v_old_total numeric;
  v_voucher_id uuid;
  v_cash_id uuid;
  v_income_id uuid;
  v_gst_id uuid;
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

  -- 4. Recompute totals from active lines + header discount + GST mode.
  select coalesce(sum(line_amount), 0) into v_subtotal
  from public.invoice_lines where invoice_id = p_invoice_id and line_status = 'active';

  if p_gst_mode = 'inclusive' then
    v_gst := (v_subtotal - p_discount_amount) - (v_subtotal - p_discount_amount) / 1.05;
  else
    v_gst := (v_subtotal - p_discount_amount) * 0.05;
  end if;
  v_cgst := v_gst / 2;
  v_sgst := v_gst / 2;
  v_gross := case when p_gst_mode = 'inclusive'
    then v_subtotal - p_discount_amount
    else (v_subtotal - p_discount_amount) + v_gst
  end;

  update public.invoices set
    subtotal = v_subtotal,
    discount_amount = p_discount_amount,
    cgst = v_cgst,
    sgst = v_sgst,
    gross_total = v_gross,
    gst_mode = p_gst_mode,
    payment_mode = p_payment_mode,
    notes = coalesce(p_notes, notes)
  where id = p_invoice_id
  returning * into v_invoice;

  -- 5. Post the linked 'sales' voucher the FIRST time this invoice gets real
  --    totals. Every later edit_invoice call is an UPDATE on public.invoices,
  --    which the repost_invoice_voucher_on_update trigger already picks up
  --    to keep this voucher's amount/cgst/sgst and its two credit entries in
  --    sync - so this only ever fires once per invoice. (Root-cause note:
  --    without this, no sales voucher was ever created and the Tally-style
  --    ledger stayed empty forever - repost only *updates* an existing row.)
  --    One income leg per invoice (by invoice_type) rather than splitting
  --    service/product revenue keeps this exactly the 3-entry shape
  --    (Cash debit / income credit / GST Payable credit) that
  --    repost_invoice_voucher's update logic assumes.
  if v_gross > 0 then
    select id into v_voucher_id from public.vouchers
      where invoice_id = p_invoice_id and voucher_type = 'sales';

    if v_voucher_id is null then
      select id into v_cash_id from public.ledger_accounts where name = 'Cash';
      select id into v_gst_id from public.ledger_accounts where name = 'GST Payable';
      select id into v_income_id from public.ledger_accounts
        where name = case when v_invoice.invoice_type = 'products' then 'Sales - Products' else 'Sales - Services' end;

      insert into public.vouchers (voucher_type, invoice_id, narration, amount, cgst, sgst)
      values ('sales', p_invoice_id, 'Auto-posted from invoice ' || coalesce(v_invoice.invoice_no, p_invoice_id::text), v_gross, v_cgst, v_sgst)
      returning id into v_voucher_id;

      insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit) values
        (v_voucher_id, v_cash_id, v_gross, 0),
        (v_voucher_id, v_income_id, 0, v_gross - v_cgst - v_sgst);

      if (v_cgst + v_sgst) > 0 then
        insert into public.voucher_entries (voucher_id, ledger_account_id, debit, credit)
        values (v_voucher_id, v_gst_id, 0, v_cgst + v_sgst);
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

grant execute on function public.edit_invoice(uuid, jsonb, numeric, text, public.payment_mode, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Duplicate-bill guard - warn reception if the same customer already has an
-- active invoice created in the last few minutes (fat-finger double submit).
-- ---------------------------------------------------------------------------
create or replace function public.check_duplicate_bill(p_customer_id uuid, p_gross_total numeric, p_window_minutes int default 5)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invoices
    where customer_id = p_customer_id
      and gross_total = p_gross_total
      and status <> 'void'
      and created_at > now() - make_interval(mins => p_window_minutes)
  );
$$;

grant execute on function public.check_duplicate_bill(uuid, numeric, int) to authenticated;

-- ---------------------------------------------------------------------------
-- my_billing_access - lets the frontend ask "what can I do" in one call
-- instead of re-deriving role logic client-side.
-- ---------------------------------------------------------------------------
create or replace function public.my_billing_access()
returns table (can_bill boolean, can_view_finance boolean, is_admin boolean, roles public.staff_role[])
language sql
stable
security definer
set search_path = public
as $$
  select
    app_private.can_bill(auth.uid()),
    app_private.is_finance(auth.uid()),
    app_private.is_admin(auth.uid()),
    coalesce(array_agg(ur.role), '{}'::public.staff_role[])
  from public.user_roles ur
  where ur.user_id = auth.uid();
$$;

grant execute on function public.my_billing_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Pharmacist auto-assign (load balancing across pharmacists)
-- ---------------------------------------------------------------------------
create or replace function public.auto_assign_to_pharmacist(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacist_id uuid;
begin
  select ur.user_id into v_pharmacist_id
  from public.user_roles ur
  left join public.product_orders po
    on po.assigned_to = ur.user_id and po.status <> 'completed'
  where ur.role = 'pharmacist'
  group by ur.user_id
  order by count(po.id) asc
  limit 1;

  if v_pharmacist_id is not null then
    update public.product_orders
      set assigned_to = v_pharmacist_id, assigned_at = now(), status = 'assigned'
      where id = p_order_id;
  end if;

  return v_pharmacist_id;
end;
$$;

grant execute on function public.auto_assign_to_pharmacist(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Immutability guards - defense in depth on top of the RLS UPDATE policies.
-- ---------------------------------------------------------------------------
create or replace function app_private.guard_prescription_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('sent_to_counselor', 'finalized') and not app_private.is_admin(auth.uid()) then
    if new.diagnosis is distinct from old.diagnosis
       or new.clinical_notes is distinct from old.clinical_notes then
      raise exception 'This prescription has already been sent to the counselor and cannot be edited.';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_prescription_immutable
  before update on public.doctor_prescriptions
  for each row execute function app_private.guard_prescription_immutable();

create or replace function app_private.guard_quotation_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status not in ('draft') and not app_private.is_admin(auth.uid()) then
    if new.items_json is distinct from old.items_json
       or new.net_total is distinct from old.net_total then
      raise exception 'This quotation has already been finalized and cannot be edited.';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_quotation_immutable
  before update on public.counselor_quotations
  for each row execute function app_private.guard_quotation_immutable();

-- ---------------------------------------------------------------------------
-- Session redemption - GAP found during this build's own end-to-end
-- verification pass, not from the original audits: the schema fully
-- supports prepaid session packages (service_wallets/wallet_redemptions),
-- and the UI displays a customer's remaining sessions, but nothing anywhere
-- ever let staff actually mark a session as used. Worse, even a direct
-- client-side UPDATE on service_wallets would have been blocked by RLS for
-- everyone except admin (service_wallets_admin_write is admin-only) - so a
-- therapist could never record a session even if the frontend tried a plain
-- update. This RPC is the one safe, auditable way to consume a session: it
-- checks the same role list as wallet_redemptions_insert, locks the wallet
-- row, records the redemption, and updates the running balance atomically.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_wallet_session(
  p_wallet_id uuid,
  p_encounter_id uuid default null,
  p_sessions numeric default 1,
  p_notes text default null
)
returns public.service_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.service_wallets%rowtype;
begin
  if not app_private.has_any_role(auth.uid(), array['admin','therapist','doctor','reception']::public.staff_role[]) then
    raise exception 'not authorized to redeem a wallet session';
  end if;

  select * into v_wallet from public.service_wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'wallet not found';
  end if;
  if v_wallet.status <> 'active' then
    raise exception 'this wallet is % and cannot be redeemed from', v_wallet.status;
  end if;
  if p_sessions <= 0 then
    raise exception 'sessions to redeem must be positive';
  end if;
  if v_wallet.consumed_sessions + p_sessions > v_wallet.total_sessions then
    raise exception 'only % session(s) remaining on this wallet', v_wallet.total_sessions - v_wallet.consumed_sessions;
  end if;

  insert into public.wallet_redemptions (wallet_id, encounter_id, sessions_used, redeemed_by, notes)
  values (p_wallet_id, p_encounter_id, p_sessions, auth.uid(), p_notes);

  update public.service_wallets
    set consumed_sessions = consumed_sessions + p_sessions,
        status = case when consumed_sessions + p_sessions >= total_sessions then 'exhausted' else 'active' end
    where id = p_wallet_id
    returning * into v_wallet;

  return v_wallet;
end;
$$;

grant execute on function public.redeem_wallet_session(uuid, uuid, numeric, text) to authenticated;
