DROP POLICY IF EXISTS "Marketing view services" ON public.services_master;
CREATE POLICY "Marketing view services" ON public.services_master
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'marketing'::public.app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::public.app_role)
  OR app_private.has_role(auth.uid(), 'marketing_admin'::public.app_role)
  OR app_private.has_role(auth.uid(), 'caller'::public.app_role)
);