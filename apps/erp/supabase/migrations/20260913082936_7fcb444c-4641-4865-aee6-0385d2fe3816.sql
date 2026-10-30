
DROP POLICY IF EXISTS follow_ups_insert ON public.cos_follow_ups;
CREATE POLICY follow_ups_insert ON public.cos_follow_ups
FOR INSERT TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
  OR (
    (app_private.has_role(auth.uid(), 'marketing'::app_role)
      OR app_private.has_role(auth.uid(), 'caller'::app_role))
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
);

DROP POLICY IF EXISTS cos_notifications_select ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_select ON public.cos_notifications_hub
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    app_private.has_role(auth.uid(), 'admin'::app_role)
    OR target_role IS NULL
    OR lower(target_role::text) = ANY (ARRAY['all','everyone'])
    OR (
      lower(target_role::text) IN (SELECT (unnest(enum_range(NULL::app_role)))::text)
      AND app_private.has_role(auth.uid(), lower(target_role::text)::app_role)
    )
  )
);

DROP POLICY IF EXISTS product_orders_update ON public.product_orders;
CREATE POLICY product_orders_update ON public.product_orders
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::text)
  OR has_role(auth.uid(), 'accountant'::text)
  OR has_role(auth.uid(), 'reception'::text)
  OR (
    has_role(auth.uid(), 'pharmacist'::text)
    AND (
      assigned_to = auth.uid()
      OR (assigned_to IS NULL AND status = 'pending'::text)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::text)
  OR has_role(auth.uid(), 'accountant'::text)
  OR has_role(auth.uid(), 'reception'::text)
  OR (has_role(auth.uid(), 'pharmacist'::text) AND assigned_to = auth.uid())
);
