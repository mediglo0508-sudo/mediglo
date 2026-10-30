-- Vouchers: finance only
DROP POLICY IF EXISTS "vouchers rw" ON public.vouchers;
CREATE POLICY "vouchers fin" ON public.vouchers
  FOR ALL USING (is_finance(auth.uid())) WITH CHECK (is_finance(auth.uid()));

-- Voucher entries: finance only
DROP POLICY IF EXISTS "ventries rw" ON public.voucher_entries;
CREATE POLICY "ventries fin" ON public.voucher_entries
  FOR ALL USING (is_finance(auth.uid())) WITH CHECK (is_finance(auth.uid()));

-- Treatment packages: exclude doctors from reads
DROP POLICY IF EXISTS "pkg read" ON public.treatment_packages;
CREATE POLICY "pkg read" ON public.treatment_packages
  FOR SELECT USING (is_finance(auth.uid()) OR has_role(auth.uid(), 'reception'::app_role));

-- Service consumption: exclude doctors from reads
DROP POLICY IF EXISTS "consumption read" ON public.service_consumption;
CREATE POLICY "consumption read" ON public.service_consumption
  FOR SELECT USING (is_finance(auth.uid()) OR has_role(auth.uid(), 'reception'::app_role));

-- Lock down SECURITY DEFINER helper functions: they are only needed inside RLS,
-- not as directly callable API endpoints.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_finance(uuid) FROM anon, authenticated;