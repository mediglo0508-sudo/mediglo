DROP POLICY IF EXISTS "Staff write clinic_rooms" ON public.clinic_rooms;
DROP POLICY IF EXISTS "Staff update clinic_rooms" ON public.clinic_rooms;
DROP POLICY IF EXISTS "Staff delete clinic_rooms" ON public.clinic_rooms;

CREATE POLICY "Staff write clinic_rooms" ON public.clinic_rooms
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_any_role(auth.uid()));
CREATE POLICY "Staff update clinic_rooms" ON public.clinic_rooms
  FOR UPDATE TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));
CREATE POLICY "Staff delete clinic_rooms" ON public.clinic_rooms
  FOR DELETE TO authenticated
  USING (app_private.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "Staff write staff_roster" ON public.staff_roster;
DROP POLICY IF EXISTS "Staff update staff_roster" ON public.staff_roster;
DROP POLICY IF EXISTS "Staff delete staff_roster" ON public.staff_roster;

CREATE POLICY "Staff write staff_roster" ON public.staff_roster
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_any_role(auth.uid()));
CREATE POLICY "Staff update staff_roster" ON public.staff_roster
  FOR UPDATE TO authenticated
  USING (app_private.has_any_role(auth.uid()))
  WITH CHECK (app_private.has_any_role(auth.uid()));
CREATE POLICY "Staff delete staff_roster" ON public.staff_roster
  FOR DELETE TO authenticated
  USING (app_private.has_any_role(auth.uid()));