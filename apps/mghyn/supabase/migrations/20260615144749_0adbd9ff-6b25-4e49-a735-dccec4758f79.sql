-- Remove duplicate permissive policies that referenced public-schema helper functions.
-- Keep only the app_private.* based policies for a single, consistent access model.

DROP POLICY IF EXISTS "cust read" ON public.customers;
DROP POLICY IF EXISTS "cust write" ON public.customers;

DROP POLICY IF EXISTS "expenses fin" ON public.expenses;

DROP POLICY IF EXISTS "invline read" ON public.invoice_lines;
DROP POLICY IF EXISTS "invline write" ON public.invoice_lines;

DROP POLICY IF EXISTS "inv_fin read" ON public.invoices;
DROP POLICY IF EXISTS "inv_fin write" ON public.invoices;

DROP POLICY IF EXISTS "rxphoto read" ON public.prescription_photos;
DROP POLICY IF EXISTS "rxphoto write" ON public.prescription_photos;

DROP POLICY IF EXISTS "rx read" ON public.prescriptions;
DROP POLICY IF EXISTS "rx write" ON public.prescriptions;

DROP POLICY IF EXISTS "consumption read" ON public.service_consumption;
DROP POLICY IF EXISTS "consumption write" ON public.service_consumption;

-- Remove the public-schema helper duplicates so authenticated/anon cannot call
-- role-check logic directly; the canonical versions live in app_private.
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.has_any_role(uuid);
DROP FUNCTION IF EXISTS public.is_finance(uuid);