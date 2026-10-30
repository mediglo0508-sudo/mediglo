-- MODULE 1: SCHEMA UPGRADES

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_dues numeric(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS custom_interest_notes text,
  ADD COLUMN IF NOT EXISTS selected_services jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Clinical records
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid,
  record_type varchar(50),
  prescription_notes text,
  investigations text,
  suggested_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_medicines jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_interested boolean,
  consultation_fee_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_records TO authenticated;
GRANT ALL ON public.clinical_records TO service_role;
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read clinical_records" ON public.clinical_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write clinical_records" ON public.clinical_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff update clinical_records" ON public.clinical_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff delete clinical_records" ON public.clinical_records FOR DELETE TO authenticated USING (true);

-- Clinic rooms
CREATE TABLE IF NOT EXISTS public.clinic_rooms (
  id serial PRIMARY KEY,
  room_name varchar(100) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'FREE',
  current_patient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  current_treatment varchar(255),
  assigned_staff_id uuid,
  last_updated timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_rooms TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.clinic_rooms_id_seq TO authenticated;
GRANT ALL ON public.clinic_rooms TO service_role;
ALTER TABLE public.clinic_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read clinic_rooms" ON public.clinic_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write clinic_rooms" ON public.clinic_rooms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff update clinic_rooms" ON public.clinic_rooms FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff delete clinic_rooms" ON public.clinic_rooms FOR DELETE TO authenticated USING (true);

-- Staff roster
CREATE TABLE IF NOT EXISTS public.staff_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name varchar(255) NOT NULL,
  role varchar(100),
  is_available boolean NOT NULL DEFAULT true,
  current_room_id int REFERENCES public.clinic_rooms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_roster TO authenticated;
GRANT ALL ON public.staff_roster TO service_role;
ALTER TABLE public.staff_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read staff_roster" ON public.staff_roster FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff write staff_roster" ON public.staff_roster FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff update staff_roster" ON public.staff_roster FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff delete staff_roster" ON public.staff_roster FOR DELETE TO authenticated USING (true);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_clinical_records_updated ON public.clinical_records;
CREATE TRIGGER trg_clinical_records_updated BEFORE UPDATE ON public.clinical_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_staff_roster_updated ON public.staff_roster;
CREATE TRIGGER trg_staff_roster_updated BEFORE UPDATE ON public.staff_roster FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed rooms
INSERT INTO public.clinic_rooms (room_name) VALUES
  ('Derma Room (Room 1)'),
  ('Radicine Room (Room 2)'),
  ('Clarity Room (Room 3)'),
  ('Soprano Room (Room 4)'),
  ('Triton Technology Room (Room 5)'),
  ('Dr. Room'),
  ('Counselor Room')
ON CONFLICT DO NOTHING;

-- Wipe dummy/test staff
DELETE FROM public.staff WHERE name ILIKE '%vikas%' OR name ILIKE '%gourav%' OR email ILIKE '%test%' OR email ILIKE '%dummy%' OR email ILIKE '%example.com';