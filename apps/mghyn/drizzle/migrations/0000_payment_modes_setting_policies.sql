CREATE POLICY app_settings_select_payment_modes ON public.app_settings FOR SELECT TO authenticated
  USING (key = 'payment_modes' AND app_private.has_any_role(auth.uid()));
CREATE POLICY app_settings_insert_payment_modes ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (key = 'payment_modes' AND (app_private.has_role(auth.uid(),'admin'::app_role) OR app_private.has_role(auth.uid(),'accountant'::app_role)));
CREATE POLICY app_settings_update_payment_modes ON public.app_settings FOR UPDATE TO authenticated
  USING (key = 'payment_modes' AND (app_private.has_role(auth.uid(),'admin'::app_role) OR app_private.has_role(auth.uid(),'accountant'::app_role)))
  WITH CHECK (key = 'payment_modes' AND (app_private.has_role(auth.uid(),'admin'::app_role) OR app_private.has_role(auth.uid(),'accountant'::app_role)));