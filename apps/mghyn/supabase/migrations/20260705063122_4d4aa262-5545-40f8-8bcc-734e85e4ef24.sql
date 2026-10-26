ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_time time,
  ADD COLUMN IF NOT EXISTS email text;