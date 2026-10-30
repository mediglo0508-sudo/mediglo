-- New role types for the workflow
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'counselor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'therapist';

-- ============ LEADS (Stage 1) ============
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  area_of_interest text NOT NULL DEFAULT 'Dr. Consultation',
  status text NOT NULL DEFAULT 'new',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads staff read" ON public.leads FOR SELECT TO authenticated USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "leads staff write" ON public.leads FOR ALL TO authenticated USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));

-- ============ PATIENT VISITS (Stages 2-6) ============
CREATE TABLE public.patient_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  area_of_interest text,
  status text NOT NULL DEFAULT 'reception',
  lead_id uuid,
  doctor_notes text,
  prescription text,
  counselor_notes text,
  package_price numeric DEFAULT 0,
  total_sessions integer DEFAULT 0,
  discount_pct numeric DEFAULT 0,
  payment_mode text,
  assigned_staff text,
  room text,
  scheduled_for date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_visits TO authenticated;
GRANT ALL ON public.patient_visits TO service_role;
ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits staff read" ON public.patient_visits FOR SELECT TO authenticated USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "visits staff write" ON public.patient_visits FOR ALL TO authenticated USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));

-- ============ TREATMENT ROOMS (Stage 4) ============
CREATE TABLE public.treatment_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'free',
  current_visit_id uuid,
  current_patient text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_rooms TO authenticated;
GRANT ALL ON public.treatment_rooms TO service_role;
ALTER TABLE public.treatment_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms staff read" ON public.treatment_rooms FOR SELECT TO authenticated USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "rooms staff write" ON public.treatment_rooms FOR ALL TO authenticated USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));
INSERT INTO public.treatment_rooms (name) VALUES ('Room 1'), ('Room 2'), ('Room 3'), ('Laser Bay');

-- ============ CONSUMPTION LOGS (Stage 5) ============
CREATE TABLE public.consumption_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid,
  patient_name text,
  item_id uuid,
  item_name text NOT NULL,
  qty_used numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'pcs',
  status text NOT NULL DEFAULT 'pending',
  staff text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumption_logs TO authenticated;
GRANT ALL ON public.consumption_logs TO service_role;
ALTER TABLE public.consumption_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consumlog staff read" ON public.consumption_logs FOR SELECT TO authenticated USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "consumlog staff write" ON public.consumption_logs FOR ALL TO authenticated USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));

-- ============ VENDORS (Smart Purchase) ============
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gstin text,
  address text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors staff read" ON public.vendors FOR SELECT TO authenticated USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "vendors staff write" ON public.vendors FOR ALL TO authenticated USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));

-- ============ PURCHASES (Smart Purchase) ============
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid,
  company_name text,
  product_name text NOT NULL,
  purchase_rate numeric NOT NULL DEFAULT 0,
  gst_pct numeric DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  purchase_date date NOT NULL DEFAULT current_date,
  payment_status text NOT NULL DEFAULT 'Pending',
  bill_no text,
  hsn_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purch staff read" ON public.purchases FOR SELECT TO authenticated USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "purch staff write" ON public.purchases FOR ALL TO authenticated USING (app_private.has_any_role(auth.uid())) WITH CHECK (app_private.has_any_role(auth.uid()));

-- ============ REALTIME ============
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.patient_visits REPLICA IDENTITY FULL;
ALTER TABLE public.treatment_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.consumption_logs REPLICA IDENTITY FULL;
ALTER TABLE public.purchases REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_visits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.consumption_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;