-- =============================================================================
-- 0003_appointments_encounters.sql
-- Appointments (with color-tagging + source-tracking baked in, per
-- APPOINTMENT-DETAILS-EDIT-FIX.md) and the encounter/visit record that the
-- architecture audit calls for (appointment = scheduled; encounter = the
-- actual visit, with check-in/start/complete timestamps).
-- =============================================================================

create type public.appointment_status as enum
  ('scheduled','checked_in','in_progress','completed','cancelled','no_show');

create type public.appointment_source as enum
  ('manual','google_calendar','facebook','instagram','whatsapp','phone_call','walk_in','tracker','other');

create table public.cos_appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  doctor_id uuid references auth.users(id),
  service_id uuid references public.services_master(id),
  service_name text,                       -- denormalized snapshot for fast list rendering
  appointment_date date not null,
  appointment_time time not null,
  status public.appointment_status not null default 'scheduled',

  appointment_source public.appointment_source not null default 'manual',
  appointment_source_metadata jsonb not null default '{}'::jsonb,

  color_tag text default 'default',        -- 'cyan' | 'emerald' | 'purple' | 'coral' | 'gold' | 'lime' | 'pink' | 'default'
  color_hex text,
  color_assigned_at timestamptz,
  color_assigned_by uuid references auth.users(id),

  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointments_customer_id on public.cos_appointments(customer_id);
create index idx_appointments_doctor_id on public.cos_appointments(doctor_id);
create index idx_appointments_date on public.cos_appointments(appointment_date);
create index idx_appointments_status on public.cos_appointments(status);
create index idx_appointments_source on public.cos_appointments(appointment_source);
create index idx_appointments_updated_at on public.cos_appointments(updated_at); -- sync cursor scans

create trigger set_updated_at_appointments before update on public.cos_appointments
  for each row execute function app_private.set_updated_at();

-- Convenience view used by the Appointment Details modal (one round trip
-- instead of three joins client-side).
-- security_invoker = true: without this, a plain view runs with its OWNER's
-- table privileges (the migration role, which owns and therefore bypasses
-- RLS on the underlying tables), so every RLS policy on cos_appointments/
-- customers/encounters would silently be ignored by anyone querying this
-- view directly via the REST API. security_invoker makes the view apply
-- RLS as the actual calling role instead - found and fixed during this
-- build's verification pass, see 0006 for the more serious case of this bug.
create or replace view public.appointment_details_view
  with (security_invoker = true) as
select
  ca.id as appointment_id,
  ca.appointment_date,
  ca.appointment_time,
  ca.status,
  ca.appointment_source,
  ca.appointment_source_metadata,
  ca.color_tag,
  ca.color_hex,
  ca.notes,
  ca.created_at,
  ca.updated_at,
  c.id as customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  c.age as customer_age,
  c.gender as customer_gender,
  c.address as customer_address,
  c.city as customer_city,
  sp.full_name as doctor_name
from public.cos_appointments ca
left join public.customers c on c.id = ca.customer_id
left join public.staff_profiles sp on sp.user_id = ca.doctor_id;

-- ---------------------------------------------------------------------------
-- Encounters - the actual visit. Separate from the scheduled appointment so
-- walk-ins / direct treatments (no prior appointment) are representable too.
-- ---------------------------------------------------------------------------
create type public.encounter_type as enum
  ('consultation','follow_up','treatment','direct_treatment','checkout');

create type public.encounter_status as enum
  ('scheduled','checked_in','in_progress','completed','cancelled');

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.cos_appointments(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,

  encounter_type public.encounter_type not null default 'consultation',
  status public.encounter_status not null default 'scheduled',

  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id),
  started_at timestamptz,
  started_by uuid references auth.users(id),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_encounters_customer_id on public.encounters(customer_id);
create index idx_encounters_appointment_id on public.encounters(appointment_id);
create index idx_encounters_status on public.encounters(status);
create index idx_encounters_started_by on public.encounters(started_by);

create trigger set_updated_at_encounters before update on public.encounters
  for each row execute function app_private.set_updated_at();

comment on table public.encounters is
  'Tracks the actual visit. Separate from cos_appointments (which is just the booking). '
  'This is what fixes the missing check-in workflow flagged in the architecture audit.';
