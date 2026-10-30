ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS round_off numeric NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS public.invoices_backup_batch_a;
CREATE TABLE public.invoices_backup_batch_a AS SELECT * FROM public.invoices;
DROP TABLE IF EXISTS public.invoice_lines_backup_batch_a;
CREATE TABLE public.invoice_lines_backup_batch_a AS SELECT * FROM public.invoice_lines;
DROP TABLE IF EXISTS public.voucher_entries_backup_batch_a;
CREATE TABLE public.voucher_entries_backup_batch_a AS SELECT * FROM public.voucher_entries;

GRANT ALL ON public.invoices_backup_batch_a TO service_role;
GRANT ALL ON public.invoice_lines_backup_batch_a TO service_role;
GRANT ALL ON public.voucher_entries_backup_batch_a TO service_role;

ALTER TABLE public.invoices_backup_batch_a ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines_backup_batch_a ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_entries_backup_batch_a ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read invoice backup" ON public.invoices_backup_batch_a FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read invoice line backup" ON public.invoice_lines_backup_batch_a FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read voucher entry backup" ON public.voucher_entries_backup_batch_a FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.invoices_backup_batch_a TO authenticated;
GRANT SELECT ON public.invoice_lines_backup_batch_a TO authenticated;
GRANT SELECT ON public.voucher_entries_backup_batch_a TO authenticated;