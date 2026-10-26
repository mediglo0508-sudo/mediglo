DELETE FROM public.inventory WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_name_not_blank CHECK (btrim(coalesce(name, '')) <> '');

DROP POLICY IF EXISTS "Only admins can delete inventory" ON public.inventory;

CREATE POLICY "Finance reception delete inventory"
ON public.inventory FOR DELETE TO authenticated
USING (
  app_private.is_finance(auth.uid())
  OR app_private.has_role(auth.uid(), 'reception'::app_role)
);