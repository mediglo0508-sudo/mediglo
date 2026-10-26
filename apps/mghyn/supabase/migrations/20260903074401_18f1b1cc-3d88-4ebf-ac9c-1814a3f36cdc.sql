CREATE OR REPLACE FUNCTION app_private.integration_outbox_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_digits text;
  v_cust uuid;
  v_cnt int;
BEGIN
  BEGIN
    v_payload := to_jsonb(NEW);

    IF TG_TABLE_NAME = 'appointments' THEN
      v_cust := (to_jsonb(NEW) ->> 'customer_id')::uuid;
      IF v_cust IS NULL THEN
        v_digits := right(regexp_replace(coalesce(to_jsonb(NEW) ->> 'phone', ''), '\D', '', 'g'), 10);
        IF length(v_digits) = 10 THEN
          SELECT count(*), min(c.id) INTO v_cnt, v_cust
          FROM public.customers c
          WHERE right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_digits;
          IF v_cnt <> 1 THEN
            v_cust := NULL;
          END IF;
        END IF;
      END IF;
      v_payload := v_payload || jsonb_build_object('customer_id', v_cust);
    END IF;

    INSERT INTO public.integration_outbox (entity_type, entity_id, event_type, payload)
    VALUES (
      TG_TABLE_NAME,
      (NEW).id::text,
      CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
      v_payload
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app_private.integration_outbox_dues_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cid uuid;
  v_payload jsonb;
  v_existing uuid;
BEGIN
  BEGIN
    v_cid := coalesce(NEW.customer_id, OLD.customer_id);
    IF v_cid IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT jsonb_build_object(
      'customer_id', v_cid::text,
      'invoiced_total', coalesce(sum(i.gross_total), 0),
      'paid_total', coalesce(sum(i.paid_amount), 0),
      'pending_total', coalesce(sum(i.pending_balance), 0),
      'invoice_count', count(*),
      'last_invoice_no', (
        SELECT x.invoice_no FROM public.invoices x
        WHERE x.customer_id = v_cid AND x.voided_at IS NULL
        ORDER BY x.invoice_date DESC NULLS LAST, x.created_at DESC LIMIT 1),
      'last_invoice_date', (
        SELECT x.invoice_date FROM public.invoices x
        WHERE x.customer_id = v_cid AND x.voided_at IS NULL
        ORDER BY x.invoice_date DESC NULLS LAST, x.created_at DESC LIMIT 1),
      'last_payment_date', (
        SELECT x.invoice_date FROM public.invoices x
        WHERE x.customer_id = v_cid AND x.voided_at IS NULL AND coalesce(x.paid_amount, 0) > 0
        ORDER BY x.invoice_date DESC NULLS LAST, x.created_at DESC LIMIT 1)
    )
    INTO v_payload
    FROM public.invoices i
    WHERE i.customer_id = v_cid AND i.voided_at IS NULL;

    SELECT o.id INTO v_existing
    FROM public.integration_outbox o
    WHERE o.entity_type = 'dues'
      AND o.entity_id = v_cid::text
      AND o.delivered_at IS NULL
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.integration_outbox
      SET payload = v_payload, created_at = now()
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.integration_outbox (entity_type, entity_id, event_type, payload)
      VALUES ('dues', v_cid::text, 'updated', v_payload);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zzz_integration_outbox_dues ON public.invoices;
CREATE TRIGGER zzz_integration_outbox_dues
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION app_private.integration_outbox_dues_capture();
