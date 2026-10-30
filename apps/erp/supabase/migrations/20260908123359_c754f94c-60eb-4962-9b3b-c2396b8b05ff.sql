CREATE TABLE IF NOT EXISTS public.treatment_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  doctor_id UUID NOT NULL,
  diagnosis TEXT,
  clinical_notes TEXT,
  items_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent_to_counselor','finalized')),
  sent_to_counselor_at TIMESTAMPTZ,
  sent_to_counselor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatment_recommendations_customer_id ON public.treatment_recommendations(customer_id);
CREATE INDEX IF NOT EXISTS idx_treatment_recommendations_doctor_id ON public.treatment_recommendations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_treatment_recommendations_encounter_id ON public.treatment_recommendations(encounter_id);
CREATE INDEX IF NOT EXISTS idx_treatment_recommendations_status ON public.treatment_recommendations(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_recommendations TO authenticated;
GRANT ALL ON public.treatment_recommendations TO service_role;

ALTER TABLE public.treatment_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY treatment_recommendations_select_by_role ON public.treatment_recommendations FOR SELECT TO authenticated
  USING (
    doctor_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'counselor')
    OR public.has_role(auth.uid(),'counselor_1')
    OR public.has_role(auth.uid(),'counselor_2')
  );

CREATE POLICY treatment_recommendations_insert_by_role ON public.treatment_recommendations FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id = auth.uid()
    AND (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin'))
  );

CREATE POLICY treatment_recommendations_update_by_role ON public.treatment_recommendations FOR UPDATE TO authenticated
  USING (
    (doctor_id = auth.uid() AND status <> 'finalized') OR public.has_role(auth.uid(),'admin')
  )
  WITH CHECK (
    doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin')
  );

CREATE TRIGGER trg_treatment_recommendations_updated_at
  BEFORE UPDATE ON public.treatment_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.counselor_quotations
  ADD COLUMN IF NOT EXISTS recommendation_id UUID REFERENCES public.treatment_recommendations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_5_percent NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_counselor_quotations_recommendation_id ON public.counselor_quotations(recommendation_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS recommendation_id UUID REFERENCES public.treatment_recommendations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_recommendation_id ON public.invoices(recommendation_id);

-- Security fix: only admins may change a profile's pending dues.
CREATE OR REPLACE FUNCTION public.guard_profile_pending_dues()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pending_dues IS DISTINCT FROM OLD.pending_dues
     AND NOT public.has_role(auth.uid(), 'admin')
     AND auth.role() <> 'service_role' THEN
    NEW.pending_dues := OLD.pending_dues;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_pending_dues ON public.profiles;
CREATE TRIGGER trg_guard_profile_pending_dues
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_pending_dues();