
-- PHASE 1: Wipe transactional data, preserve masters
TRUNCATE TABLE
  public.invoice_lines,
  public.invoices,
  public.voucher_entries,
  public.vouchers,
  public.patient_visits,
  public.appointments,
  public.cos_appointments,
  public.cos_follow_ups,
  public.cos_scheduled_sessions,
  public.cos_chat_messages,
  public.cos_notifications_hub,
  public.customers,
  public.prescriptions,
  public.prescription_history,
  public.prescription_photos,
  public.clinical_records,
  public.treatment_logs,
  public.consumption_logs,
  public.service_consumption,
  public.leads,
  public.suspense_entries
RESTART IDENTITY CASCADE;

-- Reset invoice sequence -> next value = 1 -> MG/26/01
ALTER SEQUENCE public.invoice_seq_2026 RESTART WITH 1;
