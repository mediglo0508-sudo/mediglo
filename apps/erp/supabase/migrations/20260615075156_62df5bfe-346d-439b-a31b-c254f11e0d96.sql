REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_finance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance(uuid) TO authenticated;