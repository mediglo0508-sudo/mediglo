
CREATE TABLE IF NOT EXISTS public.service_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_line_id UUID UNIQUE REFERENCES public.invoice_lines(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services_master(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  consumed_sessions INTEGER NOT NULL DEFAULT 0 CHECK (consumed_sessions >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallets_customer ON public.service_wallets(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallets_status ON public.service_wallets(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_wallets TO authenticated;
GRANT ALL ON public.service_wallets TO service_role;
ALTER TABLE public.service_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets_read" ON public.service_wallets;
CREATE POLICY "wallets_read" ON public.service_wallets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "wallets_write" ON public.service_wallets;
CREATE POLICY "wallets_write" ON public.service_wallets FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_wallets_updated ON public.service_wallets;
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.service_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.wallet_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.service_wallets(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  therapist_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  therapist_name TEXT,
  room_name TEXT,
  notes TEXT,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redemptions_wallet ON public.wallet_redemptions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_therapist ON public.wallet_redemptions(therapist_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_redemptions TO authenticated;
GRANT ALL ON public.wallet_redemptions TO service_role;
ALTER TABLE public.wallet_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "redemptions_read" ON public.wallet_redemptions;
CREATE POLICY "redemptions_read" ON public.wallet_redemptions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "redemptions_write" ON public.wallet_redemptions;
CREATE POLICY "redemptions_write" ON public.wallet_redemptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.wallet_apply_redemption() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.service_wallets
       SET consumed_sessions = consumed_sessions + 1,
           status = CASE WHEN consumed_sessions + 1 >= total_sessions THEN 'completed' ELSE 'active' END
     WHERE id = NEW.wallet_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.service_wallets
       SET consumed_sessions = GREATEST(0, consumed_sessions - 1),
           status = 'active'
     WHERE id = OLD.wallet_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_wallet_redeem_ins ON public.wallet_redemptions;
CREATE TRIGGER trg_wallet_redeem_ins AFTER INSERT ON public.wallet_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.wallet_apply_redemption();
DROP TRIGGER IF EXISTS trg_wallet_redeem_del ON public.wallet_redemptions;
CREATE TRIGGER trg_wallet_redeem_del AFTER DELETE ON public.wallet_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.wallet_apply_redemption();

CREATE OR REPLACE FUNCTION public.auto_create_wallet_from_line() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty INTEGER;
  v_service RECORD;
  v_customer_id UUID; v_customer_name TEXT; v_customer_phone TEXT;
  v_wallet_id UUID;
BEGIN
  v_qty := COALESCE(NEW.qty, 1)::INTEGER;
  IF v_qty <= 1 THEN RETURN NEW; END IF;
  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN RETURN NEW; END IF;

  SELECT id, name INTO v_service
    FROM public.services_master
   WHERE lower(name) = lower(NEW.description)
   LIMIT 1;
  IF v_service.id IS NULL THEN
    SELECT id, name INTO v_service
      FROM public.services_master
     WHERE lower(NEW.description) LIKE '%' || lower(name) || '%'
     ORDER BY length(name) DESC
     LIMIT 1;
  END IF;
  IF v_service.id IS NULL THEN RETURN NEW; END IF;

  SELECT i.customer_id, c.name, c.phone
    INTO v_customer_id, v_customer_name, v_customer_phone
    FROM public.invoices i
    LEFT JOIN public.customers c ON c.id = i.customer_id
   WHERE i.id = NEW.invoice_id
   LIMIT 1;

  INSERT INTO public.service_wallets (
    customer_id, customer_name, customer_phone,
    invoice_id, invoice_line_id, service_id, service_name,
    total_sessions, consumed_sessions, status
  ) VALUES (
    v_customer_id, v_customer_name, v_customer_phone,
    NEW.invoice_id, NEW.id, v_service.id, v_service.name,
    v_qty, 0, 'active'
  )
  ON CONFLICT (invoice_line_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_redemptions (wallet_id, is_initial, notes)
    VALUES (v_wallet_id, TRUE, 'Session 1 consumed on billing day');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wallet_autocreate ON public.invoice_lines;
CREATE TRIGGER trg_wallet_autocreate AFTER INSERT ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_wallet_from_line();
