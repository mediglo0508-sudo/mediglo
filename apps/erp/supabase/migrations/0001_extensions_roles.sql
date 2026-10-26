-- =============================================================================
-- 0001_extensions_roles.sql
-- Extensions, staff roles, and the app_private helper-function schema used by
-- every RLS policy in this project. Consolidates the role model that was
-- reverse-engineered from the live Harmony database (see
-- erp-tracker-connection-and-role-function-audit.md): admin, doctor,
-- reception, accountant, counselor, therapist, pharmacist, marketing,
-- marketing_head.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy customer/name search

-- A schema for SECURITY DEFINER helper functions that RLS policies call.
create schema if not exists app_private;

-- CRITICAL, found only by testing against a real non-superuser role (this
-- was missing from the original version of this migration): every RLS
-- policy in this project calls app_private.has_role()/is_admin()/can_bill()
-- etc. from inside its USING/WITH CHECK clause. Those calls are evaluated
-- AS THE QUERYING ROLE (anon/authenticated), not as an elevated definer -
-- SECURITY DEFINER only changes privileges for code that runs *inside* the
-- function once it's already been called, it doesn't waive the caller's
-- need for schema USAGE + EXECUTE just to call it in the first place.
-- Without this grant, every single role-gated insert/update/delete in the
-- entire app fails with "permission denied for schema app_private" the
-- moment it's run by a real anon/authenticated session (a superuser like
-- the migration role never notices, since superusers skip all permission
-- checks - which is exactly how this stayed invisible until a proper
-- non-superuser end-to-end test caught it). The schema still isn't
-- browsable as a PostgREST endpoint (that's controlled by PostgREST's own
-- exposed-schemas config, separate from this grant) - this only allows
-- these specific functions to be called from within a policy expression.
grant usage on schema app_private to anon, authenticated, service_role;

create type public.staff_role as enum (
  'admin',
  'doctor',
  'reception',
  'accountant',
  'counselor',
  'therapist',
  'pharmacist',
  'marketing',
  'marketing_head'
);

-- One row per (user, role). A staff member can hold more than one role.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index idx_user_roles_user_id on public.user_roles(user_id);
create index idx_user_roles_role on public.user_roles(role);

-- Staff profile (display name shown across both apps - the "one staff
-- identity" requirement). Mirrors auth.users 1:1.
create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions used throughout RLS policies (SECURITY DEFINER, schema
-- app_private, so they read user_roles without needing a recursive RLS check
-- on user_roles itself).
-- ---------------------------------------------------------------------------

create or replace function app_private.has_role(p_user uuid, p_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user and ur.role = p_role
  );
$$;

create or replace function app_private.has_any_role(p_user uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user and ur.role = any(p_roles)
  );
$$;

-- admin + accountant: full financial visibility
create or replace function app_private.is_finance(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_any_role(p_user, array['admin','accountant']::public.staff_role[]);
$$;

create or replace function app_private.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_role(p_user, 'admin');
$$;

create or replace function app_private.is_pharmacist(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_role(p_user, 'pharmacist');
$$;

-- Roles allowed to create/edit/delete invoices (fixed per the invoice-edit
-- audit: admin, accountant, reception, pharmacist - counselor intentionally
-- excluded, matches the applied fix in production).
create or replace function app_private.can_bill(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_any_role(
    p_user,
    array['admin','accountant','reception','pharmacist']::public.staff_role[]
  );
$$;

-- RLS: staff can see their own role rows; only admins can see everyone else's.
alter table public.user_roles enable row level security;
alter table public.staff_profiles enable row level security;

create policy user_roles_select on public.user_roles for select
  using (user_id = auth.uid() or app_private.is_admin(auth.uid()));

create policy user_roles_admin_write on public.user_roles for all
  using (app_private.is_admin(auth.uid()))
  with check (app_private.is_admin(auth.uid()));

create policy staff_profiles_select on public.staff_profiles for select
  using (auth.uid() is not null); -- any signed-in staff can see names (for assignment dropdowns)

create policy staff_profiles_self_update on public.staff_profiles for update
  using (user_id = auth.uid() or app_private.is_admin(auth.uid()))
  with check (user_id = auth.uid() or app_private.is_admin(auth.uid()));

create policy staff_profiles_admin_insert on public.staff_profiles for insert
  with check (user_id = auth.uid() or app_private.is_admin(auth.uid()));

-- Auto-create a staff_profiles row whenever a new auth.users row appears.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff_profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- Generic "touch updated_at" trigger function, reused by almost every table
-- in this schema.
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
