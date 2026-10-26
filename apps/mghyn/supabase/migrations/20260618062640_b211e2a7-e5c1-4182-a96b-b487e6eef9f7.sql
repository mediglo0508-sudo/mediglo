ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  v_name TEXT;
  v_is_admin BOOLEAN := false;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, v_name, NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    v_is_admin := true;
  END IF;

  -- Auto-append the authenticated account to the central Staff Directory
  INSERT INTO public.staff (user_id, name, email, phone, role_title, status, active)
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN v_is_admin THEN 'Admin / Director' ELSE 'Pending Assignment' END,
    CASE WHEN v_is_admin THEN 'active' ELSE 'pending' END,
    true
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;