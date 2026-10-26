
-- ============================================================
-- 1. FOLLOW-UP DESK: extra fields + notes log
-- ============================================================
ALTER TABLE public.cos_follow_ups
  ADD COLUMN IF NOT EXISTS expected_visit_date date,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS cos_follow_ups_source_key_uidx
  ON public.cos_follow_ups (source_key) WHERE source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cos_follow_up_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES public.cos_follow_ups(id) ON DELETE CASCADE,
  note text NOT NULL,
  outcome text,
  next_followup_at timestamptz,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cos_follow_up_notes TO authenticated;
GRANT ALL ON public.cos_follow_up_notes TO service_role;
ALTER TABLE public.cos_follow_up_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follow_up_notes_read ON public.cos_follow_up_notes;
CREATE POLICY follow_up_notes_read ON public.cos_follow_up_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cos_follow_ups f WHERE f.id = follow_up_id));

DROP POLICY IF EXISTS follow_up_notes_insert ON public.cos_follow_up_notes;
CREATE POLICY follow_up_notes_insert ON public.cos_follow_up_notes
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS follow_up_notes_delete ON public.cos_follow_up_notes;
CREATE POLICY follow_up_notes_delete ON public.cos_follow_up_notes
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

-- follow-up write access for the marketing/caller crowd on assignment
DROP POLICY IF EXISTS follow_ups_insert ON public.cos_follow_ups;
CREATE POLICY follow_ups_insert ON public.cos_follow_ups
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'marketing_admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'marketing_head'::public.app_role)
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
    OR app_private.has_role(auth.uid(), 'marketing'::public.app_role)
    OR app_private.has_role(auth.uid(), 'caller'::public.app_role)
    OR assigned_to = auth.uid()
  );

-- ============================================================
-- 2. PHARMACIST ACCESS (additive permissive policies)
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.is_pharmacist(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_private.has_role(_uid, 'pharmacist'::public.app_role)
$$;
REVOKE ALL ON FUNCTION app_private.is_pharmacist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_pharmacist(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory','inventory_batches','inventory_items','inventory_categories',
    'inventory_brands','inventory_companies','inventory_suppliers',
    'purchases','expenses','vendors','invoices','invoice_lines','service_consumption'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pharmacist_read ON public.%I', t);
    EXECUTE format('CREATE POLICY pharmacist_read ON public.%I FOR SELECT TO authenticated USING (app_private.is_pharmacist(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS pharmacist_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY pharmacist_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (app_private.is_pharmacist(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS pharmacist_update ON public.%I', t);
    EXECUTE format('CREATE POLICY pharmacist_update ON public.%I FOR UPDATE TO authenticated USING (app_private.is_pharmacist(auth.uid())) WITH CHECK (app_private.is_pharmacist(auth.uid()))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS pharmacist_ledger_insert ON public.inventory_ledger;
CREATE POLICY pharmacist_ledger_insert ON public.inventory_ledger
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_pharmacist(auth.uid()) AND user_id = auth.uid());

-- ============================================================
-- 3. AUDITED RESTOCK (reverse of deduct_inventory_stock)
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.restock_inventory(
  p_items jsonb, p_movement_type text, p_source text DEFAULT 'App', p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb; v_inv_id uuid; v_qty numeric; v_prev numeric; v_batch record;
  v_total numeric := 0;
BEGIN
  IF v_uid IS NULL OR NOT app_private.has_any_role(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to adjust inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_inv_id := NULLIF(v_item->>'inventory_id','')::uuid;
    v_qty    := COALESCE((v_item->>'qty')::numeric, 0);
    IF v_inv_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    SELECT stock INTO v_prev FROM public.inventory WHERE id = v_inv_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO v_batch FROM public.inventory_batches
      WHERE inventory_id = v_inv_id AND active
      ORDER BY expiry_date NULLS LAST, created_at
      LIMIT 1 FOR UPDATE;

    IF FOUND THEN
      UPDATE public.inventory_batches SET quantity = quantity + v_qty, updated_at = now() WHERE id = v_batch.id;
      INSERT INTO public.inventory_ledger (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock, user_id, source, note)
      VALUES (v_inv_id, v_batch.id, p_movement_type, v_qty, v_prev, v_prev + v_qty, v_uid, p_source, p_note);
    ELSE
      UPDATE public.inventory SET stock = COALESCE(stock,0) + v_qty, updated_at = now() WHERE id = v_inv_id;
      INSERT INTO public.inventory_ledger (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock, user_id, source, note)
      VALUES (v_inv_id, NULL, p_movement_type, v_qty, v_prev, v_prev + v_qty, v_uid, p_source, p_note);
    END IF;

    v_total := v_total + v_qty;
  END LOOP;

  RETURN jsonb_build_object('total_restocked', v_total);
END $$;
REVOKE ALL ON FUNCTION app_private.restock_inventory(jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.restock_inventory(jsonb, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restock_inventory(
  p_items jsonb, p_movement_type text, p_source text DEFAULT 'App', p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SET search_path = public, app_private AS $$
  SELECT app_private.restock_inventory(p_items, p_movement_type, p_source, p_note);
$$;
REVOKE ALL ON FUNCTION public.restock_inventory(jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restock_inventory(jsonb, text, text, text) TO authenticated, service_role;

-- Everything an invoice took out of stock: recorded consumption + product lines
CREATE OR REPLACE FUNCTION app_private.invoice_stock_items(p_invoice_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('inventory_id', inv_id, 'qty', qty)), '[]'::jsonb)
  FROM (
    SELECT inv_id, sum(qty) qty FROM (
      SELECT COALESCE(i.id, i2.id) AS inv_id, sc.qty_used AS qty
        FROM public.service_consumption sc
        LEFT JOIN public.inventory i  ON i.id = sc.item_id
        LEFT JOIN public.inventory i2 ON lower(i2.name) = lower(sc.item_name)
       WHERE sc.invoice_id = p_invoice_id
      UNION ALL
      SELECT i.id, l.qty
        FROM public.invoice_lines l
        JOIN public.inventory i ON lower(i.name) = lower(l.description)
       WHERE l.invoice_id = p_invoice_id AND l.item_category = 'product'
    ) s WHERE inv_id IS NOT NULL
    GROUP BY inv_id
  ) g;
$$;
REVOKE ALL ON FUNCTION app_private.invoice_stock_items(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.invoice_stock_items(uuid) TO authenticated, service_role;

-- ============================================================
-- 4. CANCEL (VOID) INVOICE — replaces hard delete
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.void_invoice(p_id uuid, p_reason text DEFAULT 'cancelled')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_old public.invoices%ROWTYPE;
  v_pkg uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT (app_private.has_role(v_uid,'admin'::public.app_role)
       OR app_private.has_role(v_uid,'accountant'::public.app_role)
       OR app_private.has_role(v_uid,'reception'::public.app_role)) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Forbidden: requires admin/accountant/reception'; END IF;

  SELECT * INTO v_old FROM public.invoices WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_id; END IF;
  IF v_old.voided_at IS NOT NULL THEN RETURN p_id; END IF;

  PERFORM app_private.restock_inventory(
    app_private.invoice_stock_items(p_id), 'Bill Cancelled', 'Invoice Void',
    'Stock restored on cancelling ' || COALESCE(v_old.invoice_no, p_id::text));

  FOR v_pkg IN SELECT package_id FROM public.invoice_lines WHERE invoice_id = p_id AND package_id IS NOT NULL LOOP
    UPDATE public.treatment_packages
       SET sessions_completed = GREATEST(0, COALESCE(sessions_completed,0) - 1)
     WHERE id = v_pkg;
  END LOOP;

  DELETE FROM public.service_wallets WHERE invoice_id = p_id;
  DELETE FROM public.vouchers WHERE invoice_id = p_id;

  UPDATE public.invoices
     SET voided_at = now(), voided_by = v_uid,
         voided_reason = COALESCE(NULLIF(p_reason,''),'cancelled'),
         paid_amount = 0, pending_balance = 0
   WHERE id = p_id;

  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION app_private.void_invoice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.void_invoice(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.void_invoice(p_id uuid, p_reason text DEFAULT 'cancelled')
RETURNS uuid LANGUAGE sql SET search_path = public, app_private AS $$
  SELECT app_private.void_invoice(p_id, p_reason);
$$;
REVOKE ALL ON FUNCTION public.void_invoice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated, service_role;

-- Hard deletes are no longer permitted: history must stay intact
REVOKE DELETE ON public.invoices FROM authenticated;
DROP POLICY IF EXISTS invoices_block_hard_delete ON public.invoices;
CREATE POLICY invoices_block_hard_delete ON public.invoices
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
