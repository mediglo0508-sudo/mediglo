-- 1) app_settings: staff may read ONLY the operational maintenance flag; admins read all.
DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;

CREATE POLICY app_settings_select_admin
  ON public.app_settings FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY app_settings_select_operational_flags
  ON public.app_settings FOR SELECT TO authenticated
  USING (key = 'maintenance_mode' AND app_private.has_any_role(auth.uid()));

-- 2) cos_follow_up_notes: reading requires an assigned staff role.
DROP POLICY IF EXISTS follow_up_notes_read ON public.cos_follow_up_notes;

CREATE POLICY follow_up_notes_read
  ON public.cos_follow_up_notes FOR SELECT TO authenticated
  USING (
    app_private.has_any_role(auth.uid())
    AND EXISTS (SELECT 1 FROM public.cos_follow_ups f WHERE f.id = cos_follow_up_notes.follow_up_id)
  );

-- 3) Frozen backup tables: standardise on the app_private, enum-typed role check.
DROP POLICY IF EXISTS "Admins read invoice backup" ON public.invoices_backup_batch_a;
CREATE POLICY "Admins read invoice backup"
  ON public.invoices_backup_batch_a FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read invoice line backup" ON public.invoice_lines_backup_batch_a;
CREATE POLICY "Admins read invoice line backup"
  ON public.invoice_lines_backup_batch_a FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read voucher entry backup" ON public.voucher_entries_backup_batch_a;
CREATE POLICY "Admins read voucher entry backup"
  ON public.voucher_entries_backup_batch_a FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));