-- ============================================================
-- Phase 1: encounters, doctor recommendations, counselor quotations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.cos_appointments(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name text,
  encounter_type text NOT NULL DEFAULT 'consultation'
    CHECK (encounter_type IN ('consultation','follow_up','treatment','direct_treatment','checkout')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','checked_in','in_progress','completed','cancelled')),
  checked_in_at timestamptz,
  checked_in_by uuid,
  started_at timestamptz,
  started_by uuid,
  completed_at timestamptz,
  completed_by uuid,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_encounters_customer_id ON public.encounters(customer_id);
CREATE INDEX IF NOT EXISTS idx_encounters_visit_id ON public.encounters(visit_id);
CREATE INDEX IF NOT EXISTS idx_encounters_appointment_id ON public.encounters(appointment_id);

GRANT SELECT, INSERT, UPDATE ON public.encounters TO authenticated;
GRANT ALL ON public.encounters TO service_role;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY encounters_select_staff ON public.encounters FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')
  OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'counselor')
  OR public.has_role(auth.uid(),'counselor_1') OR public.has_role(auth.uid(),'counselor_2')
  OR public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'therapist')
);
CREATE POLICY encounters_insert_staff ON public.encounters FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'reception')
  OR public.has_role(auth.uid(),'counselor') OR public.has_role(auth.uid(),'counselor_1')
  OR public.has_role(auth.uid(),'counselor_2')
);
CREATE POLICY encounters_update_staff ON public.encounters FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'reception')
  OR public.has_role(auth.uid(),'counselor') OR public.has_role(auth.uid(),'counselor_1')
  OR public.has_role(auth.uid(),'counselor_2')
)
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'reception')
  OR public.has_role(auth.uid(),'counselor') OR public.has_role(auth.uid(),'counselor_1')
  OR public.has_role(auth.uid(),'counselor_2')
);

CREATE TRIGGER trg_encounters_updated_at BEFORE UPDATE ON public.encounters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name text,
  doctor_id uuid NOT NULL DEFAULT auth.uid(),
  diagnosis text,
  instructions text,
  clinical_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','superseded')),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_prescriptions_visit ON public.doctor_prescriptions(visit_id);
CREATE INDEX IF NOT EXISTS idx_doctor_prescriptions_customer ON public.doctor_prescriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_doctor_prescriptions_doctor ON public.doctor_prescriptions(doctor_id);

GRANT SELECT, INSERT, UPDATE ON public.doctor_prescriptions TO authenticated;
GRANT ALL ON public.doctor_prescriptions TO service_role;
ALTER TABLE public.doctor_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctor_prescriptions_select ON public.doctor_prescriptions FOR SELECT TO authenticated
USING (
  doctor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')
  OR public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'counselor')
  OR public.has_role(auth.uid(),'counselor_1') OR public.has_role(auth.uid(),'counselor_2')
);
CREATE POLICY doctor_prescriptions_insert ON public.doctor_prescriptions FOR INSERT TO authenticated
WITH CHECK (
  doctor_id = auth.uid()
  AND (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin'))
);
CREATE POLICY doctor_prescriptions_update ON public.doctor_prescriptions FOR UPDATE TO authenticated
USING (doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_doctor_prescriptions_updated_at BEFORE UPDATE ON public.doctor_prescriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.doctor_prescriptions(id) ON DELETE CASCADE,
  item_type text NOT NULL DEFAULT 'service' CHECK (item_type IN ('service','product')),
  service_id uuid REFERENCES public.services_master(id) ON DELETE SET NULL,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  name text NOT NULL,
  sessions integer NOT NULL DEFAULT 1 CHECK (sessions > 0),
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  suggested_price numeric NOT NULL DEFAULT 0 CHECK (suggested_price >= 0),
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','urgent')),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_items_prescription ON public.doctor_prescription_items(prescription_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_prescription_items TO authenticated;
GRANT ALL ON public.doctor_prescription_items TO service_role;
ALTER TABLE public.doctor_prescription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY rx_items_select ON public.doctor_prescription_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.doctor_prescriptions p WHERE p.id = prescription_id));
CREATE POLICY rx_items_write ON public.doctor_prescription_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.doctor_prescriptions p
  WHERE p.id = prescription_id AND (p.doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
));
CREATE POLICY rx_items_update ON public.doctor_prescription_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.doctor_prescriptions p
  WHERE p.id = prescription_id AND (p.doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.doctor_prescriptions p
  WHERE p.id = prescription_id AND (p.doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
));
CREATE POLICY rx_items_delete ON public.doctor_prescription_items FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.doctor_prescriptions p
  WHERE p.id = prescription_id AND (p.doctor_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
));

-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.counselor_quotation_seq START 1000;

CREATE TABLE IF NOT EXISTS public.counselor_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name text,
  prescription_id uuid REFERENCES public.doctor_prescriptions(id) ON DELETE SET NULL,
  counselor_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent_to_patient','accepted','rejected','converted_to_invoice','expired')),
  quotation_number text UNIQUE,
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_reason text,
  cgst numeric NOT NULL DEFAULT 0,
  sgst numeric NOT NULL DEFAULT 0,
  net_total numeric NOT NULL DEFAULT 0,
  transaction_type text NOT NULL DEFAULT 'treatment_and_products'
    CHECK (transaction_type IN ('treatment','products_only','billing_only','treatment_and_products')),
  validity_days integer NOT NULL DEFAULT 7 CHECK (validity_days > 0),
  expires_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.counselor_quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_visit ON public.counselor_quotations(visit_id);
CREATE INDEX IF NOT EXISTS idx_quotations_counselor ON public.counselor_quotations(counselor_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.counselor_quotations(status);

GRANT SELECT, INSERT, UPDATE ON public.counselor_quotations TO authenticated;
GRANT ALL ON public.counselor_quotations TO service_role;
ALTER TABLE public.counselor_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotations_select ON public.counselor_quotations FOR SELECT TO authenticated
USING (
  counselor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')
  OR public.has_role(auth.uid(),'reception') OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'counselor') OR public.has_role(auth.uid(),'counselor_1')
  OR public.has_role(auth.uid(),'counselor_2')
);
CREATE POLICY quotations_insert ON public.counselor_quotations FOR INSERT TO authenticated
WITH CHECK (
  counselor_id = auth.uid()
  AND (
    public.has_role(auth.uid(),'counselor') OR public.has_role(auth.uid(),'counselor_1')
    OR public.has_role(auth.uid(),'counselor_2') OR public.has_role(auth.uid(),'admin')
  )
);
CREATE POLICY quotations_update ON public.counselor_quotations FOR UPDATE TO authenticated
USING (
  (counselor_id = auth.uid() AND status IN ('draft','sent_to_patient'))
  OR public.has_role(auth.uid(),'admin')
  OR (status IN ('accepted','sent_to_patient') AND public.has_role(auth.uid(),'reception'))
)
WITH CHECK (
  (counselor_id = auth.uid() AND status IN ('draft','sent_to_patient','accepted','rejected'))
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'reception')
);

CREATE TRIGGER trg_quotations_updated_at BEFORE UPDATE ON public.counselor_quotations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.next_quotation_no()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'QT-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.counselor_quotation_seq')::text, 5, '0');
$$;
GRANT EXECUTE ON FUNCTION public.next_quotation_no() TO authenticated;

-- ============================================================
-- Additive columns on existing tables
-- ============================================================
ALTER TABLE public.cos_appointments
  ADD COLUMN IF NOT EXISTS color_tag text,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS color_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS color_assigned_by uuid;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS quotation_id uuid REFERENCES public.counselor_quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES public.doctor_prescriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_type text;

CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id ON public.invoices(quotation_id);

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS line_status text NOT NULL DEFAULT 'active'
    CHECK (line_status IN ('active','voided','replaced')),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- ============================================================
-- Integrity fix: protect package/session history on line removal
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.protect_wallet_on_line_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $$
BEGIN
  -- Sessions already used: keep the wallet row, just detach it from the line.
  UPDATE public.service_wallets
     SET invoice_line_id = NULL, updated_at = now()
   WHERE invoice_line_id = OLD.id
     AND COALESCE(consumed_sessions,0) > 0;

  -- Untouched packages: nothing to preserve, remove with the line.
  DELETE FROM public.service_wallets
   WHERE invoice_line_id = OLD.id
     AND COALESCE(consumed_sessions,0) = 0;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_wallet_on_line_delete ON public.invoice_lines;
CREATE TRIGGER trg_protect_wallet_on_line_delete
BEFORE DELETE ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION app_private.protect_wallet_on_line_delete();

ALTER TABLE public.service_wallets DROP CONSTRAINT IF EXISTS service_wallets_invoice_line_id_fkey;
ALTER TABLE public.service_wallets
  ADD CONSTRAINT service_wallets_invoice_line_id_fkey
  FOREIGN KEY (invoice_line_id) REFERENCES public.invoice_lines(id) ON DELETE RESTRICT;

-- ============================================================
-- Integrity fix: bill number generation permission
-- ============================================================
GRANT EXECUTE ON FUNCTION public.next_invoice_no() TO authenticated;

-- ============================================================
-- Integrity fix: dues sync must not overwrite an in-flight delivery
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.integration_outbox_dues_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND o.claimed_at IS NULL
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
END $function$;