
CREATE OR REPLACE FUNCTION public.sync_invoice_totals_from_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_inv uuid; v_b numeric; v_c numeric; v_s numeric; v_g numeric; v_half numeric; v_exists boolean;
BEGIN
  v_inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_inv IS NULL THEN RETURN NULL; END IF;
  SELECT true INTO v_exists FROM public.invoices WHERE id = v_inv;
  IF v_exists IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(round(sum(base_amount),2),0), COALESCE(round(sum(cgst),2),0),
         COALESCE(round(sum(sgst),2),0), COALESCE(round(sum(line_total),2),0)
    INTO v_b, v_c, v_s, v_g
    FROM public.invoice_lines WHERE invoice_id = v_inv;

  IF NOT FOUND OR v_g IS NULL THEN RETURN NULL; END IF;

  v_half := LEAST(v_c, v_s);

  UPDATE public.invoices
     SET base_amount = v_b,
         cgst = v_half,
         sgst = v_half,
         round_off = round(v_g - v_b - 2 * v_half, 2),
         gross_total = v_g,
         paid_amount = LEAST(paid_amount, v_g),
         pending_balance = GREATEST(round(v_g - LEAST(paid_amount, v_g), 2), 0)
   WHERE id = v_inv
     AND (round(gross_total,2) <> v_g OR round(base_amount,2) <> v_b
          OR round(cgst,2) <> v_half OR round(sgst,2) <> v_half);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_lines_sync_header ON public.invoice_lines;
CREATE CONSTRAINT TRIGGER trg_invoice_lines_sync_header
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_totals_from_lines();

CREATE OR REPLACE FUNCTION public.assert_voucher_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_vid uuid; v_diff numeric;
BEGIN
  v_vid := COALESCE(NEW.voucher_id, OLD.voucher_id);
  IF v_vid IS NULL THEN RETURN NULL; END IF;
  SELECT round(COALESCE(sum(debit),0) - COALESCE(sum(credit),0), 2)
    INTO v_diff FROM public.voucher_entries WHERE voucher_id = v_vid;
  IF v_diff IS NOT NULL AND abs(v_diff) > 0.005 THEN
    RAISE EXCEPTION 'Voucher % is not balanced: debits minus credits = %', v_vid, v_diff;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_voucher_entries_balanced ON public.voucher_entries;
CREATE CONSTRAINT TRIGGER trg_voucher_entries_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_voucher_balanced();

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_pending_balance_nonneg;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pending_balance_nonneg CHECK (pending_balance >= -0.01);
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_paid_not_over_gross;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_paid_not_over_gross CHECK (paid_amount <= gross_total + 0.01);
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_no_payment_on_zero_bill;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_no_payment_on_zero_bill CHECK (NOT (round(gross_total,2) = 0 AND paid_amount > 0));
