-- 1. clinical_records: patient identity must point at the clinic patient record, not a staff account
ALTER TABLE public.clinical_records DROP CONSTRAINT IF EXISTS clinical_records_patient_id_fkey;
ALTER TABLE public.clinical_records
  ADD CONSTRAINT clinical_records_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- 2. cos_notifications_hub: validate target_role server-side
UPDATE public.cos_notifications_hub
  SET target_role = lower(target_role)
  WHERE target_role IS NOT NULL AND target_role <> lower(target_role);

UPDATE public.cos_notifications_hub
  SET target_role = 'all'
  WHERE target_role IS NOT NULL
    AND lower(target_role) NOT IN ('all','everyone')
    AND lower(target_role) NOT IN (SELECT unnest(enum_range(NULL::public.app_role))::text);

CREATE OR REPLACE FUNCTION public.validate_notification_target_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.target_role IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.target_role := lower(NEW.target_role);
  IF NEW.target_role IN ('all','everyone') THEN
    RETURN NEW;
  END IF;
  IF NEW.target_role NOT IN (SELECT unnest(enum_range(NULL::public.app_role))::text) THEN
    RAISE EXCEPTION 'Invalid notification target role: %', NEW.target_role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_notification_target_role_trg ON public.cos_notifications_hub;
CREATE TRIGGER validate_notification_target_role_trg
BEFORE INSERT OR UPDATE ON public.cos_notifications_hub
FOR EACH ROW EXECUTE FUNCTION public.validate_notification_target_role();

DROP POLICY IF EXISTS cos_notifications_select ON public.cos_notifications_hub;
CREATE POLICY cos_notifications_select ON public.cos_notifications_hub
FOR SELECT TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::public.app_role)
  OR target_role IS NULL
  OR lower(target_role::text) IN ('all','everyone')
  OR (
    lower(target_role::text) IN (SELECT unnest(enum_range(NULL::public.app_role))::text)
    AND app_private.has_role(auth.uid(), lower(target_role::text)::public.app_role)
  )
);

-- 3. single, cast-safe role check used by every policy
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  )
$function$;