DROP POLICY IF EXISTS "photos read" ON public.prescription_photos;
DROP POLICY IF EXISTS "photos write" ON public.prescription_photos;

CREATE POLICY "photos read" ON public.prescription_photos
FOR SELECT
USING (
  app_private.has_role(auth.uid(), 'doctor'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'counselor'::app_role)
);

CREATE POLICY "photos write" ON public.prescription_photos
FOR ALL
USING (
  app_private.has_role(auth.uid(), 'doctor'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'counselor'::app_role)
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'doctor'::app_role)
  OR app_private.has_role(auth.uid(), 'admin'::app_role)
  OR app_private.has_role(auth.uid(), 'counselor'::app_role)
);