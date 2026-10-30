
-- audit_log: restrict writes
DROP POLICY IF EXISTS "audit_log admin insert" ON public.audit_log;
CREATE POLICY "audit_log admin insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "audit_log no update" ON public.audit_log;
CREATE POLICY "audit_log no update" ON public.audit_log
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "audit_log no delete" ON public.audit_log;
CREATE POLICY "audit_log no delete" ON public.audit_log
  FOR DELETE TO authenticated USING (false);

-- cos_notifications_hub: narrow write to admin / marketing_head
DROP POLICY IF EXISTS cos_notifications_write ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_write ON public.cos_notifications_hub
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'marketing_head'::public.app_role)
  )
  WITH CHECK (
    (app_private.has_role(auth.uid(), 'admin'::public.app_role)
     OR app_private.has_role(auth.uid(), 'marketing_head'::public.app_role))
    AND (
      target_role IS NULL
      OR lower(target_role::text) = ANY (ARRAY['all','everyone'])
      OR lower(target_role::text) IN (SELECT unnest(enum_range(NULL::public.app_role))::text)
    )
  );

-- service_wallets: restrict to finance-facing roles
DROP POLICY IF EXISTS wallets_read ON public.service_wallets;
DROP POLICY IF EXISTS wallets_write ON public.service_wallets;
CREATE POLICY wallets_read ON public.service_wallets
  FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
    OR app_private.has_role(auth.uid(), 'doctor'::public.app_role)
    OR app_private.has_role(auth.uid(), 'counselor'::public.app_role)
  );
CREATE POLICY wallets_write ON public.service_wallets
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
  );

-- wallet_redemptions: same finance-facing scope
DROP POLICY IF EXISTS redemptions_read ON public.wallet_redemptions;
DROP POLICY IF EXISTS redemptions_write ON public.wallet_redemptions;
CREATE POLICY redemptions_read ON public.wallet_redemptions
  FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
    OR app_private.has_role(auth.uid(), 'doctor'::public.app_role)
    OR app_private.has_role(auth.uid(), 'therapist'::public.app_role)
    OR app_private.has_role(auth.uid(), 'counselor'::public.app_role)
  );
CREATE POLICY redemptions_write ON public.wallet_redemptions
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
    OR app_private.has_role(auth.uid(), 'therapist'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'accountant'::public.app_role)
    OR app_private.has_role(auth.uid(), 'reception'::public.app_role)
    OR app_private.has_role(auth.uid(), 'therapist'::public.app_role)
  );
