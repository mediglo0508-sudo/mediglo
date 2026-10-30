ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS stock_category text NOT NULL DEFAULT 'RETAIL_PRODUCT',
  ADD COLUMN IF NOT EXISTS linked_service_id uuid REFERENCES public.services_master(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_stock_category_chk'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_stock_category_chk
      CHECK (stock_category IN ('RETAIL_PRODUCT','INJECTABLE_CONSUMABLE','IN_HOUSE_SURGICAL'));
  END IF;
END $$;