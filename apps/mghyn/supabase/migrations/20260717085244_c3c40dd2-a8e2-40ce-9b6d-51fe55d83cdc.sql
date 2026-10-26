
CREATE OR REPLACE FUNCTION public.auto_book_next_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_service TEXT; v_gap INTEGER; v_next DATE; v_dup INTEGER; v_visit_date DATE;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND lower(coalesce(NEW.status,'')) = 'completed' THEN
    v_service := NEW.area_of_interest;
    IF v_service IS NULL OR v_service = '' THEN RETURN NEW; END IF;
    SELECT gap_days INTO v_gap FROM public.services_master
      WHERE lower(name) = lower(v_service) LIMIT 1;
    IF v_gap IS NULL OR v_gap <= 0 THEN RETURN NEW; END IF;
    v_visit_date := COALESCE(NEW.scheduled_for::date, CURRENT_DATE);
    v_next := v_visit_date + v_gap;
    SELECT COUNT(*) INTO v_dup FROM public.appointments
      WHERE customer_name = NEW.customer_name
        AND appointment_date BETWEEN (v_next - 1) AND (v_next + 1);
    IF v_dup = 0 THEN
      INSERT INTO public.appointments (customer_name, phone, service_inquiry, appointment_date, appointment_time, status, notes)
      VALUES (NEW.customer_name, NEW.phone, v_service, v_next, '10:00', 'scheduled',
              'Auto-booked follow-up (+' || v_gap || 'd)');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.auto_book_next_session() FROM PUBLIC, anon, authenticated;
