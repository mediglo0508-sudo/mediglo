-- =============================================================================
-- 0007_integration_sync.sql
-- The ERP <-> Tracker connection.
--
-- What the audit found: Tracker's *working* sync mechanism pulled Harmony
-- data by impersonating one admin's personal OAuth/SSO session, on manual
-- demand only (erp-tracker-connection-and-role-function-audit.md). That's a
-- single point of failure (one person's session) and only ever ran when a
-- human clicked "Sync Now". The separate outbox/webhook path
-- (integration_outbox) queued 147 rows and delivered zero of them - there
-- was never a dispatcher.
--
-- The fix here: a proper service-to-service contract.
--   - Tracker's own scheduled job calls the SECURITY DEFINER functions below
--     using ERP's Supabase *service role* key (a server-side secret that
--     never reaches a browser) - not any staff member's personal session.
--   - These functions are granted to `service_role` only (revoked from
--     `anon`/`authenticated`), so they are unreachable from the ERP's own
--     browser client and unreachable without that secret.
--   - Because it's a scheduled pull keyed off `updated_at`, it keeps working
--     whether or not any particular human is logged in anywhere.
--   - integration_outbox is kept as an optional secondary/event-log path
--     (e.g. for webhook-style push later) with the race condition from the
--     audit already fixed (see app_private.capture_dues_outbox below).
-- =============================================================================

create table public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('customer','appointment','invoice','dues')),
  entity_id text not null,
  operation text not null check (operation in ('created','updated','deleted')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  attempt_count int not null default 0,
  last_error text
);

create index idx_integration_outbox_undelivered
  on public.integration_outbox (entity_type, entity_id)
  where delivered_at is null;

-- Log of every batch Tracker actually pulled, for observability (answers
-- "when did this last sync, and how much moved" without guessing).
create table public.sync_deliveries (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  rows_returned int not null,
  cursor_from timestamptz,
  cursor_to timestamptz,
  called_at timestamptz not null default now(),
  caller_note text
);

-- ---------------------------------------------------------------------------
-- Dues capture trigger -> integration_outbox, with the audit's race-condition
-- fix applied: also check claimed_at is null, so an in-flight row is never
-- silently overwritten with a payload that then gets marked delivered
-- without ever having been sent.
-- ---------------------------------------------------------------------------
create or replace function app_private.capture_dues_outbox(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_payload jsonb;
  v_billed numeric;
  v_paid numeric;
begin
  select coalesce(sum(gross_total), 0), coalesce(sum(amount_paid), 0)
    into v_billed, v_paid
  from public.invoices
  where customer_id = p_customer_id and status <> 'void';

  v_payload := jsonb_build_object(
    'customer_id', p_customer_id,
    'total_billed', v_billed,
    'total_paid', v_paid,
    'outstanding', v_billed - v_paid,
    'as_of', now()
  );

  select o.id into v_existing
  from public.integration_outbox o
  where o.entity_type = 'dues'
    and o.entity_id = p_customer_id::text
    and o.delivered_at is null
    and o.claimed_at is null          -- fix: don't collapse into a row mid-delivery
  order by o.created_at desc
  limit 1;

  if v_existing is not null then
    update public.integration_outbox
      set payload = v_payload, created_at = now()
      where id = v_existing;
  else
    insert into public.integration_outbox (entity_type, entity_id, operation, payload)
    values ('dues', p_customer_id::text, 'updated', v_payload);
  end if;
end;
$$;

create or replace function app_private.trg_capture_dues_on_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_private.capture_dues_outbox(coalesce(new.customer_id, old.customer_id));
  return coalesce(new, old);
end;
$$;

create trigger capture_dues_on_invoice_change
  after insert or update or delete on public.invoices
  for each row execute function app_private.trg_capture_dues_on_invoice_change();

-- ---------------------------------------------------------------------------
-- Pull-based export functions - the primary, supported sync path.
-- Granted ONLY to service_role: Tracker's scheduled job authenticates with
-- ERP's service role key (a secret held server-side in Tracker's deployment,
-- e.g. as a Supabase Edge Function secret), never a staff member's session.
-- ---------------------------------------------------------------------------
create or replace function public.sync_export_customers(p_since timestamptz, p_limit int default 500)
returns setof public.customers
language sql
stable
security definer
set search_path = public
as $$
  select * from public.customers
  where updated_at > p_since
  order by updated_at asc
  limit p_limit;
$$;

create or replace function public.sync_export_appointments(p_since timestamptz, p_limit int default 500)
returns table (
  id uuid, customer_id uuid, doctor_id uuid, appointment_date date, appointment_time time,
  status public.appointment_status, appointment_source public.appointment_source,
  color_tag text, service_name text, notes text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, customer_id, doctor_id, appointment_date, appointment_time,
         status, appointment_source, color_tag, service_name, notes, updated_at
  from public.cos_appointments
  where updated_at > p_since
  order by updated_at asc
  limit p_limit;
$$;

create or replace function public.sync_export_invoices(p_since timestamptz, p_limit int default 500)
returns table (
  id uuid, invoice_no text, customer_id uuid, gross_total numeric, cgst numeric, sgst numeric,
  payment_mode public.payment_mode, status public.invoice_status, invoice_type public.invoice_type,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, invoice_no, customer_id, gross_total, cgst, sgst,
         payment_mode, status, invoice_type, created_at, updated_at
  from public.invoices
  where updated_at > p_since
  order by updated_at asc
  limit p_limit;
$$;

create or replace function public.sync_export_dues(p_since timestamptz, p_limit int default 500)
returns table (customer_id uuid, total_billed numeric, total_paid numeric, outstanding numeric, as_of timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select (payload->>'customer_id')::uuid,
         (payload->>'total_billed')::numeric,
         (payload->>'total_paid')::numeric,
         (payload->>'outstanding')::numeric,
         (payload->>'as_of')::timestamptz
  from public.integration_outbox
  where entity_type = 'dues' and created_at > p_since
  order by created_at asc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Push-based write functions - Tracker calling INTO the ERP (book an
-- appointment, link a patient). Also service_role only: Tracker's server
-- calls these, never the Tracker browser client directly.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_book_appointment(
  p_harmony_customer_id uuid,
  p_new_customer_name text,
  p_new_customer_phone text,
  p_requested_date date,
  p_requested_time time,
  p_service_name text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_appointment_id uuid;
begin
  if p_harmony_customer_id is not null then
    v_customer_id := p_harmony_customer_id;
  else
    insert into public.customers (name, phone)
    values (p_new_customer_name, p_new_customer_phone)
    returning id into v_customer_id;
  end if;

  insert into public.cos_appointments (
    customer_id, appointment_date, appointment_time, service_name, notes, appointment_source
  ) values (
    v_customer_id, p_requested_date, p_requested_time, p_service_name, p_notes, 'tracker'
  )
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

revoke all on function public.sync_export_customers(timestamptz, int) from public, anon, authenticated;
revoke all on function public.sync_export_appointments(timestamptz, int) from public, anon, authenticated;
revoke all on function public.sync_export_invoices(timestamptz, int) from public, anon, authenticated;
revoke all on function public.sync_export_dues(timestamptz, int) from public, anon, authenticated;
revoke all on function public.tracker_book_appointment(uuid, text, text, date, time, text, text) from public, anon, authenticated;

grant execute on function public.sync_export_customers(timestamptz, int) to service_role;
grant execute on function public.sync_export_appointments(timestamptz, int) to service_role;
grant execute on function public.sync_export_invoices(timestamptz, int) to service_role;
grant execute on function public.sync_export_dues(timestamptz, int) to service_role;
grant execute on function public.tracker_book_appointment(uuid, text, text, date, time, text, text) to service_role;

alter table public.integration_outbox enable row level security;
alter table public.sync_deliveries enable row level security;
-- No policies granted to anon/authenticated on either table: only service_role
-- (which bypasses RLS) and admins via a dedicated read policy can see them.
create policy integration_outbox_admin_read on public.integration_outbox for select
  using (app_private.is_admin(auth.uid()));
create policy sync_deliveries_admin_read on public.sync_deliveries for select
  using (app_private.is_admin(auth.uid()));
