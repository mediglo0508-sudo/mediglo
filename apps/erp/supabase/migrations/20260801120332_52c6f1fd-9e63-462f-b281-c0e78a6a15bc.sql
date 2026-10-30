-- 1. Canonical "live invoice" definition
CREATE OR REPLACE VIEW public.v_live_invoices
WITH (security_invoker = true) AS
  SELECT * FROM public.invoices WHERE voided_at IS NULL;

GRANT SELECT ON public.v_live_invoices TO authenticated;
GRANT ALL ON public.v_live_invoices TO service_role;

-- 2. Complete the void chain + neutralise voided dues
UPDATE public.invoices o
   SET replaced_by = n.id
  FROM public.invoices n
 WHERE n.revised_from = o.id AND o.replaced_by IS DISTINCT FROM n.id;

UPDATE public.invoices
   SET pending_balance = 0, paid_amount = COALESCE(paid_amount,0)
 WHERE voided_at IS NOT NULL AND COALESCE(pending_balance,0) <> 0;

-- 3. Repair orphaned invoice -> customer mapping (unambiguous matches only)
UPDATE public.invoices i
   SET customer_id = c.id
  FROM public.customers c
 WHERE i.customer_id IS NULL
   AND c.phone IS NOT NULL AND c.phone <> ''
   AND regexp_replace(c.phone,'\D','','g') = regexp_replace(COALESCE(i.customer_name,''),'\D','','g')
   AND length(regexp_replace(c.phone,'\D','','g')) >= 10;

UPDATE public.invoices i
   SET customer_id = m.cid
  FROM (
    SELECT lower(btrim(name)) AS nm, (array_agg(id ORDER BY created_at))[1] AS cid
      FROM public.customers
     WHERE name IS NOT NULL AND btrim(name) <> ''
     GROUP BY lower(btrim(name))
    HAVING count(*) = 1
  ) m
 WHERE i.customer_id IS NULL
   AND lower(btrim(COALESCE(i.customer_name,''))) = m.nm;

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_voided_at ON public.invoices(voided_at);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_name_lower ON public.invoices(lower(btrim(customer_name)));

-- 4. Reconciliation routine (re-runnable, one customer or all)
CREATE OR REPLACE FUNCTION app_private.reconcile_customer_ledger(p_customer_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.customers c
     SET outstanding_balance = COALESCE((
           SELECT SUM(COALESCE(i.pending_balance,0))
             FROM public.invoices i
            WHERE i.customer_id = c.id AND i.voided_at IS NULL
         ), 0)
   WHERE p_customer_id IS NULL OR c.id = p_customer_id;
$$;

REVOKE ALL ON FUNCTION app_private.reconcile_customer_ledger(uuid) FROM PUBLIC;

-- 5. Keep the stored balance correct on every invoice mutation
CREATE OR REPLACE FUNCTION app_private.invoices_sync_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Link a revision back to the invoice it replaced and clear that copy's dues.
  IF TG_OP = 'INSERT' AND NEW.revised_from IS NOT NULL THEN
    UPDATE public.invoices
       SET replaced_by = NEW.id, pending_balance = 0
     WHERE id = NEW.revised_from;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.customer_id IS NOT NULL THEN
    PERFORM app_private.reconcile_customer_ledger(OLD.customer_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.customer_id IS NOT NULL THEN
    PERFORM app_private.reconcile_customer_ledger(NEW.customer_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_sync_ledger ON public.invoices;
CREATE TRIGGER trg_invoices_sync_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION app_private.invoices_sync_ledger();

-- 6. Deleting a customer must never leave a ghost balance behind
CREATE OR REPLACE FUNCTION app_private.customers_clear_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.invoices
     SET customer_id = NULL,
         paid_amount = COALESCE(paid_amount,0) + COALESCE(pending_balance,0),
         pending_balance = 0
   WHERE customer_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_clear_ledger ON public.customers;
CREATE TRIGGER trg_customers_clear_ledger
BEFORE DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION app_private.customers_clear_ledger();

-- 7. One-time cleanup of every corrupted total
SELECT app_private.reconcile_customer_ledger(NULL);