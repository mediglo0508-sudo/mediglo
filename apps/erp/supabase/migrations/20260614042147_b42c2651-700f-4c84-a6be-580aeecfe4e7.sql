-- Per-service product consumption tracking
CREATE TABLE public.service_consumption (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_line_id uuid REFERENCES public.invoice_lines(id) ON DELETE CASCADE,
  service_name text,
  item_id uuid REFERENCES public.inventory_items(id),
  item_name text NOT NULL,
  qty_used numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_consumption TO authenticated;
GRANT ALL ON public.service_consumption TO service_role;

ALTER TABLE public.service_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consumption read" ON public.service_consumption
  FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "consumption write" ON public.service_consumption
  FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'))
  WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'));

-- Allow reception (billing) to auto-post vouchers from POS
DROP POLICY IF EXISTS "vouchers fin" ON public.vouchers;
CREATE POLICY "vouchers rw" ON public.vouchers
  FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'))
  WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'));

DROP POLICY IF EXISTS "ventries fin" ON public.voucher_entries;
CREATE POLICY "ventries rw" ON public.voucher_entries
  FOR ALL USING (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'))
  WITH CHECK (public.is_finance(auth.uid()) OR public.has_role(auth.uid(), 'reception'));

-- Link invoice lines to a treatment package for session auto-increment
ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.treatment_packages(id);