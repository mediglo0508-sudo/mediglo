ALTER TABLE public.clinic_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.staff_roster REPLICA IDENTITY FULL;
ALTER TABLE public.clinical_records REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_rooms; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_roster; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.clinical_records; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;