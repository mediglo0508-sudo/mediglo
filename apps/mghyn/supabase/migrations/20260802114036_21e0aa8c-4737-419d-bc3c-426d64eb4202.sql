-- Purchases: scope to finance roles
DROP POLICY IF EXISTS "purch staff read" ON public.purchases;
DROP POLICY IF EXISTS "purch staff write" ON public.purchases;

CREATE POLICY "purchases finance read" ON public.purchases
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'accountant'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
);

CREATE POLICY "purchases finance write" ON public.purchases
FOR ALL TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'accountant'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'accountant'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
);

-- Vendors: scope to finance roles
DROP POLICY IF EXISTS "vendors staff read" ON public.vendors;
DROP POLICY IF EXISTS "vendors staff write" ON public.vendors;

CREATE POLICY "vendors finance read" ON public.vendors
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'accountant'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
);

CREATE POLICY "vendors finance write" ON public.vendors
FOR ALL TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'accountant'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'accountant'::app_role)
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
);

-- Follow-ups: remove the "assigned_to IS NULL" write loophole and state delete rules explicitly
DROP POLICY IF EXISTS follow_ups_write ON public.cos_follow_ups;

CREATE POLICY follow_ups_write ON public.cos_follow_ups
FOR ALL TO authenticated
USING (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (assigned_to = auth.uid())
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (assigned_to = auth.uid())
);

CREATE POLICY follow_ups_delete ON public.cos_follow_ups
FOR DELETE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (assigned_to = auth.uid())
);