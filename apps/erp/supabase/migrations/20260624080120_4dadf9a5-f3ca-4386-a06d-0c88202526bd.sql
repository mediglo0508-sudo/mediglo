-- Module 2: Tri-tier inventory tables
CREATE TABLE public.retail_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT,
  name TEXT NOT NULL,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  vendor TEXT,
  hsn_code TEXT,
  batch_no TEXT,
  mrp NUMERIC,
  rate NUMERIC,
  expiry TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_products TO authenticated;
GRANT ALL ON public.retail_products TO service_role;
ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage retail_products" ON public.retail_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.injectable_consumables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  batch_no TEXT,
  per_piece NUMERIC,
  rate NUMERIC,
  expiry TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.injectable_consumables TO authenticated;
GRANT ALL ON public.injectable_consumables TO service_role;
ALTER TABLE public.injectable_consumables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage injectable_consumables" ON public.injectable_consumables FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inhouse_surgical (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  qty TEXT,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  rate NUMERIC,
  expiry TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inhouse_surgical TO authenticated;
GRANT ALL ON public.inhouse_surgical TO service_role;
ALTER TABLE public.inhouse_surgical ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage inhouse_surgical" ON public.inhouse_surgical FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_retail_products_updated BEFORE UPDATE ON public.retail_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_injectable_consumables_updated BEFORE UPDATE ON public.injectable_consumables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inhouse_surgical_updated BEFORE UPDATE ON public.inhouse_surgical FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Module 3: package status / scheduling on patient_visits
ALTER TABLE public.patient_visits ADD COLUMN IF NOT EXISTS package_status TEXT;
ALTER TABLE public.patient_visits ADD COLUMN IF NOT EXISTS busy_till TIMESTAMPTZ;

-- Module 6: appointments for existing customers
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT,
  service_inquiry TEXT,
  appointment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage appointments" ON public.appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;