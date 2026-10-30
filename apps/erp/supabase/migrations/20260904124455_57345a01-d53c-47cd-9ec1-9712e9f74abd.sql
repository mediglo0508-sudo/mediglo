-- 1) cos_notifications_hub: marketing_head may only target a safe subset of roles
DROP POLICY IF EXISTS cos_notifications_write ON public.cos_notifications_hub;

CREATE POLICY cos_notifications_write
ON public.cos_notifications_hub
FOR ALL
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    app_private.has_role(auth.uid(), 'marketing_head'::app_role)
    AND lower(coalesce(target_role, 'all')::text) = ANY (ARRAY[
      'all','everyone','marketing','marketing_head','marketing_admin','caller','counselor','counselor_1','counselor_2','reception'
    ])
  )
);

-- 2) Pharmacist invoice scope: only their own invoices / lines / consumption
DROP POLICY IF EXISTS pharmacist_read ON public.invoices;
DROP POLICY IF EXISTS pharmacist_insert ON public.invoices;
DROP POLICY IF EXISTS pharmacist_update ON public.invoices;

CREATE POLICY pharmacist_read ON public.invoices
FOR SELECT TO authenticated
USING (app_private.is_pharmacist(auth.uid()) AND created_by = auth.uid());

CREATE POLICY pharmacist_insert ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (app_private.is_pharmacist(auth.uid()) AND created_by = auth.uid());

CREATE POLICY pharmacist_update ON public.invoices
FOR UPDATE TO authenticated
USING (app_private.is_pharmacist(auth.uid()) AND created_by = auth.uid())
WITH CHECK (app_private.is_pharmacist(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS pharmacist_read ON public.invoice_lines;
DROP POLICY IF EXISTS pharmacist_insert ON public.invoice_lines;
DROP POLICY IF EXISTS pharmacist_update ON public.invoice_lines;

CREATE POLICY pharmacist_read ON public.invoice_lines
FOR SELECT TO authenticated
USING (
  app_private.is_pharmacist(auth.uid())
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND i.created_by = auth.uid())
);

CREATE POLICY pharmacist_insert ON public.invoice_lines
FOR INSERT TO authenticated
WITH CHECK (
  app_private.is_pharmacist(auth.uid())
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND i.created_by = auth.uid())
);

CREATE POLICY pharmacist_update ON public.invoice_lines
FOR UPDATE TO authenticated
USING (
  app_private.is_pharmacist(auth.uid())
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND i.created_by = auth.uid())
)
WITH CHECK (
  app_private.is_pharmacist(auth.uid())
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND i.created_by = auth.uid())
);

-- 3) Remove blanket pharmacist rights from the finance-desk policies
DROP POLICY IF EXISTS "invoices write" ON public.invoices;
CREATE POLICY "invoices write" ON public.invoices
FOR ALL TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

DROP POLICY IF EXISTS invoices_update_finance_desk ON public.invoices;
CREATE POLICY invoices_update_finance_desk ON public.invoices
FOR UPDATE TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

DROP POLICY IF EXISTS invoices_delete_finance_desk ON public.invoices;
CREATE POLICY invoices_delete_finance_desk ON public.invoices
FOR DELETE TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

DROP POLICY IF EXISTS "lines write" ON public.invoice_lines;
CREATE POLICY "lines write" ON public.invoice_lines
FOR ALL TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

DROP POLICY IF EXISTS invoice_lines_update_finance_desk ON public.invoice_lines;
CREATE POLICY invoice_lines_update_finance_desk ON public.invoice_lines
FOR UPDATE TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

DROP POLICY IF EXISTS invoice_lines_delete_finance_desk ON public.invoice_lines;
CREATE POLICY invoice_lines_delete_finance_desk ON public.invoice_lines
FOR DELETE TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));
