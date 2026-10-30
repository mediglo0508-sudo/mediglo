-- Re-scope policies from the {public} role group to {authenticated}

-- bank_statements
DROP POLICY IF EXISTS "bank_stmt finance" ON public.bank_statements;
CREATE POLICY "bank_stmt finance" ON public.bank_statements FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));

-- customers
DROP POLICY IF EXISTS "customers read" ON public.customers;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "customers write" ON public.customers;
CREATE POLICY "customers write" ON public.customers FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));

-- expenses
DROP POLICY IF EXISTS "expenses finance" ON public.expenses;
CREATE POLICY "expenses finance" ON public.expenses FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));

-- inventory_items
DROP POLICY IF EXISTS "inv read" ON public.inventory_items;
CREATE POLICY "inv read" ON public.inventory_items FOR SELECT TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));
DROP POLICY IF EXISTS "inv write" ON public.inventory_items;
CREATE POLICY "inv write" ON public.inventory_items FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

-- prescription_photos
DROP POLICY IF EXISTS "photos read" ON public.prescription_photos;
CREATE POLICY "photos read" ON public.prescription_photos FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role) OR app_private.has_role(auth.uid(), 'counselor'::app_role));
DROP POLICY IF EXISTS "photos write" ON public.prescription_photos;
CREATE POLICY "photos write" ON public.prescription_photos FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role) OR app_private.has_role(auth.uid(), 'counselor'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'doctor'::app_role) OR app_private.has_role(auth.uid(), 'admin'::app_role) OR app_private.has_role(auth.uid(), 'counselor'::app_role));

-- profiles
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((auth.uid() = id) OR app_private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "view own profile" ON public.profiles;
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated
  USING ((auth.uid() = id) OR app_private.has_role(auth.uid(), 'admin'::app_role));

-- service_consumption
DROP POLICY IF EXISTS "sc read" ON public.service_consumption;
CREATE POLICY "sc read" ON public.service_consumption FOR SELECT TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));
DROP POLICY IF EXISTS "sc write" ON public.service_consumption;
CREATE POLICY "sc write" ON public.service_consumption FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

-- services_master
DROP POLICY IF EXISTS "services read" ON public.services_master;
CREATE POLICY "services read" ON public.services_master FOR SELECT TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));
DROP POLICY IF EXISTS "services write" ON public.services_master;
CREATE POLICY "services write" ON public.services_master FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(), 'reception'::app_role));

-- staff
DROP POLICY IF EXISTS "staff read" ON public.staff;
CREATE POLICY "staff read" ON public.staff FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "staff write" ON public.staff;
CREATE POLICY "staff write" ON public.staff FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

-- suspense_entries
DROP POLICY IF EXISTS "suspense finance" ON public.suspense_entries;
CREATE POLICY "suspense finance" ON public.suspense_entries FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));

-- vouchers / voucher_entries
DROP POLICY IF EXISTS "vouchers fin" ON public.vouchers;
CREATE POLICY "vouchers fin" ON public.vouchers FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));
DROP POLICY IF EXISTS "ventries fin" ON public.voucher_entries;
CREATE POLICY "ventries fin" ON public.voucher_entries FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid())) WITH CHECK (app_private.is_finance(auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "view own roles" ON public.user_roles;
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::app_role));