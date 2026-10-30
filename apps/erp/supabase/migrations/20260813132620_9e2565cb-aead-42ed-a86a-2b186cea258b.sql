DROP POLICY IF EXISTS follow_ups_read ON public.cos_follow_ups;
DROP POLICY IF EXISTS follow_ups_write ON public.cos_follow_ups;
DROP POLICY IF EXISTS follow_ups_delete ON public.cos_follow_ups;

CREATE POLICY follow_ups_read ON public.cos_follow_ups
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
  OR assigned_to = auth.uid()
  OR assigned_to IS NULL
);

CREATE POLICY follow_ups_insert ON public.cos_follow_ups
FOR INSERT TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
);

CREATE POLICY follow_ups_update ON public.cos_follow_ups
FOR UPDATE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR (
    assigned_to IS NULL
    AND (
      app_private.has_role(auth.uid(), 'marketing'::app_role)
      OR app_private.has_role(auth.uid(), 'caller'::app_role)
    )
  )
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
);

CREATE POLICY follow_ups_delete ON public.cos_follow_ups
FOR DELETE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
);