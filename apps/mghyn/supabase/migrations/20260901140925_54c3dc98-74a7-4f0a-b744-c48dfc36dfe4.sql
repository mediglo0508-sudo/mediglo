
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_customers_email_lower
  ON public.customers (lower(email));

CREATE INDEX IF NOT EXISTS idx_customers_phone_norm
  ON public.customers (right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10));

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS integration_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_integration_key
  ON public.appointments (integration_key) WHERE integration_key IS NOT NULL;
