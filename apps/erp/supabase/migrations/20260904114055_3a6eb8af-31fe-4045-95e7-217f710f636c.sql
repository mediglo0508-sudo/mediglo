CREATE OR REPLACE FUNCTION app_private.reverse_invoice_inventory(p_invoice_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $fn$
DECLARE
  r record;
  v_delta numeric;
  v_prev numeric;
  v_new numeric;
  v_count int := 0;
  v_units numeric := 0;
BEGIN
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
END $fn$;

CREATE OR REPLACE FUNCTION app_private.apply_invoice_inventory(p_invoice_id uuid, p_movement_type text DEFAULT 'POS Sales', p_source text DEFAULT 'Invoice')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $fn$
DECLARE
  l record;
  v_batch record;
  v_remaining numeric;
  v_prev numeric;
  v_take numeric;
  v_applied numeric := 0;
  v_skipped int := 0;
  v_lines int := 0;
BEGIN
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
END $fn$;

CREATE OR REPLACE FUNCTION app_private.rebill_invoice_inventory(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $fn$
DECLARE
  v_rev jsonb;
  v_app jsonb;
BEGIN
  v_rev := app_private.reverse_invoice_inventory(p_invoice_id, 'Invoice revision');
  v_app := app_private.apply_invoice_inventory(p_invoice_id, 'POS Sales', 'Invoice Revision');
  RETURN jsonb_build_object('reversed', v_rev, 'applied', v_app);
END $fn$;

-- Public wrappers, service_role only.
CREATE OR REPLACE FUNCTION public.reverse_invoice_inventory(p_invoice_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'app_private'
AS $fn$ SELECT app_private.reverse_invoice_inventory(p_invoice_id, p_reason); $fn$;

CREATE OR REPLACE FUNCTION public.apply_invoice_inventory(p_invoice_id uuid, p_movement_type text DEFAULT 'POS Sales', p_source text DEFAULT 'Invoice')
RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'app_private'
AS $fn$ SELECT app_private.apply_invoice_inventory(p_invoice_id, p_movement_type, p_source); $fn$;

CREATE OR REPLACE FUNCTION public.rebill_invoice_inventory(p_invoice_id uuid)
RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'app_private'
AS $fn$ SELECT app_private.rebill_invoice_inventory(p_invoice_id); $fn$;

REVOKE ALL ON FUNCTION public.reverse_invoice_inventory(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_invoice_inventory(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebill_invoice_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_inventory(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_invoice_inventory(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rebill_invoice_inventory(uuid) TO service_role;

CREATE OR REPLACE FUNCTION app_private.invoice_void_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $fn$
BEGIN
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    PERFORM app_private.reverse_invoice_inventory(NEW.id, COALESCE(NEW.voided_reason, 'Invoice voided'));
  ELSIF OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL THEN
    PERFORM app_private.apply_invoice_inventory(NEW.id, 'POS Sales', 'Invoice Un-void');
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS zzz_invoice_void_inventory_sync ON public.invoices;
CREATE TRIGGER zzz_invoice_void_inventory_sync
AFTER UPDATE OF voided_at ON public.invoices
FOR EACH ROW
WHEN (OLD.voided_at IS DISTINCT FROM NEW.voided_at)
EXECUTE FUNCTION app_private.invoice_void_inventory_sync();