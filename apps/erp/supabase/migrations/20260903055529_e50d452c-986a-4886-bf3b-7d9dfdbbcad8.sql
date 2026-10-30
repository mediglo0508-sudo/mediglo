-- 1. Restore stock deduction access for logged-in staff
GRANT EXECUTE ON FUNCTION app_private.deduct_inventory_stock(jsonb, text, text, text) TO authenticated;

-- 2. Public wrapper so the server-side OAuth code can resolve a user's scopes
CREATE OR REPLACE FUNCTION public.oauth_user_scopes(_uid uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT app_private.oauth_user_scopes(_uid) $$;

REVOKE ALL ON FUNCTION public.oauth_user_scopes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oauth_user_scopes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.oauth_user_scopes(uuid) TO service_role;

-- 3. Allow marketing/caller staff to save updates on unassigned follow-ups
DROP POLICY IF EXISTS follow_ups_update ON public.cos_follow_ups;
CREATE POLICY follow_ups_update ON public.cos_follow_ups
FOR UPDATE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR assigned_to = auth.uid()
  OR (assigned_to IS NULL AND (app_private.has_role(auth.uid(), 'marketing'::app_role) OR app_private.has_role(auth.uid(), 'caller'::app_role)))
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR assigned_to = auth.uid()
  OR (assigned_to IS NULL AND (app_private.has_role(auth.uid(), 'marketing'::app_role) OR app_private.has_role(auth.uid(), 'caller'::app_role)))
);