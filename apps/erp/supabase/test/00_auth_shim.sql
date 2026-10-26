-- =============================================================================
-- Local test-only shim that stands in for the parts of Supabase's built-in
-- `auth` schema that these migrations depend on: a minimal `auth.users`
-- table and the real `auth.uid()` implementation (reads the same
-- `request.jwt.claims` GUC that PostgREST/Supabase sets from a verified JWT
-- on every request). This is NOT part of the app's migrations - it exists
-- only so the actual migration files can be applied and exercised against a
-- real local Postgres for verification, with RLS behaving exactly as it
-- would against a real Supabase project (same auth.uid() mechanism).
-- =============================================================================

create extension if not exists pgcrypto;

-- Supabase's platform creates these three roles automatically in every
-- project (anon = unauthenticated PostgREST requests, authenticated = any
-- signed-in user, service_role = full-access server-side key). They are not
-- part of this app's own migrations - replicate them here only so the real
-- migrations' grant/revoke statements apply the same way they would there.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon to postgres;
grant authenticated to postgres;
grant service_role to postgres;

-- Supabase's platform also pre-configures the `public` schema with default
-- privileges before any project migration ever runs:
--   - anon/authenticated get USAGE on schema public and full DML
--     (select/insert/update/delete) on every table going forward, with RLS
--     doing the real access control from there.
--   - EXECUTE on newly created functions is REVOKED from PUBLIC by default
--     (the opposite of plain Postgres's default-grant-to-PUBLIC behaviour) -
--     this is exactly why a migration has to explicitly
--     `grant execute ... to authenticated` for every RPC it wants callable,
--     and it's what let the original audit's missing-grant-on-
--     next_invoice_no() bug happen in the first place. Replicating it here
--     is the whole point of this test harness: an app migration with a
--     missing grant fails the same way here as it would on a real project.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from public;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- This is Supabase's actual auth.uid() implementation verbatim.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

-- Test helper: simulate "signed in as this user" for the rest of the session,
-- the same way PostgREST sets request.jwt.claims per-request from a real JWT.
create or replace function auth.login_as(p_user uuid) returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user::text)::text, false);
$$;

create or replace function auth.logout() returns void
language sql
as $$
  select set_config('request.jwt.claims', '', false);
$$;

-- Real Supabase projects grant USAGE on the auth schema and EXECUTE on
-- auth.uid()/auth.jwt() etc. broadly (every RLS policy in every migration
-- calls auth.uid() as anon/authenticated) - replicate that here too.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.login_as(uuid) to anon, authenticated, service_role;
grant execute on function auth.logout() to anon, authenticated, service_role;
