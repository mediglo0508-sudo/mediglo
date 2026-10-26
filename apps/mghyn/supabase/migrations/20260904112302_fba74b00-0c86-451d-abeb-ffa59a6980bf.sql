CREATE OR REPLACE FUNCTION public.sync_inventory_stock_from_batches()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_eff numeric := 0;
  v_new_eff numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_eff := CASE WHEN NEW.active THEN COALESCE(NEW.quantity, 0) ELSE 0 END;
    IF v_new_eff <> 0 THEN
      UPDATE public.inventory
         SET stock = GREATEST(COALESCE(stock, 0) + v_new_eff, 0), updated_at = now()
       WHERE id = NEW.inventory_id;
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old_eff := CASE WHEN OLD.active THEN COALESCE(OLD.quantity, 0) ELSE 0 END;
    IF v_old_eff <> 0 THEN
      UPDATE public.inventory
         SET stock = GREATEST(COALESCE(stock, 0) - v_old_eff, 0), updated_at = now()
       WHERE id = OLD.inventory_id;
    END IF;
    RETURN NULL;
  END IF;

  -- UPDATE
  v_old_eff := CASE WHEN OLD.active THEN COALESCE(OLD.quantity, 0) ELSE 0 END;
  v_new_eff := CASE WHEN NEW.active THEN COALESCE(NEW.quantity, 0) ELSE 0 END;

  IF OLD.inventory_id IS DISTINCT FROM NEW.inventory_id THEN
    IF v_old_eff <> 0 THEN
      UPDATE public.inventory
         SET stock = GREATEST(COALESCE(stock, 0) - v_old_eff, 0), updated_at = now()
       WHERE id = OLD.inventory_id;
    END IF;
    IF v_new_eff <> 0 THEN
      UPDATE public.inventory
         SET stock = GREATEST(COALESCE(stock, 0) + v_new_eff, 0), updated_at = now()
       WHERE id = NEW.inventory_id;
    END IF;
  ELSIF v_new_eff <> v_old_eff THEN
    UPDATE public.inventory
       SET stock = GREATEST(COALESCE(stock, 0) + (v_new_eff - v_old_eff), 0), updated_at = now()
     WHERE id = NEW.inventory_id;
  END IF;

  RETURN NULL;
END $function$;