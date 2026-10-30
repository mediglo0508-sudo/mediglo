
-- ===== PHASE 1: Clean transactional data =====
TRUNCATE TABLE
  public.cos_notifications_hub,
  public.cos_chat_messages,
  public.cos_scheduled_sessions,
  public.cos_follow_ups,
  public.prescription_history,
  public.prescription_photos,
  public.prescriptions,
  public.clinical_records,
  public.treatment_logs,
  public.consumption_logs,
  public.service_consumption,
  public.invoice_lines,
  public.invoices,
  public.patient_visits,
  public.cos_appointments,
  public.appointments,
  public.leads,
  public.customers
RESTART IDENTITY CASCADE;

-- ===== PHASE 5: Gap Day / Duration on services_master =====
ALTER TABLE public.services_master
  ADD COLUMN IF NOT EXISTS gap_days integer,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- ===== PHASE 2: booked_by on cos_appointments =====
ALTER TABLE public.cos_appointments
  ADD COLUMN IF NOT EXISTS booked_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_cos_appointments_booked_by
  ON public.cos_appointments(booked_by);

-- ===== PHASE 3: Invoice numbering MG/26/NN =====
CREATE SEQUENCE IF NOT EXISTS public.invoice_seq_2026 START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_no()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fy_two_digit text;
  n bigint;
BEGIN
  fy_two_digit := to_char(CURRENT_DATE, 'YY');
  n := nextval('public.invoice_seq_2026');
  RETURN 'MG/' || fy_two_digit || '/' || lpad(n::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' OR NEW.invoice_no LIKE 'IMP-%' OR NEW.invoice_no LIKE 'POS-%' THEN
    NEW.invoice_no := public.next_invoice_no();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_invoice_no ON public.invoices;
CREATE TRIGGER trg_set_invoice_no
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invoice_no();

-- ===== PHASE 2: Marketing Head reassignment RLS =====
-- Drop existing overly-narrow policy and re-issue
DROP POLICY IF EXISTS follow_ups_write ON public.cos_follow_ups;
DROP POLICY IF EXISTS follow_ups_read ON public.cos_follow_ups;

CREATE POLICY follow_ups_read ON public.cos_follow_ups
  FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'reception'::app_role)
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  );

CREATE POLICY follow_ups_write ON public.cos_follow_ups
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  );
