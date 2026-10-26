ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS seen_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_time text,
  ADD COLUMN IF NOT EXISTS bill_kind text,
  ADD COLUMN IF NOT EXISTS bill_items jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_visits;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_rooms;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;