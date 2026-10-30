
-- 0. has_role helper (idempotent)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
$$;

-- 1. services_master enrichments
ALTER TABLE public.services_master
  ADD COLUMN IF NOT EXISTS auto_followup BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_appointment BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS consumables JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sessions INTEGER NOT NULL DEFAULT 1;

-- 2. customers enrichments
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code TEXT,
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'customers_customer_code_key') THEN
    CREATE UNIQUE INDEX customers_customer_code_key ON public.customers(customer_code) WHERE customer_code IS NOT NULL;
  END IF;
END $$;

-- 3. import_review_queue
CREATE TABLE IF NOT EXISTS public.import_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('whatsapp','excel','master','manual')),
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fixed','discarded')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_review_queue TO authenticated;
GRANT ALL ON public.import_review_queue TO service_role;

ALTER TABLE public.import_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_read" ON public.import_review_queue;
CREATE POLICY "review_read" ON public.import_review_queue FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'reception')
  );

DROP POLICY IF EXISTS "review_write" ON public.import_review_queue;
CREATE POLICY "review_write" ON public.import_review_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE INDEX IF NOT EXISTS import_review_status_idx ON public.import_review_queue(status, created_at DESC);

-- 4. Update auto-book trigger to respect auto_appointment
CREATE OR REPLACE FUNCTION public.auto_book_next_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_service TEXT; v_gap INTEGER; v_auto BOOLEAN; v_next DATE; v_dup INTEGER; v_visit_date DATE;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND lower(coalesce(NEW.status,'')) = 'completed' THEN
    v_service := NEW.area_of_interest;
    IF v_service IS NULL OR v_service = '' THEN RETURN NEW; END IF;
    SELECT gap_days, auto_appointment INTO v_gap, v_auto FROM public.services_master
      WHERE lower(name) = lower(v_service) LIMIT 1;
    IF v_gap IS NULL OR v_gap <= 0 OR v_auto IS DISTINCT FROM TRUE THEN RETURN NEW; END IF;
    v_visit_date := COALESCE(NEW.scheduled_for::date, CURRENT_DATE);
    v_next := v_visit_date + v_gap;
    SELECT COUNT(*) INTO v_dup FROM public.appointments
      WHERE customer_name = NEW.customer_name
        AND appointment_date BETWEEN (v_next - 1) AND (v_next + 1);
    IF v_dup = 0 THEN
      INSERT INTO public.appointments (customer_name, phone, service_inquiry, appointment_date, appointment_time, status, notes)
      VALUES (NEW.customer_name, NEW.phone, v_service, v_next, '10:00', 'scheduled',
              'Auto-booked follow-up (+' || v_gap || 'd)');
    END IF;
  END IF;
  RETURN NEW;
END $function$;
