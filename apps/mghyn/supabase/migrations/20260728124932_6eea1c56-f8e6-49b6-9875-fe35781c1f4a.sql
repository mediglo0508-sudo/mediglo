-- ============ MASTERS ============
CREATE TABLE IF NOT EXISTS public.inventory_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_brands_name_key ON public.inventory_brands (lower(name));

CREATE TABLE IF NOT EXISTS public.inventory_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_companies_name_key ON public.inventory_companies (lower(name));

CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  gstin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_suppliers_name_key ON public.inventory_suppliers (lower(name));

CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_categories_name_key ON public.inventory_categories (lower(name));

GRANT SELECT, INSERT, UPDATE ON public.inventory_brands, public.inventory_companies, public.inventory_suppliers, public.inventory_categories TO authenticated;
GRANT ALL ON public.inventory_brands, public.inventory_companies, public.inventory_suppliers, public.inventory_categories TO service_role;

ALTER TABLE public.inventory_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_brands','inventory_companies','inventory_suppliers','inventory_categories'] LOOP
    EXECUTE format($f$
      CREATE POLICY "Staff view %1$s" ON public.%1$I FOR SELECT TO authenticated
        USING (app_private.has_any_role(auth.uid()));
      CREATE POLICY "Finance reception insert %1$s" ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role));
      CREATE POLICY "Finance reception update %1$s" ON public.%1$I FOR UPDATE TO authenticated
        USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role))
        WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role));
    $f$, t);
  END LOOP;
END $$;

-- ============ PRODUCT MASTER UPGRADE ============
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS default_supplier_id uuid REFERENCES public.inventory_suppliers(id);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_sku_key ON public.inventory (lower(sku)) WHERE sku IS NOT NULL AND sku <> '';
CREATE UNIQUE INDEX IF NOT EXISTS inventory_barcode_key ON public.inventory (lower(barcode)) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX IF NOT EXISTS inventory_brand_name_idx ON public.inventory (lower(coalesce(brand,'')), lower(name));

-- ============ BATCHES ============
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  batch_no text NOT NULL,
  expiry_date date,
  mrp numeric NOT NULL DEFAULT 0,
  purchase_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES public.inventory_suppliers(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_batches_unique ON public.inventory_batches (inventory_id, lower(batch_no));
CREATE INDEX IF NOT EXISTS inventory_batches_inv_idx ON public.inventory_batches (inventory_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_batches TO authenticated;
GRANT ALL ON public.inventory_batches TO service_role;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view inventory_batches" ON public.inventory_batches FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "Finance reception insert inventory_batches" ON public.inventory_batches FOR INSERT TO authenticated
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role));
CREATE POLICY "Finance reception update inventory_batches" ON public.inventory_batches FOR UPDATE TO authenticated
  USING (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role))
  WITH CHECK (app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role));
CREATE POLICY "Admins delete inventory_batches" ON public.inventory_batches FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_inventory_batches_updated_at BEFORE UPDATE ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- derived stock: inventory.stock = sum(active batch quantities)
CREATE OR REPLACE FUNCTION public.sync_inventory_stock_from_batches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE(NEW.inventory_id, OLD.inventory_id);
  UPDATE public.inventory i
     SET stock = COALESCE((SELECT SUM(b.quantity) FROM public.inventory_batches b
                            WHERE b.inventory_id = v_id AND b.active), 0),
         updated_at = now()
   WHERE i.id = v_id;
  IF TG_OP <> 'DELETE' AND OLD IS NOT NULL AND OLD.inventory_id IS DISTINCT FROM NEW.inventory_id THEN
    UPDATE public.inventory i
       SET stock = COALESCE((SELECT SUM(b.quantity) FROM public.inventory_batches b
                              WHERE b.inventory_id = OLD.inventory_id AND b.active), 0)
     WHERE i.id = OLD.inventory_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER inventory_batches_sync_stock
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_stock_from_batches();

-- ============ LEDGER ============
CREATE TABLE IF NOT EXISTS public.inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  movement_type text NOT NULL,
  quantity_change numeric NOT NULL,
  previous_stock numeric NOT NULL DEFAULT 0,
  new_stock numeric NOT NULL DEFAULT 0,
  user_id uuid,
  source text,
  import_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_ledger_inv_idx ON public.inventory_ledger (inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_ledger_import_idx ON public.inventory_ledger (import_id);

GRANT SELECT, INSERT ON public.inventory_ledger TO authenticated;
GRANT ALL ON public.inventory_ledger TO service_role;
ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view inventory_ledger" ON public.inventory_ledger FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));
CREATE POLICY "Finance reception insert inventory_ledger" ON public.inventory_ledger FOR INSERT TO authenticated
  WITH CHECK ((app_private.is_finance(auth.uid()) OR app_private.has_role(auth.uid(),'reception'::app_role))
              AND user_id = auth.uid());

-- ============ IMPORT ROUTINE ============
CREATE OR REPLACE FUNCTION app_private.import_inventory_rows(rows jsonb, import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb;
  v_uid uuid := auth.uid();
  v_name text; v_brand text; v_company text; v_supplier text; v_category text; v_sub text;
  v_sku text; v_barcode text; v_batch text; v_expiry date;
  v_mrp numeric; v_pp numeric; v_qty numeric;
  v_inv uuid; v_batch_id uuid; v_supplier_id uuid;
  v_prev numeric; v_new numeric; v_existing_qty numeric;
  products_created int := 0; products_matched int := 0;
  batches_created int := 0; batches_updated int := 0;
  qty_applied numeric := 0;
  errors jsonb := '[]'::jsonb;
  idx int;
BEGIN
  IF NOT (app_private.is_finance(v_uid)
          OR app_private.has_role(v_uid,'reception'::app_role)
          OR app_private.has_role(v_uid,'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to import inventory';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(rows) LOOP
    idx := COALESCE((r->>'row_index')::int, -1);
    BEGIN
      v_name     := NULLIF(btrim(COALESCE(r->>'name','')), '');
      v_brand    := NULLIF(btrim(COALESCE(r->>'brand','')), '');
      v_company  := NULLIF(btrim(COALESCE(r->>'company','')), '');
      v_supplier := NULLIF(btrim(COALESCE(r->>'supplier','')), '');
      v_category := COALESCE(NULLIF(btrim(COALESCE(r->>'category','')), ''), 'Retail');
      v_sub      := NULLIF(btrim(COALESCE(r->>'sub_category','')), '');
      v_sku      := NULLIF(btrim(COALESCE(r->>'sku','')), '');
      v_barcode  := NULLIF(btrim(COALESCE(r->>'barcode','')), '');
      v_batch    := COALESCE(NULLIF(btrim(COALESCE(r->>'batch_no','')), ''), 'NO-BATCH');
      v_expiry   := NULLIF(btrim(COALESCE(r->>'expiry_date','')), '')::date;
      v_mrp      := COALESCE((r->>'mrp')::numeric, 0);
      v_pp       := COALESCE((r->>'purchase_price')::numeric, 0);
      v_qty      := COALESCE((r->>'quantity')::numeric, 0);

      IF v_name IS NULL THEN RAISE EXCEPTION 'Product name is blank'; END IF;
      IF v_mrp <= 0 THEN RAISE EXCEPTION 'MRP must be greater than 0'; END IF;
      IF v_qty < 0 THEN RAISE EXCEPTION 'Quantity cannot be negative'; END IF;
      IF v_category NOT IN ('Retail','Injectable') THEN RAISE EXCEPTION 'Category % not supported by this import', v_category; END IF;

      -- masters
      IF v_brand IS NOT NULL THEN
        INSERT INTO public.inventory_brands(name) SELECT v_brand
        WHERE NOT EXISTS (SELECT 1 FROM public.inventory_brands WHERE lower(name)=lower(v_brand));
      END IF;
      IF v_company IS NOT NULL THEN
        INSERT INTO public.inventory_companies(name) SELECT v_company
        WHERE NOT EXISTS (SELECT 1 FROM public.inventory_companies WHERE lower(name)=lower(v_company));
      END IF;
      IF v_sub IS NOT NULL THEN
        INSERT INTO public.inventory_categories(name, parent_category) SELECT v_sub, v_category
        WHERE NOT EXISTS (SELECT 1 FROM public.inventory_categories WHERE lower(name)=lower(v_sub));
      END IF;
      v_supplier_id := NULL;
      IF v_supplier IS NOT NULL THEN
        INSERT INTO public.inventory_suppliers(name) SELECT v_supplier
        WHERE NOT EXISTS (SELECT 1 FROM public.inventory_suppliers WHERE lower(name)=lower(v_supplier));
        SELECT id INTO v_supplier_id FROM public.inventory_suppliers WHERE lower(name)=lower(v_supplier) LIMIT 1;
      END IF;

      -- product matching hierarchy
      v_inv := NULL;
      IF v_sku IS NOT NULL THEN
        SELECT id INTO v_inv FROM public.inventory WHERE lower(sku)=lower(v_sku) LIMIT 1;
      END IF;
      IF v_inv IS NULL AND v_barcode IS NOT NULL THEN
        SELECT id INTO v_inv FROM public.inventory WHERE lower(barcode)=lower(v_barcode) LIMIT 1;
      END IF;
      IF v_inv IS NULL AND v_brand IS NOT NULL THEN
        SELECT id INTO v_inv FROM public.inventory
         WHERE lower(coalesce(brand,''))=lower(v_brand) AND lower(name)=lower(v_name) LIMIT 1;
      END IF;
      IF v_inv IS NULL AND v_company IS NOT NULL THEN
        SELECT id INTO v_inv FROM public.inventory
         WHERE lower(coalesce(company,''))=lower(v_company)
           AND lower(coalesce(brand,''))=lower(coalesce(v_brand,''))
           AND lower(name)=lower(v_name) LIMIT 1;
      END IF;
      IF v_inv IS NULL AND v_brand IS NULL AND v_company IS NULL THEN
        SELECT id INTO v_inv FROM public.inventory
         WHERE lower(name)=lower(v_name) AND category=v_category LIMIT 1;
      END IF;

      IF v_inv IS NULL THEN
        INSERT INTO public.inventory(name, category, stock, rate, batch_no, expiry_date,
                                     sku, barcode, brand, company, sub_category, default_supplier_id)
        VALUES (v_name, v_category, 0, v_mrp, v_batch, to_char(v_expiry,'YYYY-MM-DD'),
                v_sku, v_barcode, v_brand, v_company, v_sub, v_supplier_id)
        RETURNING id INTO v_inv;
        products_created := products_created + 1;
      ELSE
        products_matched := products_matched + 1;
        UPDATE public.inventory SET
          brand = COALESCE(brand, v_brand),
          company = COALESCE(company, v_company),
          sub_category = COALESCE(sub_category, v_sub),
          sku = COALESCE(sku, v_sku),
          barcode = COALESCE(barcode, v_barcode),
          default_supplier_id = COALESCE(default_supplier_id, v_supplier_id),
          rate = CASE WHEN v_mrp > 0 THEN v_mrp ELSE rate END,
          active = true
        WHERE id = v_inv;
      END IF;

      SELECT COALESCE(stock,0) INTO v_prev FROM public.inventory WHERE id = v_inv;

      SELECT id, quantity INTO v_batch_id, v_existing_qty
        FROM public.inventory_batches
       WHERE inventory_id = v_inv AND lower(batch_no) = lower(v_batch) LIMIT 1;

      IF v_batch_id IS NULL THEN
        INSERT INTO public.inventory_batches(inventory_id, batch_no, expiry_date, mrp, purchase_price, quantity, supplier_id)
        VALUES (v_inv, v_batch, v_expiry, v_mrp, v_pp, v_qty, v_supplier_id)
        RETURNING id INTO v_batch_id;
        batches_created := batches_created + 1;
      ELSE
        UPDATE public.inventory_batches
           SET quantity = quantity + v_qty,
               expiry_date = COALESCE(v_expiry, expiry_date),
               mrp = CASE WHEN v_mrp > 0 THEN v_mrp ELSE mrp END,
               purchase_price = CASE WHEN v_pp > 0 THEN v_pp ELSE purchase_price END,
               supplier_id = COALESCE(supplier_id, v_supplier_id),
               active = true
         WHERE id = v_batch_id;
        batches_updated := batches_updated + 1;
      END IF;

      SELECT COALESCE(stock,0) INTO v_new FROM public.inventory WHERE id = v_inv;

      INSERT INTO public.inventory_ledger(inventory_id, batch_id, movement_type, quantity_change,
                                          previous_stock, new_stock, user_id, source, import_id, note)
      VALUES (v_inv, v_batch_id, 'OPENING STOCK IMPORT', v_qty, v_prev, v_new, v_uid,
              'Excel Import', import_id, v_name || ' / ' || v_batch);

      qty_applied := qty_applied + v_qty;
    EXCEPTION WHEN OTHERS THEN
      errors := errors || jsonb_build_object('row_index', idx, 'name', COALESCE(v_name,''), 'reason', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'products_created', products_created,
    'products_matched', products_matched,
    'batches_created', batches_created,
    'batches_updated', batches_updated,
    'quantity_applied', qty_applied,
    'errors', errors
  );
END $$;

REVOKE ALL ON FUNCTION app_private.import_inventory_rows(jsonb, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.import_inventory_rows(rows jsonb, import_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT app_private.import_inventory_rows(rows, import_id);
$$;

GRANT EXECUTE ON FUNCTION public.import_inventory_rows(jsonb, uuid) TO authenticated;
