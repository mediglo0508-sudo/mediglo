
-- Counselor parity with Doctor across clinical modules
DROP POLICY IF EXISTS "Doctors and admins read clinical_records" ON public.clinical_records;
CREATE POLICY "Doctors and admins read clinical_records" ON public.clinical_records FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Doctors and admins write clinical_records" ON public.clinical_records;
CREATE POLICY "Doctors and admins write clinical_records" ON public.clinical_records FOR INSERT TO authenticated
WITH CHECK (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Doctors and admins update clinical_records" ON public.clinical_records;
CREATE POLICY "Doctors and admins update clinical_records" ON public.clinical_records FOR UPDATE TO authenticated
USING (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'))
WITH CHECK (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Doctors and admins delete clinical_records" ON public.clinical_records;
CREATE POLICY "Doctors and admins delete clinical_records" ON public.clinical_records FOR DELETE TO authenticated
USING (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prescriptions read" ON public.prescriptions;
CREATE POLICY "prescriptions read" ON public.prescriptions FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "prescriptions write" ON public.prescriptions;
CREATE POLICY "prescriptions write" ON public.prescriptions FOR ALL TO authenticated
USING (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'))
WITH CHECK (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Clinical staff view inventory" ON public.inventory;
CREATE POLICY "Clinical staff view inventory" ON public.inventory FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "Clinical staff view inventory_items" ON public.inventory_items;
CREATE POLICY "Clinical staff view inventory_items" ON public.inventory_items FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "Clinical staff view services" ON public.services_master;
CREATE POLICY "Clinical staff view services" ON public.services_master FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "Clinical staff manage treatment logs" ON public.treatment_logs;
CREATE POLICY "Clinical staff manage treatment logs" ON public.treatment_logs FOR ALL TO authenticated
USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'reception') OR app_private.is_finance(auth.uid()))
WITH CHECK (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'reception') OR app_private.is_finance(auth.uid()));

-- Billing visibility & interaction for counselors
DROP POLICY IF EXISTS "invoices read" ON public.invoices;
CREATE POLICY "invoices read" ON public.invoices FOR SELECT TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "invoices write" ON public.invoices;
CREATE POLICY "invoices write" ON public.invoices FOR ALL TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "lines read" ON public.invoice_lines;
CREATE POLICY "lines read" ON public.invoice_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id
  AND (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'))));

DROP POLICY IF EXISTS "lines write" ON public.invoice_lines;
CREATE POLICY "lines write" ON public.invoice_lines FOR ALL TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "pkg read" ON public.treatment_packages;
CREATE POLICY "pkg read" ON public.treatment_packages FOR SELECT TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'doctor'));

DROP POLICY IF EXISTS "pkg write" ON public.treatment_packages;
CREATE POLICY "pkg write" ON public.treatment_packages FOR ALL TO authenticated
USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'))
WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS "Admin reception delete appointments" ON public.appointments;
CREATE POLICY "Admin reception delete appointments" ON public.appointments FOR DELETE TO authenticated
USING (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'reception') OR app_private.has_role(auth.uid(),'counselor'));
