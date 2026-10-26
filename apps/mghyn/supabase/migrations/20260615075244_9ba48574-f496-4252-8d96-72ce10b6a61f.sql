CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION app_private.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION app_private.is_finance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','accountant'))
$$;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;

DROP POLICY IF EXISTS "view own profile" ON public.profiles;
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
DROP POLICY IF EXISTS "view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "view own profile" ON public.profiles;
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
DROP POLICY IF EXISTS "view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "customers read" ON public.customers;
DROP POLICY IF EXISTS "customers write" ON public.customers;
DROP POLICY IF EXISTS "expenses finance" ON public.expenses;
DROP POLICY IF EXISTS "inv read" ON public.inventory_items;
DROP POLICY IF EXISTS "inv write" ON public.inventory_items;
DROP POLICY IF EXISTS "invoices read" ON public.invoices;
DROP POLICY IF EXISTS "invoices write" ON public.invoices;
DROP POLICY IF EXISTS "lines read" ON public.invoice_lines;
DROP POLICY IF EXISTS "lines write" ON public.invoice_lines;
DROP POLICY IF EXISTS "photos read" ON public.prescription_photos;
DROP POLICY IF EXISTS "photos write" ON public.prescription_photos;
DROP POLICY IF EXISTS "prescriptions read" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions write" ON public.prescriptions;
DROP POLICY IF EXISTS "sc read" ON public.service_consumption;
DROP POLICY IF EXISTS "sc write" ON public.service_consumption;
DROP POLICY IF EXISTS "services read" ON public.services_master;
DROP POLICY IF EXISTS "services write" ON public.services_master;
DROP POLICY IF EXISTS "staff read" ON public.staff;
DROP POLICY IF EXISTS "staff write" ON public.staff;
DROP POLICY IF EXISTS "pkg read" ON public.treatment_packages;
DROP POLICY IF EXISTS "pkg write" ON public.treatment_packages;
DROP POLICY IF EXISTS "vouchers fin" ON public.vouchers;
DROP POLICY IF EXISTS "ventries fin" ON public.voucher_entries;

CREATE POLICY "view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id) OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id) OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL USING (app_private.has_role(auth.uid(), 'admin')) WITH CHECK (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "customers read" ON public.customers FOR SELECT USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "customers write" ON public.customers FOR ALL USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));
CREATE POLICY "expenses finance" ON public.expenses FOR ALL USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));
CREATE POLICY "inv read" ON public.inventory_items FOR SELECT USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "inv write" ON public.inventory_items FOR ALL USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception')) WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "invoices read" ON public.invoices FOR SELECT USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "invoices write" ON public.invoices FOR ALL USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception')) WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "lines read" ON public.invoice_lines FOR SELECT USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'))));
CREATE POLICY "lines write" ON public.invoice_lines FOR ALL USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception')) WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "photos read" ON public.prescription_photos FOR SELECT USING (app_private.has_role(auth.uid(), 'doctor') OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "photos write" ON public.prescription_photos FOR ALL USING (app_private.has_role(auth.uid(), 'doctor') OR app_private.has_role(auth.uid(), 'admin')) WITH CHECK (app_private.has_role(auth.uid(), 'doctor') OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "prescriptions read" ON public.prescriptions FOR SELECT USING (app_private.has_role(auth.uid(), 'doctor') OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "prescriptions write" ON public.prescriptions FOR ALL USING (app_private.has_role(auth.uid(), 'doctor') OR app_private.has_role(auth.uid(), 'admin')) WITH CHECK (app_private.has_role(auth.uid(), 'doctor') OR app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "sc read" ON public.service_consumption FOR SELECT USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "sc write" ON public.service_consumption FOR ALL USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception')) WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "services read" ON public.services_master FOR SELECT USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "services write" ON public.services_master FOR ALL USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception')) WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "staff read" ON public.staff FOR SELECT USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "staff write" ON public.staff FOR ALL USING (app_private.has_role(auth.uid(), 'admin')) WITH CHECK (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "pkg read" ON public.treatment_packages FOR SELECT USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "pkg write" ON public.treatment_packages FOR ALL USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception')) WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'));
CREATE POLICY "vouchers fin" ON public.vouchers FOR ALL USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));
CREATE POLICY "ventries fin" ON public.voucher_entries FOR ALL USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_finance(uuid) FROM PUBLIC;