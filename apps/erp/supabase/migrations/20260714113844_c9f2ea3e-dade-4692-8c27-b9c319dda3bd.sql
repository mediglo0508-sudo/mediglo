
CREATE TABLE IF NOT EXISTS public.prescription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  doctor_notes TEXT,
  counselor_notes TEXT,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_by UUID,
  recorded_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_history TO authenticated;
GRANT ALL ON public.prescription_history TO service_role;

ALTER TABLE public.prescription_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescription_history_auth_access ON public.prescription_history;
CREATE POLICY prescription_history_auth_access ON public.prescription_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prescription_history_patient ON public.prescription_history (patient_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescription_history_visit ON public.prescription_history (visit_id, created_at DESC);
