-- 1. Fix RLS helper access (authenticated must be able to execute the private role helpers used inside policies)
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_any_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_finance(uuid) TO authenticated;

-- 2. Inventory product detail fields (all nullable so blank rates/fields never break UI)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS vendor text,
  ADD COLUMN IF NOT EXISTS contact text,
  ADD COLUMN IF NOT EXISTS expiry_date text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS batch_no text,
  ADD COLUMN IF NOT EXISTS disc numeric;

-- 3. Package master tracking fields
ALTER TABLE public.treatment_packages
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS package_details text,
  ADD COLUMN IF NOT EXISTS pending_amount numeric,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Booked';