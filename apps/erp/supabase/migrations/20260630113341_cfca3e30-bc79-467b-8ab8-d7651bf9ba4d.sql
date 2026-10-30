-- clinical_records: restrict to doctor + admin
DROP POLICY IF EXISTS "Staff read clinical_records" ON public.clinical_records;
DROP POLICY IF EXISTS "Staff write clinical_records" ON public.clinical_records;
DROP POLICY IF EXISTS "Staff update clinical_records" ON public.clinical_records;
DROP POLICY IF EXISTS "Staff delete clinical_records" ON public.clinical_records;

CREATE POLICY "Doctors and admins read clinical_records" ON public.clinical_records
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Doctors and admins write clinical_records" ON public.clinical_records
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Doctors and admins update clinical_records" ON public.clinical_records
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Doctors and admins delete clinical_records" ON public.clinical_records
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role));

-- appointments: any assigned staff role; delete limited to admin/reception
DROP POLICY IF EXISTS "Authenticated manage appointments" ON public.appointments;

CREATE POLICY "Staff read appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));

CREATE POLICY "Staff insert appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_any_role(auth.uid()));

CREATE POLICY "Staff update appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

CREATE POLICY "Admin reception delete appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role) OR app_private.has_role(auth.uid(), 'reception'::app_role));

-- inventory: finance + reception only
DROP POLICY IF EXISTS "Authenticated can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated can insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated can update inventory" ON public.inventory;

CREATE POLICY "Finance reception view inventory" ON public.inventory
  FOR SELECT TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "Finance reception insert inventory" ON public.inventory
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "Finance reception update inventory" ON public.inventory
  FOR UPDATE TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));