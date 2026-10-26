
ALTER TABLE public.reconciliation_allocations DROP CONSTRAINT IF EXISTS reconciliation_allocations_bank_txn_id_fkey;
ALTER TABLE public.reconciliation_allocations
  ADD CONSTRAINT reconciliation_allocations_bank_txn_id_fkey
  FOREIGN KEY (bank_txn_id) REFERENCES public.suspense_entries(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.recon_alloc_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE bank_amt NUMERIC(14,2); used NUMERIC(14,2);
BEGIN
  SELECT COALESCE(amount,0) INTO bank_amt FROM public.suspense_entries WHERE id = NEW.bank_txn_id;
  IF bank_amt IS NULL THEN RAISE EXCEPTION 'Unknown bank_txn %', NEW.bank_txn_id; END IF;
  SELECT COALESCE(SUM(amount),0) INTO used FROM public.reconciliation_allocations
    WHERE bank_txn_id = NEW.bank_txn_id AND id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid);
  IF (used + NEW.amount) > bank_amt + 0.01 THEN
    RAISE EXCEPTION 'Allocation total (%) exceeds bank txn amount (%)', used+NEW.amount, bank_amt;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.recon_alloc_guard() FROM PUBLIC, anon, authenticated;
