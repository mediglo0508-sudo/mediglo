
ALTER TABLE public.cos_appointments
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS consultation_route text,
  ADD COLUMN IF NOT EXISTS service_id uuid,
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cos_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid,
  patient_name text NOT NULL,
  patient_phone text,
  trigger_reason text NOT NULL,
  recommended_services jsonb DEFAULT '[]'::jsonb,
  doctor_notes text,
  counselor_notes text,
  assigned_to uuid,
  bucket text,
  status text NOT NULL DEFAULT 'open',
  next_followup_at timestamptz,
  gap_stage int DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_follow_ups TO authenticated;
GRANT ALL ON public.cos_follow_ups TO service_role;
ALTER TABLE public.cos_follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_ups_read" ON public.cos_follow_ups
  FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin')
    OR app_private.has_role(auth.uid(), 'marketing_admin')
    OR app_private.has_role(auth.uid(), 'marketing')
    OR (app_private.has_role(auth.uid(), 'caller') AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  );
CREATE POLICY "follow_ups_write" ON public.cos_follow_ups
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin')
    OR app_private.has_role(auth.uid(), 'marketing_admin')
    OR app_private.has_role(auth.uid(), 'marketing')
    OR (app_private.has_role(auth.uid(), 'caller') AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin')
    OR app_private.has_role(auth.uid(), 'marketing_admin')
    OR app_private.has_role(auth.uid(), 'marketing')
    OR app_private.has_role(auth.uid(), 'caller')
  );
CREATE INDEX IF NOT EXISTS idx_cos_follow_ups_status ON public.cos_follow_ups (status);
CREATE INDEX IF NOT EXISTS idx_cos_follow_ups_assigned ON public.cos_follow_ups (assigned_to);
DROP TRIGGER IF EXISTS trg_cos_follow_ups_updated_at ON public.cos_follow_ups;
CREATE TRIGGER trg_cos_follow_ups_updated_at
  BEFORE UPDATE ON public.cos_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cos_backup_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency text NOT NULL DEFAULT 'off',
  recipient_email text NOT NULL DEFAULT 'account@mediglo.in',
  last_run_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cos_backup_schedule TO authenticated;
GRANT ALL ON public.cos_backup_schedule TO service_role;
ALTER TABLE public.cos_backup_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backup_schedule_admin" ON public.cos_backup_schedule
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));
INSERT INTO public.cos_backup_schedule (frequency)
  SELECT 'off' WHERE NOT EXISTS (SELECT 1 FROM public.cos_backup_schedule);

CREATE OR REPLACE FUNCTION public.cos_appt_cancel_to_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_phone text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND lower(coalesce(NEW.status,'')) LIKE '%cancel%' THEN
    SELECT name, phone INTO v_name, v_phone FROM public.customers WHERE id = NEW.patient_id;
    INSERT INTO public.cos_follow_ups (patient_id, patient_name, patient_phone, trigger_reason, next_followup_at, gap_stage)
    VALUES (NEW.patient_id, coalesce(v_name,'Patient'), v_phone, 'cancelled', now() + interval '2 days', 1);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cos_appt_cancel_followup ON public.cos_appointments;
CREATE TRIGGER trg_cos_appt_cancel_followup
  AFTER UPDATE ON public.cos_appointments
  FOR EACH ROW EXECUTE FUNCTION public.cos_appt_cancel_to_followup();
