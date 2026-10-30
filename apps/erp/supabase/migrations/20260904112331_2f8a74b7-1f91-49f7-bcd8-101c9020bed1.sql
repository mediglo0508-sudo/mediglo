CREATE OR REPLACE FUNCTION app_private.integration_outbox_cos_appointments_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_phone text;
BEGIN
  BEGIN
    SELECT c.name, c.phone INTO v_name, v_phone
      FROM public.customers c WHERE c.id = NEW.patient_id;

    INSERT INTO public.integration_outbox (entity_type, entity_id, event_type, payload)
    VALUES (
      'appointments',
      (NEW).id::text,
      CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
      jsonb_build_object(
        'id', NEW.id,
        'customer_id', NEW.patient_id,
        'customer_name', v_name,
        'phone', v_phone,
        'appointment_date', NEW.appointment_date,
        'appointment_time', NEW.start_time,
        'service_inquiry', NEW.patient_concern,
        'notes', NEW.discussion_notes,
        'status', NEW.status,
        'updated_at', NEW.updated_at
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS zzz_integration_outbox_cos_appointments ON public.cos_appointments;
CREATE TRIGGER zzz_integration_outbox_cos_appointments
AFTER INSERT OR UPDATE ON public.cos_appointments
FOR EACH ROW EXECUTE FUNCTION app_private.integration_outbox_cos_appointments_capture();