-- 1. Fix mutable search path
ALTER FUNCTION app_private.ledger_for_mode(text) SET search_path = public;

-- 2. Quotation numbers assigned server-side by trigger instead of a client-callable function
CREATE OR REPLACE FUNCTION public.set_quotation_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.quotation_number IS NULL OR btrim(NEW.quotation_number) = '')
     AND lower(coalesce(NEW.status,'draft')) <> 'draft' THEN
    NEW.quotation_number := public.next_quotation_no();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_quotation_no ON public.counselor_quotations;
CREATE TRIGGER trg_set_quotation_no
BEFORE INSERT OR UPDATE ON public.counselor_quotations
FOR EACH ROW EXECUTE FUNCTION public.set_quotation_no();

-- invoice number trigger must keep working after execute is revoked
CREATE OR REPLACE FUNCTION public.set_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' OR NEW.invoice_no LIKE 'IMP-%' OR NEW.invoice_no LIKE 'POS-%' THEN
    NEW.invoice_no := public.next_invoice_no();
  END IF;
  RETURN NEW;
END $$;

-- 3. Revoke direct execution of the privileged sequence functions
REVOKE ALL ON FUNCTION public.next_quotation_no() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_invoice_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_quotation_no() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_no() TO service_role;

-- 4. Prescription line items: mirror parent role-scoped read access
DROP POLICY IF EXISTS rx_items_select ON public.doctor_prescription_items;
CREATE POLICY rx_items_select ON public.doctor_prescription_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.doctor_prescriptions p
  WHERE p.id = doctor_prescription_items.prescription_id
    AND (
      p.doctor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR public.has_role(auth.uid(), 'reception')
      OR public.has_role(auth.uid(), 'counselor')
      OR public.has_role(auth.uid(), 'counselor_1')
      OR public.has_role(auth.uid(), 'counselor_2')
    )
));

-- 5. Notifications hub: marketing heads may only touch rows targeted at their allowed roles
DROP POLICY IF EXISTS cos_notifications_write ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_write ON public.cos_notifications_hub
FOR ALL TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    app_private.has_role(auth.uid(), 'marketing_head'::app_role)
    AND lower(coalesce(target_role, 'all')::text) = ANY (ARRAY['all','everyone','marketing','marketing_head','marketing_admin','caller','counselor','counselor_1','counselor_2','reception'])
  )
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    app_private.has_role(auth.uid(), 'marketing_head'::app_role)
    AND lower(coalesce(target_role, 'all')::text) = ANY (ARRAY['all','everyone','marketing','marketing_head','marketing_admin','caller','counselor','counselor_1','counselor_2','reception'])
  )
);

-- 6. OAuth rate limit buckets: server-side only
REVOKE ALL ON TABLE public.oauth_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.oauth_rate_limits TO service_role;
DROP POLICY IF EXISTS oauth_rate_limits_service_only ON public.oauth_rate_limits;
CREATE POLICY oauth_rate_limits_service_only ON public.oauth_rate_limits
FOR ALL TO service_role USING (true) WITH CHECK (true);