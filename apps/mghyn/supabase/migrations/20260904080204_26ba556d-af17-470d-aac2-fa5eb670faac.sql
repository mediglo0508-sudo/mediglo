-- 1. clinical_records: restrict deletes to the record author or an admin
DROP POLICY IF EXISTS "Doctors and admins delete clinical_records" ON public.clinical_records;
CREATE POLICY "Authors and admins delete clinical_records"
ON public.clinical_records FOR DELETE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR (created_by IS NOT NULL AND created_by = auth.uid())
);

-- 2. cos_follow_up_notes: readable only when the parent follow-up is visible to the caller
DROP POLICY IF EXISTS "follow_up_notes_read" ON public.cos_follow_up_notes;
CREATE POLICY "follow_up_notes_read"
ON public.cos_follow_up_notes FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.cos_follow_ups f
    WHERE f.id = cos_follow_up_notes.follow_up_id
      AND (
        app_private.has_role(auth.uid(), 'admin'::app_role)
        OR app_private.has_role(auth.uid(), 'marketing_admin'::app_role)
        OR app_private.has_role(auth.uid(), 'marketing_head'::app_role)
        OR app_private.has_role(auth.uid(), 'reception'::app_role)
        OR f.assigned_to = auth.uid()
        OR (f.assigned_to IS NULL AND (
              app_private.has_role(auth.uid(), 'marketing'::app_role)
           OR app_private.has_role(auth.uid(), 'caller'::app_role)))
      )
  )
);

-- 3. prescriptions: split the blanket ALL policy into scoped commands
DROP POLICY IF EXISTS "prescriptions write" ON public.prescriptions;

CREATE POLICY "prescriptions insert"
ON public.prescriptions FOR INSERT TO authenticated
WITH CHECK (
  (app_private.has_role(auth.uid(), 'doctor'::app_role)
   OR app_private.has_role(auth.uid(), 'counselor'::app_role)
   OR app_private.has_role(auth.uid(), 'admin'::app_role))
  AND (doctor_id IS NULL OR doctor_id = auth.uid()
       OR app_private.has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "prescriptions update"
ON public.prescriptions FOR UPDATE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR doctor_id = auth.uid()
  OR (doctor_id IS NULL AND (
        app_private.has_role(auth.uid(), 'doctor'::app_role)
     OR app_private.has_role(auth.uid(), 'counselor'::app_role)))
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR doctor_id = auth.uid()
  OR (doctor_id IS NULL AND (
        app_private.has_role(auth.uid(), 'doctor'::app_role)
     OR app_private.has_role(auth.uid(), 'counselor'::app_role)))
);

CREATE POLICY "prescriptions delete"
ON public.prescriptions FOR DELETE TO authenticated
USING (
  app_private.has_role(auth.uid(), 'admin'::app_role)
  OR doctor_id = auth.uid()
);