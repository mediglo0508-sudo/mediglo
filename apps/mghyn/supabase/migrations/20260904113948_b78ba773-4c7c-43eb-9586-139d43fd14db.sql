ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS inventory_id uuid NULL REFERENCES public.inventory(id);
CREATE INDEX IF NOT EXISTS invoice_lines_inventory_id_idx ON public.invoice_lines(inventory_id);

ALTER TABLE public.inventory_ledger ADD COLUMN IF NOT EXISTS invoice_id uuid NULL REFERENCES public.invoices(id);
ALTER TABLE public.inventory_ledger ADD COLUMN IF NOT EXISTS invoice_line_id uuid NULL;
ALTER TABLE public.inventory_ledger ADD COLUMN IF NOT EXISTS reverses_ledger_id uuid NULL REFERENCES public.inventory_ledger(id);
CREATE INDEX IF NOT EXISTS inventory_ledger_invoice_id_idx ON public.inventory_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS inventory_ledger_invoice_line_id_idx ON public.inventory_ledger(invoice_line_id);
CREATE INDEX IF NOT EXISTS inventory_ledger_reverses_ledger_id_idx ON public.inventory_ledger(reverses_ledger_id);

-- Conservative backfill: exactly-one-match only.
WITH m AS (
  SELECT lower(trim(i.name)) AS k, min(i.id::text)::uuid AS inv_id, count(*) AS n
  FROM public.inventory i
  WHERE i.active
  GROUP BY 1
)
UPDATE public.invoice_lines l
SET inventory_id = m.inv_id
FROM m
WHERE l.inventory_id IS NULL
  AND m.n = 1
  AND lower(trim(l.description)) = m.k;

WITH cand AS (
  SELECT g.id AS ledger_id, min(v.id::text)::uuid AS inv_id, count(*) AS n
  FROM public.inventory_ledger g
  JOIN public.invoices v
    ON v.invoice_no IS NOT NULL
   AND length(v.invoice_no) > 3
   AND g.note LIKE '%' || v.invoice_no || '%'
  WHERE g.invoice_id IS NULL AND g.note IS NOT NULL
  GROUP BY g.id
)
UPDATE public.inventory_ledger g
SET invoice_id = cand.inv_id
FROM cand
WHERE g.id = cand.ledger_id AND cand.n = 1;