
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','doctor','reception','accountant');
CREATE TYPE public.voucher_type AS ENUM ('sales','purchase','payment','receipt','contra','credit_note','debit_note');
CREATE TYPE public.tax_mode AS ENUM ('inclusive','exclusive');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_finance(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','accountant'))
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- profiles policies
CREATE POLICY "view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles policies
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- new user trigger: create profile + bootstrap first user as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone');
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STAFF ============
CREATE TABLE public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role_title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read" ON public.staff FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff write" ON public.staff FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception')) WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));

-- ============ SERVICES MASTER ============
CREATE TABLE public.services_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  sac_code TEXT NOT NULL,
  gst_rate NUMERIC NOT NULL DEFAULT 5,
  default_price NUMERIC NOT NULL DEFAULT 0,
  cost_estimate NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services_master TO authenticated;
GRANT ALL ON public.services_master TO service_role;
ALTER TABLE public.services_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services read" ON public.services_master FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "services write" ON public.services_master FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception')) WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services_master FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INVENTORY ============
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'General',
  name TEXT NOT NULL,
  sku TEXT,
  gst_rate NUMERIC NOT NULL DEFAULT 5,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv read" ON public.inventory_items FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "inv write" ON public.inventory_items FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception')) WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CUSTOMERS (B2C) ============
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  state_code TEXT NOT NULL DEFAULT '07',
  client_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cust read" ON public.customers FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "cust write" ON public.customers FOR ALL USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_cust_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TREATMENT PACKAGES ============
CREATE TABLE public.treatment_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  total_sessions INT NOT NULL DEFAULT 1,
  sessions_completed INT NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_packages TO authenticated;
GRANT ALL ON public.treatment_packages TO service_role;
ALTER TABLE public.treatment_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pkg read" ON public.treatment_packages FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "pkg write" ON public.treatment_packages FOR ALL USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_pkg_updated BEFORE UPDATE ON public.treatment_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_no TEXT,
  customer_id UUID REFERENCES public.customers ON DELETE SET NULL,
  customer_name TEXT,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  state_code TEXT NOT NULL DEFAULT '07',
  tax_mode public.tax_mode NOT NULL DEFAULT 'inclusive',
  payment_mode TEXT NOT NULL DEFAULT 'Cash',
  base_amount NUMERIC NOT NULL DEFAULT 0,
  cgst NUMERIC NOT NULL DEFAULT 0,
  sgst NUMERIC NOT NULL DEFAULT 0,
  gross_total NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  pending_balance NUMERIC NOT NULL DEFAULT 0,
  assigned_staff TEXT,
  source TEXT NOT NULL DEFAULT 'pos',
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- financial read: admin, accountant, reception (NOT doctor)
CREATE POLICY "inv_fin read" ON public.invoices FOR SELECT USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));
CREATE POLICY "inv_fin write" ON public.invoices FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception')) WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INVOICE LINES ============
CREATE TABLE public.invoice_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices ON DELETE CASCADE,
  description TEXT NOT NULL,
  sac_code TEXT,
  qty NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  base_amount NUMERIC NOT NULL DEFAULT 0,
  cgst NUMERIC NOT NULL DEFAULT 0,
  sgst NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  session_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invline read" ON public.invoice_lines FOR SELECT USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));
CREATE POLICY "invline write" ON public.invoice_lines FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception')) WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(),'reception'));

-- ============ VOUCHERS (finance only) ============
CREATE TABLE public.vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtype public.voucher_type NOT NULL,
  voucher_no TEXT,
  vdate DATE NOT NULL DEFAULT CURRENT_DATE,
  party TEXT,
  narration TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  gst_rate NUMERIC NOT NULL DEFAULT 0,
  cgst NUMERIC NOT NULL DEFAULT 0,
  sgst NUMERIC NOT NULL DEFAULT 0,
  payment_mode TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vouchers fin" ON public.vouchers FOR ALL USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));
CREATE TRIGGER trg_vouchers_updated BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.voucher_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id UUID NOT NULL REFERENCES public.vouchers ON DELETE CASCADE,
  ledger TEXT NOT NULL,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_entries TO authenticated;
GRANT ALL ON public.voucher_entries TO service_role;
ALTER TABLE public.voucher_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ventries fin" ON public.voucher_entries FOR ALL USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));

-- ============ EXPENSES (finance only) ============
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'Cash',
  paid_to TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses fin" ON public.expenses FOR ALL USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRESCRIPTIONS (clinical) ============
CREATE TABLE public.prescriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers ON DELETE SET NULL,
  customer_name TEXT,
  doctor_id UUID DEFAULT auth.uid(),
  diagnosis TEXT,
  clinical_notes TEXT,
  medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_staff TEXT,
  rx_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rx read" ON public.prescriptions FOR SELECT USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rx write" ON public.prescriptions FOR ALL USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rx_updated BEFORE UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.prescription_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prescription_id UUID REFERENCES public.prescriptions ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers ON DELETE SET NULL,
  image_data TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_photos TO authenticated;
GRANT ALL ON public.prescription_photos TO service_role;
ALTER TABLE public.prescription_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rxphoto read" ON public.prescription_photos FOR SELECT USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rxphoto write" ON public.prescription_photos FOR ALL USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin'));
