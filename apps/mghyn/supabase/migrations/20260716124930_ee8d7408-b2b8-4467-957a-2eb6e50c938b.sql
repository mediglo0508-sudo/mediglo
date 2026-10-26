
-- 1) appointments: restrict INSERT to booking-facing roles only
DROP POLICY IF EXISTS "Staff insert appointments" ON public.appointments;
CREATE POLICY "Booking staff insert appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'reception'::app_role)
    OR app_private.has_role(auth.uid(), 'marketing'::app_role)
    OR app_private.has_role(auth.uid(), 'counselor'::app_role)
  );

-- 2) cos_notifications_hub: validate target_role at write time so the
--    SELECT-time cast can never encounter an invalid enum value.
DROP POLICY IF EXISTS cos_notifications_write ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_write
  ON public.cos_notifications_hub FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (
    app_private.has_any_role(auth.uid())
    AND (
      target_role IS NULL
      OR lower(target_role::text) IN ('all','everyone')
      OR lower(target_role::text) IN (
        SELECT unnest(enum_range(NULL::app_role))::text
      )
    )
  );

-- Guard SELECT cast against any legacy invalid rows so a bad value cannot
-- throw and break the whole query.
DROP POLICY IF EXISTS cos_notifications_select ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_select
  ON public.cos_notifications_hub FOR SELECT TO authenticated
  USING (
    target_role IS NULL
    OR lower(target_role::text) IN ('all','everyone')
    OR (
      lower(target_role::text) IN (SELECT unnest(enum_range(NULL::app_role))::text)
      AND app_private.has_role(auth.uid(), lower(target_role::text)::app_role)
    )
  );

-- 3) prescription_history: narrow USING to match WITH CHECK (clinical staff only)
DROP POLICY IF EXISTS prescription_history_auth_access ON public.prescription_history;
CREATE POLICY prescription_history_auth_access
  ON public.prescription_history FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'doctor'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'counselor'::app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'doctor'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'counselor'::app_role)
  );
