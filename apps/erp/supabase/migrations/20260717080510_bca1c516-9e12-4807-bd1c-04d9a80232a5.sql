
BEGIN;

-- Transactional wipe (RESTART IDENTITY + CASCADE); master tables untouched.
TRUNCATE TABLE
  public.invoice_lines,
  public.invoices,
  public.patient_visits,
  public.appointments,
  public.cos_appointments,
  public.cos_scheduled_sessions,
  public.cos_follow_ups,
  public.voucher_entries,
  public.vouchers,
  public.suspense_entries,
  public.clinical_records,
  public.prescription_photos,
  public.prescription_history,
  public.prescriptions,
  public.treatment_logs,
  public.service_consumption,
  public.consumption_logs,
  public.leads,
  public.bank_statements,
  public.customers
RESTART IDENTITY CASCADE;

-- Reset invoice sequence so next invoice = MG/26/01
SELECT setval('public.invoice_seq_2026', 1, false);

COMMIT;
