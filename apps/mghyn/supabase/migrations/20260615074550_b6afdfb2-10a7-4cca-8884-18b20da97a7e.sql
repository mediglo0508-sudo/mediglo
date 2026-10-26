DROP POLICY IF EXISTS "pkg write" ON public.treatment_packages;
CREATE POLICY "pkg write" ON public.treatment_packages
FOR ALL
USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'::public.app_role))
WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'::public.app_role));

DROP POLICY IF EXISTS "inv read" ON public.inventory_items;
CREATE POLICY "inv read" ON public.inventory_items
FOR SELECT
USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'::public.app_role));

DROP POLICY IF EXISTS "services read" ON public.services_master;
CREATE POLICY "services read" ON public.services_master
FOR SELECT
USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'::public.app_role));