CREATE OR REPLACE FUNCTION app_private.deduct_inventory_stock(
  p_items jsonb,
  p_movement_type text,
  p_source text DEFAULT 'App',
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_inv_id uuid;
  v_qty numeric;
  v_batch_id uuid;
  v_remaining numeric;
  v_prev numeric;
  v_take numeric;
  v_batch record;
  v_applied numeric := 0;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT app_private.has_any_role(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to adjust inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_inv_id := NULLIF(v_item->>'inventory_id', '')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    v_batch_id := NULLIF(v_item->>'batch_id', '')::uuid;
    IF v_inv_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    SELECT stock INTO v_prev FROM public.inventory WHERE id = v_inv_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_remaining := v_qty;

    IF v_batch_id IS NOT NULL THEN
      SELECT * INTO v_batch FROM public.inventory_batches WHERE id = v_batch_id AND inventory_id = v_inv_id FOR UPDATE;
      IF FOUND THEN
        v_take := LEAST(v_batch.quantity, v_remaining);
        IF v_take > 0 THEN
          UPDATE public.inventory_batches SET quantity = quantity - v_take, updated_at = now() WHERE id = v_batch.id;
          INSERT INTO public.inventory_ledger (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock, user_id, source, note)
          VALUES (v_inv_id, v_batch.id, p_movement_type, -v_take, v_prev, v_prev - v_take, v_uid, p_source, p_note);
          v_prev := v_prev - v_take;
          v_remaining := v_remaining - v_take;
        END IF;
      END IF;
    END IF;

    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE inventory_id = v_inv_id AND active AND quantity > 0
        AND (v_batch_id IS NULL OR id <> v_batch_id)
      ORDER BY expiry_date NULLS LAST, created_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_batch.quantity, v_remaining);
      UPDATE public.inventory_batches SET quantity = quantity - v_take, updated_at = now() WHERE id = v_batch.id;
      INSERT INTO public.inventory_ledger (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock, user_id, source, note)
      VALUES (v_inv_id, v_batch.id, p_movement_type, -v_take, v_prev, v_prev - v_take, v_uid, p_source, p_note);
      v_prev := v_prev - v_take;
      v_remaining := v_remaining - v_take;
    END LOOP;

    -- No (or insufficient) batch coverage: adjust master stock directly, floored at zero.
    IF v_remaining > 0 THEN
      v_take := LEAST(v_remaining, GREATEST(v_prev, 0));
      IF v_take > 0 THEN
        UPDATE public.inventory SET stock = GREATEST(stock - v_take, 0), updated_at = now() WHERE id = v_inv_id;
        INSERT INTO public.inventory_ledger (inventory_id, batch_id, movement_type, quantity_change, previous_stock, new_stock, user_id, source, note)
        VALUES (v_inv_id, NULL, p_movement_type, -v_take, v_prev, v_prev - v_take, v_uid, p_source, p_note);
        v_prev := v_prev - v_take;
      END IF;
      v_remaining := 0;
    END IF;

    v_applied := v_applied + v_qty;
    v_result := v_result || jsonb_build_array(jsonb_build_object('inventory_id', v_inv_id, 'deducted', v_qty, 'new_stock', GREATEST(v_prev, 0)));
  END LOOP;

  RETURN jsonb_build_object('total_deducted', v_applied, 'items', v_result);
END $$;

REVOKE ALL ON FUNCTION app_private.deduct_inventory_stock(jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.deduct_inventory_stock(jsonb, text, text, text) TO service_role;