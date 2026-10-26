-- Discount tracking on invoices (Invoice Discount Rendering Fix)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- Date & Gender fields for CRM creation modals (Leads / Marketing / Appointments)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entry_date date;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.patient_visits ADD COLUMN IF NOT EXISTS gender text;