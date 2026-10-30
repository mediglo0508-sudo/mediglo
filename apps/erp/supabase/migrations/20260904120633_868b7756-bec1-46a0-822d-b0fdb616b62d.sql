-- ============================================================
-- A) Permission model: admin, accountant, reception, pharmacist
-- ============================================================
DROP POLICY IF EXISTS "invoices write" ON public.invoices;
CREATE POLICY "invoices write" ON public.invoices
  FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()));

DROP POLICY IF EXISTS "lines write" ON public.invoice_lines;
CREATE POLICY "lines write" ON public.invoice_lines
  FOR ALL TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()));

DROP POLICY IF EXISTS "invoices_update_finance_desk" ON public.invoices;
CREATE POLICY "invoices_update_finance_desk" ON public.invoices
  FOR UPDATE TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()));

DROP POLICY IF EXISTS "invoices_delete_finance_desk" ON public.invoices;
CREATE POLICY "invoices_delete_finance_desk" ON public.invoices
  FOR DELETE TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()));

DROP POLICY IF EXISTS "invoice_lines_update_finance_desk" ON public.invoice_lines;
CREATE POLICY "invoice_lines_update_finance_desk" ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()));

DROP POLICY IF EXISTS "invoice_lines_delete_finance_desk" ON public.invoice_lines;
CREATE POLICY "invoice_lines_delete_finance_desk" ON public.invoice_lines
  FOR DELETE TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception') OR app_private.is_pharmacist(auth.uid()));

GRANT DELETE ON public.invoices TO authenticated;

GRANT EXECUTE ON FUNCTION public.rebill_invoice_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_inventory(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_inventory(uuid, text, text) TO authenticated;

-- Defence-in-depth guard used inside the SECURITY DEFINER inventory functions
CREATE OR REPLACE FUNCTION app_private.assert_invoice_inventory_actor()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','app_private'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  -- Backend/service_role contexts have no auth.uid(); leave them unaffected.
  IF v_uid IS NULL THEN RETURN; END IF;
  IF app_private.is_finance(v_uid)
     OR app_private.has_role(v_uid,'reception')
     OR app_private.is_pharmacist(v_uid) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'FORBIDDEN: Only Admin, Accountant, Front-Desk or Pharmacist users can change invoice inventory.';
END $fn$;

REVOKE ALL ON FUNCTION app_private.assert_invoice_inventory_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.assert_invoice_inventory_actor() TO authenticated, service_role;

-- ============================================================
-- B) Revoke anon write access
-- ============================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoice_lines FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inventory FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inventory_ledger FROM anon;

-- ============================================================
-- Guards inside the inventory functions
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.reverse_invoice_inventory(p_invoice_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  r record; v_delta numeric; v_prev numeric; v_new numeric;
  v_count int := 0; v_units numeric := 0;
BEGIN
  PERFORM app_private.assert_invoice_inventory_actor();
  IF p_invoice_id IS NULL THEN RETURN jsonb_build_object('reversed_movements', 0, 'units_restored', 0); END IF;

  FOR r IN
    SELECT g.* FROM public.inventory_ledger g
    WHERE g.invoice_id = p_invoice_id
      AND COALESCE(g.movement_type, '') <> 'Reversal'
      AND g.reverses_ledger_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.inventory_ledger x WHERE x.reverses_ledger_id = g.id)
    ORDER BY g.created_at
    FOR UPDATE
  LOOP
    v_delta := -r.quantity_change;
    IF v_delta = 0 THEN CONTINUE; END IF;

    SELECT stock INTO v_prev FROM public.inventory WHERE id = r.inventory_id FOR UPDATE;
    IF v_prev IS NULL THEN CONTINUE; END IF;

    IF r.batch_id IS NOT NULL THEN
      UPDATE public.inventory_batches
         SET quantity = GREATEST(quantity + v_delta, 0), updated_at = now()
       WHERE id = r.batch_id;
    ELSE
      UPDATE public.inventory
         SET stock = GREATEST(stock + v_delta, 0), updated_at = now()
       WHERE id = r.inventory_id;
    END IF;

    SELECT stock INTO v_new FROM public.inventory WHERE id = r.inventory_id;

    INSERT INTO public.inventory_ledger
      (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock,
       user_id, source, note, invoice_id, invoice_line_id, reverses_ledger_id)
    VALUES
      (r.inventory_id, r.batch_id, 'Reversal', v_delta, v_prev, v_new,
       auth.uid(), 'Invoice Reversal', p_reason, p_invoice_id, r.invoice_line_id, r.id);

    v_count := v_count + 1;
    v_units := v_units + v_delta;
  END LOOP;

  RETURN jsonb_build_object('reversed_movements', v_count, 'units_restored', v_units);
END $function$;

CREATE OR REPLACE FUNCTION app_private.apply_invoice_inventory(p_invoice_id uuid, p_movement_type text DEFAULT 'POS Sales'::text, p_source text DEFAULT 'Invoice'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  l record; v_batch record; v_remaining numeric; v_prev numeric; v_take numeric;
  v_applied numeric := 0; v_skipped int := 0; v_lines int := 0;
BEGIN
  PERFORM app_private.assert_invoice_inventory_actor();
  IF p_invoice_id IS NULL THEN RETURN jsonb_build_object('already_applied', false, 'units_deducted', 0, 'skipped_unmapped', 0); END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_ledger g
    WHERE g.invoice_id = p_invoice_id
      AND COALESCE(g.movement_type, '') <> 'Reversal'
      AND g.reverses_ledger_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.inventory_ledger x WHERE x.reverses_ledger_id = g.id)
  ) THEN
    RETURN jsonb_build_object('already_applied', true);
  END IF;

  FOR l IN SELECT * FROM public.invoice_lines WHERE invoice_id = p_invoice_id ORDER BY created_at
  LOOP
    IF l.inventory_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF COALESCE(l.qty, 0) <= 0 THEN CONTINUE; END IF;

    SELECT stock INTO v_prev FROM public.inventory WHERE id = l.inventory_id FOR UPDATE;
    IF v_prev IS NULL THEN CONTINUE; END IF;

    v_remaining := l.qty;

    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE inventory_id = l.inventory_id AND active AND quantity > 0
      ORDER BY expiry_date NULLS LAST, created_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_batch.quantity, v_remaining);
      UPDATE public.inventory_batches SET quantity = quantity - v_take, updated_at = now() WHERE id = v_batch.id;
      INSERT INTO public.inventory_ledger
        (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock,
         user_id, source, note, invoice_id, invoice_line_id)
      VALUES
        (l.inventory_id, v_batch.id, p_movement_type, -v_take, v_prev, v_prev - v_take,
         auth.uid(), p_source, NULL, p_invoice_id, l.id);
      v_prev := v_prev - v_take;
      v_remaining := v_remaining - v_take;
      v_applied := v_applied + v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      v_take := LEAST(v_remaining, GREATEST(v_prev, 0));
      IF v_take > 0 THEN
        UPDATE public.inventory SET stock = GREATEST(stock - v_take, 0), updated_at = now() WHERE id = l.inventory_id;
        INSERT INTO public.inventory_ledger
          (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock,
           user_id, source, note, invoice_id, invoice_line_id)
        VALUES
          (l.inventory_id, NULL, p_movement_type, -v_take, v_prev, v_prev - v_take,
           auth.uid(), p_source, NULL, p_invoice_id, l.id);
        v_prev := v_prev - v_take;
        v_applied := v_applied + v_take;
      END IF;
    END IF;

    v_lines := v_lines + 1;
  END LOOP;

  RETURN jsonb_build_object('already_applied', false, 'lines_applied', v_lines, 'units_deducted', v_applied, 'skipped_unmapped', v_skipped);
END $function$;

-- ============================================================
-- D) rebill is a no-op when nothing stock-relevant changed
-- ============================================================
CREATE OR REPLACE FUNCTION app_private.rebill_invoice_inventory(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  v_rev jsonb; v_app jsonb; v_diff int;
BEGIN
  PERFORM app_private.assert_invoice_inventory_actor();
  IF p_invoice_id IS NULL THEN RETURN jsonb_build_object('unchanged', true); END IF;

  WITH want AS (
    SELECT inventory_id, SUM(COALESCE(qty,0))::numeric AS q
      FROM public.invoice_lines
     WHERE invoice_id = p_invoice_id AND inventory_id IS NOT NULL AND COALESCE(qty,0) > 0
     GROUP BY inventory_id
  ), have AS (
    SELECT g.inventory_id, SUM(-g.quantity_change)::numeric AS q
      FROM public.inventory_ledger g
     WHERE g.invoice_id = p_invoice_id
       AND COALESCE(g.movement_type,'') <> 'Reversal'
       AND g.reverses_ledger_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.inventory_ledger x WHERE x.reverses_ledger_id = g.id)
     GROUP BY g.inventory_id
  )
  SELECT count(*)::int INTO v_diff
    FROM want FULL OUTER JOIN have ON have.inventory_id = want.inventory_id
   WHERE COALESCE(want.q, 0) <> COALESCE(have.q, 0);

  IF COALESCE(v_diff, 0) = 0 THEN
    RETURN jsonb_build_object('unchanged', true,
      'reversed', jsonb_build_object('reversed_movements', 0, 'units_restored', 0),
      'applied', jsonb_build_object('already_applied', true, 'lines_applied', 0, 'units_deducted', 0, 'skipped_unmapped', 0));
  END IF;

  v_rev := app_private.reverse_invoice_inventory(p_invoice_id, 'Invoice revision');
  v_app := app_private.apply_invoice_inventory(p_invoice_id, 'POS Sales', 'Invoice Revision');
  RETURN jsonb_build_object('unchanged', false, 'reversed', v_rev, 'applied', v_app);
END $function$;