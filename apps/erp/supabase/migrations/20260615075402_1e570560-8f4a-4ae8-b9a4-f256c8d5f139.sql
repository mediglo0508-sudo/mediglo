REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_finance(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.has_any_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.is_finance(uuid) FROM PUBLIC, anon, authenticated;