ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS item_category text NOT NULL DEFAULT 'service';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS city text;

-- Back-fill existing lines from the live masters
UPDATE public.invoice_lines l
   SET item_category = 'consultation'
 WHERE l.item_category = 'service'
   AND (
     l.sac_code = '999312'
     OR l.description ~* '(consult|doctor|opd|physician)'
     OR EXISTS (
       SELECT 1 FROM public.services_master s
        WHERE lower(s.name) = lower(l.description)
          AND (s.category ~* 'consult' OR s.sac_code = '999312')
     )
   );

UPDATE public.invoice_lines l
   SET item_category = 'product'
 WHERE l.item_category = 'service'
   AND EXISTS (
     SELECT 1 FROM public.inventory i WHERE lower(i.name) = lower(l.description)
   );

CREATE INDEX IF NOT EXISTS idx_invoice_lines_item_category
  ON public.invoice_lines (item_category);