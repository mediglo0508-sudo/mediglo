
-- 1. Fix admin role: grant admin to Himanshu Yadav
INSERT INTO public.user_roles (user_id, role)
VALUES ('61531988-1e26-4b8d-a403-ed47133a596d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Auto-create profile + first-admin on new signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Inventory dual-system: injectable vs product
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product';
ALTER TABLE public.inventory_items
  ALTER COLUMN cost_price DROP NOT NULL;

-- 4. Haryana default point of supply (06 = Haryana)
ALTER TABLE public.invoices ALTER COLUMN state_code SET DEFAULT '06';
ALTER TABLE public.customers ALTER COLUMN state_code SET DEFAULT '06';

-- 5. Bank reconciliation: statement imports
CREATE TABLE public.bank_statements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name text NOT NULL,
  bank_name text,
  uploaded_by uuid DEFAULT auth.uid(),
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements TO authenticated;
GRANT ALL ON public.bank_statements TO service_role;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_stmt finance" ON public.bank_statements FOR ALL
  USING (app_private.is_finance(auth.uid()))
  WITH CHECK (app_private.is_finance(auth.uid()));

-- 6. Suspense ledger
CREATE TABLE public.suspense_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id uuid REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'in', -- 'in' = receipt, 'out' = payment
  status text NOT NULL DEFAULT 'pending', -- pending | cleared
  allocation_type text, -- invoice | advance | expense | vendor
  allocated_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suspense_entries TO authenticated;
GRANT ALL ON public.suspense_entries TO service_role;
ALTER TABLE public.suspense_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suspense finance" ON public.suspense_entries FOR ALL
  USING (app_private.is_finance(auth.uid()))
  WITH CHECK (app_private.is_finance(auth.uid()));
CREATE TRIGGER trg_suspense_updated BEFORE UPDATE ON public.suspense_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
