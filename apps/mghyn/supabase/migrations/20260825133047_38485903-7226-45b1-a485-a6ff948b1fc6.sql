-- 1) Fix mutable search_path on all remaining public/app_private functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public','app_private')
       AND p.proconfig IS NULL
       AND p.oid NOT IN (SELECT objid FROM pg_depend WHERE deptype='e' AND classid='pg_proc'::regclass)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- 2) Drop obsolete one-off Excel importers exposed on the API schema
DROP FUNCTION IF EXISTS public.excel_import_batch(jsonb);
DROP FUNCTION IF EXISTS public.excel_import_invoice(jsonb);

-- 3) Lock down leftover import/backup staging tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bak_july_excel_dates','excel_stage'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "admins_read_%s" ON public.%I', t, t);
      EXECUTE format('CREATE POLICY "admins_read_%s" ON public.%I FOR SELECT TO authenticated USING (app_private.has_role(auth.uid(), ''admin''::public.app_role))', t, t);
    END IF;
  END LOOP;
END $$;

-- 4) Trigger functions must not be directly callable
REVOKE ALL ON FUNCTION public.enforce_billing_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_duplicate_bill_guard() FROM PUBLIC, anon, authenticated;

-- 5) Move SECURITY DEFINER RPCs out of the exposed schema, expose invoker wrappers
ALTER FUNCTION public.check_duplicate_bill(jsonb) SET SCHEMA app_private;
ALTER FUNCTION public.log_billing_event(jsonb) SET SCHEMA app_private;
ALTER FUNCTION public.my_billing_access() SET SCHEMA app_private;
ALTER FUNCTION public.set_billing_lock(uuid, boolean, text) SET SCHEMA app_private;
ALTER FUNCTION public.set_duplicate_override(uuid, boolean) SET SCHEMA app_private;

REVOKE ALL ON FUNCTION app_private.check_duplicate_bill(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.log_billing_event(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.my_billing_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.set_billing_lock(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.set_duplicate_override(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION app_private.check_duplicate_bill(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.log_billing_event(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.my_billing_access() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.set_billing_lock(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.set_duplicate_override(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_duplicate_bill(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT app_private.check_duplicate_bill(p) $$;

CREATE OR REPLACE FUNCTION public.log_billing_event(p jsonb)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$ SELECT app_private.log_billing_event(p) $$;

CREATE OR REPLACE FUNCTION public.my_billing_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT app_private.my_billing_access() $$;

CREATE OR REPLACE FUNCTION public.set_billing_lock(p_user_id uuid, p_locked boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$ SELECT app_private.set_billing_lock(p_user_id, p_locked, p_reason) $$;

CREATE OR REPLACE FUNCTION public.set_duplicate_override(p_user_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$ SELECT app_private.set_duplicate_override(p_user_id, p_enabled) $$;

REVOKE ALL ON FUNCTION public.check_duplicate_bill(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_billing_event(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_billing_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_billing_lock(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_duplicate_override(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_duplicate_bill(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_billing_event(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_billing_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_billing_lock(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_duplicate_override(uuid, boolean) TO authenticated;