CREATE OR REPLACE FUNCTION public.bootstrap_current_user()
RETURNS TABLE(profile_created boolean, admin_granted boolean, roles app_role[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  admin_exists boolean;
  created_profile boolean := false;
  granted_admin boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    current_user_id,
    COALESCE(
      NULLIF((auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      NULLIF((auth.jwt() -> 'user_metadata' ->> 'name'), ''),
      'Charan Singh'
    ),
    NULLIF((auth.jwt() -> 'user_metadata' ->> 'phone'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS created_profile = ROW_COUNT;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  ) INTO admin_exists;

  IF NOT admin_exists THEN
    UPDATE public.profiles
    SET full_name = 'Charan Singh', updated_at = now()
    WHERE id = current_user_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (current_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    GET DIAGNOSTICS granted_admin = ROW_COUNT;
  END IF;

  RETURN QUERY
  SELECT
    created_profile,
    granted_admin,
    ARRAY(
      SELECT ur.role
      FROM public.user_roles ur
      WHERE ur.user_id = current_user_id
      ORDER BY ur.role::text
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user() TO authenticated;