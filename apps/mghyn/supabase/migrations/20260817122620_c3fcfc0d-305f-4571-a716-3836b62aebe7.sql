CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select_authenticated" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_insert_admin" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "app_settings_update_admin" ON public.app_settings
  FOR UPDATE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "app_settings_delete_admin" ON public.app_settings
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.app_settings (key, value)
VALUES ('maintenance_mode', '{"enabled": true, "message": "MediGlo Vision is currently being updated and improved. The software is currently in the development/update phase, so some time may be required before it is ready. Billing is temporarily unavailable. We apologize for the inconvenience."}'::jsonb);

CREATE OR REPLACE FUNCTION public.is_maintenance_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value->>'enabled')::boolean FROM public.app_settings WHERE key = 'maintenance_mode'), false)
$$;

CREATE OR REPLACE FUNCTION public.block_billing_during_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_maintenance_mode() THEN
    RAISE EXCEPTION 'Billing is temporarily disabled: MediGlo Vision is undergoing scheduled maintenance.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_maintenance_block_invoices
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_billing_during_maintenance();

CREATE TRIGGER zz_maintenance_block_invoice_lines
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_billing_during_maintenance();

CREATE TRIGGER zz_maintenance_block_vouchers
  BEFORE INSERT OR UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.block_billing_during_maintenance();

CREATE TRIGGER zz_maintenance_block_service_consumption
  BEFORE INSERT OR UPDATE ON public.service_consumption
  FOR EACH ROW EXECUTE FUNCTION public.block_billing_during_maintenance();