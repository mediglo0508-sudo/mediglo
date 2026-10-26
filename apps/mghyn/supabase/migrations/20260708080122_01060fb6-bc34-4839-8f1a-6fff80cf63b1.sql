-- 3 & 5: Therapist/nursing (and doctor) read-only access to services & inventory
CREATE POLICY "Clinical staff view services" ON public.services_master FOR SELECT
  USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor'));
CREATE POLICY "Clinical staff view inventory" ON public.inventory FOR SELECT
  USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor'));
CREATE POLICY "Clinical staff view inventory_items" ON public.inventory_items FOR SELECT
  USING (app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor'));

-- 4: persistent treatment timers on the visit
ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS treatment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS treatment_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS treatment_duration_sec integer;

-- 4: durable treatment history linked to patient + therapist
CREATE TABLE IF NOT EXISTS public.treatment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid,
  patient_name text,
  therapist text,
  treatment text,
  room text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_sec integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_logs TO authenticated;
GRANT ALL ON public.treatment_logs TO service_role;

ALTER TABLE public.treatment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical staff manage treatment logs" ON public.treatment_logs FOR ALL
  USING (
    app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor')
    OR app_private.has_role(auth.uid(),'reception') OR app_private.is_finance(auth.uid())
  )
  WITH CHECK (
    app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'doctor')
    OR app_private.has_role(auth.uid(),'reception') OR app_private.is_finance(auth.uid())
  );

CREATE TRIGGER update_treatment_logs_updated_at BEFORE UPDATE ON public.treatment_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();