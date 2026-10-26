ALTER TABLE public.cos_appointments
  ADD COLUMN IF NOT EXISTS appointment_source VARCHAR(50) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS appointment_source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cos_appointments_appointment_source_check'
  ) THEN
    ALTER TABLE public.cos_appointments
      ADD CONSTRAINT cos_appointments_appointment_source_check
      CHECK (appointment_source IN ('manual','google_calendar','facebook','instagram','whatsapp','phone_call','walk_in','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cos_appointments_source ON public.cos_appointments(appointment_source);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);