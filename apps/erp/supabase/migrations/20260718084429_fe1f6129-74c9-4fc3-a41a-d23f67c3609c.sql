
-- ============ Schema additions ============
ALTER TABLE public.cos_appointments
  ADD COLUMN IF NOT EXISTS therapist_id UUID,
  ADD COLUMN IF NOT EXISTS important_note TEXT,
  ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.service_wallets(id) ON DELETE SET NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);
CREATE INDEX IF NOT EXISTS idx_cos_appt_date_therapist ON public.cos_appointments (appointment_date, therapist_id);
CREATE INDEX IF NOT EXISTS idx_cos_appt_date_room ON public.cos_appointments (appointment_date, room_id);
CREATE INDEX IF NOT EXISTS idx_cos_appt_date_doctor ON public.cos_appointments (appointment_date, doctor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON public.invoices (customer_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_wallets_customer_status ON public.service_wallets (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_wallet_redemptions_wallet ON public.wallet_redemptions (wallet_id, redeemed_at DESC);

-- Prevent double-redemption per appointment (if wallet_redemptions has appointment_id column, else skip via DO block)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='wallet_redemptions' AND column_name='appointment_id') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_redemptions_appointment
      ON public.wallet_redemptions (appointment_id) WHERE appointment_id IS NOT NULL;
  END IF;
END $$;

-- ============ Concurrency guard ============
CREATE OR REPLACE FUNCTION public.cos_appt_concurrency_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_conflict INT; v_is_consult BOOLEAN;
BEGIN
  IF lower(coalesce(NEW.status,'')) LIKE '%cancel%' THEN RETURN NEW; END IF;
  IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN RETURN NEW; END IF;

  v_is_consult := coalesce(lower(NEW.consultation_route),'') LIKE '%consult%'
               OR coalesce(lower(NEW.patient_concern),'') LIKE '%consult%';

  -- Same therapist double-book
  IF NEW.therapist_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM public.cos_appointments
    WHERE id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND appointment_date = NEW.appointment_date
      AND therapist_id = NEW.therapist_id
      AND lower(coalesce(status,'')) NOT LIKE '%cancel%'
      AND (NEW.start_time, NEW.end_time) OVERLAPS (start_time, end_time);
    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'Therapist already booked for an overlapping slot';
    END IF;
  END IF;

  -- Same room double-book
  IF NEW.room_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM public.cos_appointments
    WHERE id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND appointment_date = NEW.appointment_date
      AND room_id = NEW.room_id
      AND lower(coalesce(status,'')) NOT LIKE '%cancel%'
      AND (NEW.start_time, NEW.end_time) OVERLAPS (start_time, end_time);
    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'Room already occupied for an overlapping slot';
    END IF;
  END IF;

  -- Doctor concurrency only for consultation-type
  IF v_is_consult AND NEW.doctor_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM public.cos_appointments
    WHERE id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND appointment_date = NEW.appointment_date
      AND doctor_id = NEW.doctor_id
      AND (lower(coalesce(consultation_route,'')) LIKE '%consult%' OR lower(coalesce(patient_concern,'')) LIKE '%consult%')
      AND lower(coalesce(status,'')) NOT LIKE '%cancel%'
      AND (NEW.start_time, NEW.end_time) OVERLAPS (start_time, end_time);
    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'Doctor already has an overlapping consultation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.cos_appt_concurrency_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cos_appt_concurrency ON public.cos_appointments;
CREATE TRIGGER trg_cos_appt_concurrency
  BEFORE INSERT OR UPDATE OF start_time, end_time, therapist_id, room_id, doctor_id, appointment_date, status
  ON public.cos_appointments
  FOR EACH ROW EXECUTE FUNCTION public.cos_appt_concurrency_guard();

-- ============ Audit log ============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,           -- INSERT / UPDATE / DELETE
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log staff read" ON public.audit_log;
CREATE POLICY "audit_log staff read" ON public.audit_log FOR SELECT
  TO authenticated USING (app_private.has_any_role(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID; v_name TEXT; v_role TEXT; v_id TEXT; v_old JSONB; v_new JSONB;
BEGIN
  v_uid := auth.uid();
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL; v_id := (OLD).id::text;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW); v_id := (NEW).id::text;
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_id := (NEW).id::text;
  END IF;

  INSERT INTO public.audit_log (user_id, user_name, user_role, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, v_name, v_role, TG_OP, TG_TABLE_NAME, v_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','cos_appointments','invoices','service_wallets','wallet_redemptions','customers','leads']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$I ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$I AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()', t);
  END LOOP;
END $$;
