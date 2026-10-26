-- Repoint import_review_queue policies to canonical app_private.has_role
DROP POLICY IF EXISTS "review_read" ON public.import_review_queue;
CREATE POLICY "review_read" ON public.import_review_queue FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
  );

DROP POLICY IF EXISTS "review_write" ON public.import_review_queue;
CREATE POLICY "review_write" ON public.import_review_queue FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
  );

-- Eliminate the duplicated role-check logic: public.has_role now delegates
-- to the canonical app_private.has_role. Kept only because dozens of legacy
-- policies still reference public.has_role(uuid, text); rewriting each is a
-- separate migration.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT app_private.has_role(_user_id, _role::public.app_role)
$$;

-- Lock down execution: only authenticated users need it (for RLS evaluation).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
