DROP POLICY IF EXISTS pharmacist_items_select ON public.pharmacist_order_items;
CREATE POLICY pharmacist_items_select ON public.pharmacist_order_items
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'reception')
  OR has_role(auth.uid(), 'accountant')
  OR EXISTS (
    SELECT 1 FROM public.product_orders po
    WHERE po.id = pharmacist_order_items.order_id
      AND po.assigned_to = auth.uid()
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_product_order_id_uniq
  ON public.invoices (product_order_id)
  WHERE product_order_id IS NOT NULL AND voided_at IS NULL;