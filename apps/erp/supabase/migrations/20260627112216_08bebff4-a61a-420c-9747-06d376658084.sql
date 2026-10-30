-- CRM: optional Age & Gender on customer profiles
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text;

-- Live Room Grid: richer occupancy details (patient name + busy-till window)
ALTER TABLE public.clinic_rooms
  ADD COLUMN IF NOT EXISTS current_patient_name text,
  ADD COLUMN IF NOT EXISTS busy_till timestamp with time zone;
