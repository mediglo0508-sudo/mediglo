DROP TABLE IF EXISTS public.retail_products CASCADE;
DROP TABLE IF EXISTS public.injectable_consumables CASCADE;
DROP TABLE IF EXISTS public.inhouse_surgical CASCADE;

CREATE TABLE public.inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Retail',
  stock numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  expiry_date text,
  batch_no text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view inventory"
  ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert inventory"
  ON public.inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update inventory"
  ON public.inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Only admins can delete inventory"
  ON public.inventory FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;