-- ============ product_orders ============
CREATE TABLE IF NOT EXISTS public.product_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no TEXT,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  quotation_id UUID REFERENCES public.counselor_quotations(id) ON DELETE SET NULL,
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','confirmed','ready_for_pickup','completed','cancelled')),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  items_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','partial','failed')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_orders_customer_id ON public.product_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_assigned_to ON public.product_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_product_orders_status ON public.product_orders(status);
CREATE INDEX IF NOT EXISTS idx_product_orders_encounter_id ON public.product_orders(encounter_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_orders TO authenticated;
GRANT ALL ON public.product_orders TO service_role;
ALTER TABLE public.product_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_orders_select ON public.product_orders FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR (status = 'pending' AND public.has_role(auth.uid(), 'pharmacist'))
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'reception')
  );

CREATE POLICY product_orders_insert ON public.product_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'reception')
    OR public.has_role(auth.uid(), 'counselor')
    OR public.has_role(auth.uid(), 'counselor_1')
    OR public.has_role(auth.uid(), 'counselor_2')
    OR public.has_role(auth.uid(), 'pharmacist')
  );

CREATE POLICY product_orders_update ON public.product_orders FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'pharmacist') AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'reception')
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'pharmacist') AND assigned_to = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'reception')
  );

CREATE POLICY product_orders_delete ON public.product_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_product_orders_updated_at BEFORE UPDATE ON public.product_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ pharmacist_order_items ============
CREATE TABLE IF NOT EXISTS public.pharmacist_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.product_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.inventory(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  quantity_requested NUMERIC(12,2) NOT NULL CHECK (quantity_requested > 0),
  quantity_dispensed NUMERIC(12,2),
  quantity_returned NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  batch_no TEXT,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dispensed','returned','damaged')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacist_items_order_id ON public.pharmacist_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pharmacist_items_product_id ON public.pharmacist_order_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_order_items TO authenticated;
GRANT ALL ON public.pharmacist_order_items TO service_role;
ALTER TABLE public.pharmacist_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacist_items_select ON public.pharmacist_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_orders po WHERE po.id = order_id));

CREATE POLICY pharmacist_items_write ON public.pharmacist_order_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'reception')
    OR EXISTS (SELECT 1 FROM public.product_orders po WHERE po.id = order_id AND po.assigned_to = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'reception')
    OR EXISTS (SELECT 1 FROM public.product_orders po WHERE po.id = order_id AND po.assigned_to = auth.uid())
  );

-- ============ pharmacist_permissions ============
CREATE TABLE IF NOT EXISTS public.pharmacist_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  can_view_treatment_pricing BOOLEAN NOT NULL DEFAULT false,
  can_approve_discounts BOOLEAN NOT NULL DEFAULT false,
  max_discount_percent INT NOT NULL DEFAULT 0,
  max_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  can_modify_product_prices BOOLEAN NOT NULL DEFAULT false,
  can_adjust_inventory BOOLEAN NOT NULL DEFAULT false,
  can_process_returns BOOLEAN NOT NULL DEFAULT false,
  can_write_off_damaged BOOLEAN NOT NULL DEFAULT false,
  is_senior_pharmacist BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacist_permissions_user_id ON public.pharmacist_permissions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_permissions TO authenticated;
GRANT ALL ON public.pharmacist_permissions TO service_role;
ALTER TABLE public.pharmacist_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacist_permissions_select ON public.pharmacist_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY pharmacist_permissions_write ON public.pharmacist_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pharmacist_permissions_updated_at BEFORE UPDATE ON public.pharmacist_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ links on existing tables ============
ALTER TABLE public.counselor_quotations
  ADD COLUMN IF NOT EXISTS product_order_id UUID REFERENCES public.product_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_products_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_pickup_date DATE;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS product_order_id UUID REFERENCES public.product_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispensed_by UUID,
  ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_product_order_id ON public.invoices(product_order_id);

-- ============ receipt numbering ============
CREATE SEQUENCE IF NOT EXISTS public.product_receipt_seq START 500;

CREATE OR REPLACE FUNCTION public.set_product_receipt_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.receipt_no IS NULL THEN
    NEW.receipt_no := 'RCP-' || TO_CHAR(now(), 'YYYY') || '-' ||
      LPAD(nextval('public.product_receipt_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_receipt_no() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_product_orders_receipt_no BEFORE INSERT ON public.product_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_product_receipt_no();