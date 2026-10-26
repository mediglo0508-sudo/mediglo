CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(enum_range(NULL::public.app_role)) AS r(role)
    WHERE r.role::text = _role
      AND app_private.has_role(_user_id, r.role)
  )
$function$;