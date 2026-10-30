REVOKE ALL ON FUNCTION public.is_maintenance_mode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_billing_during_maintenance() FROM PUBLIC, anon, authenticated;