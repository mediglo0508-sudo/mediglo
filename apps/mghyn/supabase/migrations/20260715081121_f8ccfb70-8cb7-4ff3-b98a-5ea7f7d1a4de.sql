
-- 1. Restrict clinic_rooms SELECT to authenticated staff with a role
DROP POLICY IF EXISTS "Staff read clinic_rooms" ON public.clinic_rooms;
CREATE POLICY "Staff read clinic_rooms" ON public.clinic_rooms
  FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));

-- 2. Restrict cos_notifications_hub visibility to matching target_role (or broadcast NULL/'all')
DROP POLICY IF EXISTS cos_notifications_auth_access ON public.cos_notifications_hub;

CREATE POLICY cos_notifications_select ON public.cos_notifications_hub
  FOR SELECT TO authenticated
  USING (
    target_role IS NULL
    OR lower(target_role) IN ('all','everyone')
    OR app_private.has_role(auth.uid(), lower(target_role)::app_role)
  );

CREATE POLICY cos_notifications_write ON public.cos_notifications_hub
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

-- 3. Tighten follow_ups_write WITH CHECK so callers can only write rows assigned to themselves
DROP POLICY IF EXISTS follow_ups_write ON public.cos_follow_ups;
CREATE POLICY follow_ups_write ON public.cos_follow_ups
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
    OR app_private.has_role(auth.uid(), 'marketing'::app_role)
    OR (app_private.has_role(auth.uid(), 'caller'::app_role) AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
    OR app_private.has_role(auth.uid(), 'marketing'::app_role)
    OR (app_private.has_role(auth.uid(), 'caller'::app_role) AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  );
