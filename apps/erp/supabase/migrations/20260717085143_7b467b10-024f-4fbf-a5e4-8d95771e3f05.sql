
DO $$ BEGIN
  CREATE TYPE public.recon_target_type AS ENUM ('invoice','purchase','vendor_payment','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.reconciliation_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_txn_id UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  target_type public.recon_target_type NOT NULL,
  target_id UUID NOT NULL,
  target_ref TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recon_alloc_bank ON public.reconciliation_allocations(bank_txn_id);
CREATE INDEX IF NOT EXISTS idx_recon_alloc_target ON public.reconciliation_allocations(target_type, target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_allocations TO authenticated;
GRANT ALL ON public.reconciliation_allocations TO service_role;

ALTER TABLE public.reconciliation_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance can read allocations" ON public.reconciliation_allocations;
CREATE POLICY "finance can read allocations" ON public.reconciliation_allocations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','accountant')));

DROP POLICY IF EXISTS "finance can write allocations" ON public.reconciliation_allocations;
CREATE POLICY "finance can write allocations" ON public.reconciliation_allocations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','accountant')));

CREATE OR REPLACE FUNCTION public.recon_alloc_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE bank_amt NUMERIC(14,2); used NUMERIC(14,2);
BEGIN
  SELECT COALESCE(amount,0) INTO bank_amt FROM public.bank_statements WHERE id = NEW.bank_txn_id;
  IF bank_amt IS NULL THEN RAISE EXCEPTION 'Unknown bank_txn %', NEW.bank_txn_id; END IF;
  SELECT COALESCE(SUM(amount),0) INTO used FROM public.reconciliation_allocations
    WHERE bank_txn_id = NEW.bank_txn_id AND id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid);
  IF (used + NEW.amount) > bank_amt + 0.01 THEN
    RAISE EXCEPTION 'Allocation total (%) exceeds bank txn amount (%)', used+NEW.amount, bank_amt;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS recon_alloc_guard_trg ON public.reconciliation_allocations;
CREATE TRIGGER recon_alloc_guard_trg
  BEFORE INSERT OR UPDATE ON public.reconciliation_allocations
  FOR EACH ROW EXECUTE FUNCTION public.recon_alloc_guard();

CREATE OR REPLACE FUNCTION public.auto_book_next_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_service_name TEXT; v_gap INTEGER; v_next DATE; v_dup INTEGER;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND lower(coalesce(NEW.status,'')) = 'completed' THEN
    v_service_name := COALESCE(NEW.service_name, NEW.treatment_name);
    IF v_service_name IS NULL OR v_service_name = '' THEN RETURN NEW; END IF;
    SELECT gap_days INTO v_gap FROM public.services_master
      WHERE lower(name) = lower(v_service_name) LIMIT 1;
    IF v_gap IS NULL OR v_gap <= 0 THEN RETURN NEW; END IF;
    v_next := COALESCE(NEW.visit_date::date, CURRENT_DATE) + v_gap;
    SELECT COUNT(*) INTO v_dup FROM public.appointments
      WHERE patient_name = NEW.patient_name
        AND appointment_date BETWEEN (v_next - 1) AND (v_next + 1);
    IF v_dup = 0 THEN
      INSERT INTO public.appointments (patient_name, patient_phone, appointment_date, appointment_time, service, status, notes)
      VALUES (NEW.patient_name, NEW.patient_phone, v_next, '10:00', v_service_name, 'scheduled',
              'Auto-booked follow-up (+' || v_gap || 'd)');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS auto_book_next_session_trg ON public.patient_visits;
CREATE TRIGGER auto_book_next_session_trg
  AFTER UPDATE ON public.patient_visits
  FOR EACH ROW EXECUTE FUNCTION public.auto_book_next_session();
