
-- Tighten permissive RLS policies to require an assigned staff role

DROP POLICY IF EXISTS cos_appointments_auth_access ON public.cos_appointments;
CREATE POLICY cos_appointments_auth_access ON public.cos_appointments
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS cos_sessions_auth_access ON public.cos_scheduled_sessions;
CREATE POLICY cos_sessions_auth_access ON public.cos_scheduled_sessions
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS cos_packages_auth_access ON public.cos_treatment_packages;
CREATE POLICY cos_packages_auth_access ON public.cos_treatment_packages
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS prescription_history_auth_access ON public.prescription_history;
CREATE POLICY prescription_history_auth_access ON public.prescription_history
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'counselor') OR app_private.has_role(auth.uid(),'therapist') OR app_private.has_role(auth.uid(),'reception'))
  WITH CHECK (app_private.has_role(auth.uid(),'doctor') OR app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'counselor'));

DROP POLICY IF EXISTS cos_branches_read ON public.cos_branches;
CREATE POLICY cos_branches_read ON public.cos_branches
  FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS cos_notifications_auth_access ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_auth_access ON public.cos_notifications_hub
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS cos_room_assets_auth_access ON public.cos_room_assets;
CREATE POLICY cos_room_assets_auth_access ON public.cos_room_assets
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS cos_gap_rules_auth_access ON public.cos_service_gap_rules;
CREATE POLICY cos_gap_rules_auth_access ON public.cos_service_gap_rules
  FOR ALL TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "Staff read staff_roster" ON public.staff_roster;
CREATE POLICY "Staff read staff_roster" ON public.staff_roster
  FOR SELECT TO authenticated
  USING (app_private.has_any_role(auth.uid()));
