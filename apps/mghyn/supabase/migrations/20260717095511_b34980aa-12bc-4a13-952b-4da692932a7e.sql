
REVOKE EXECUTE ON FUNCTION public.auto_book_next_session() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
