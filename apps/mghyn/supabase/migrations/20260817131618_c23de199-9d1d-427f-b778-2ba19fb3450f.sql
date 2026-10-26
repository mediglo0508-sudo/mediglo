CREATE TABLE IF NOT EXISTS public.invoice_series (
  fy_label text PRIMARY KEY,
  last_no bigint NOT NULL DEFAULT 0
);

GRANT ALL ON public.invoice_series TO service_role;

ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_invoice_no()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_y int;
  v_m int;
  v_fy text;
  v_n bigint;
BEGIN
  v_y := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_m := EXTRACT(MONTH FROM CURRENT_DATE)::int;

  IF v_m >= 4 THEN
    v_fy := lpad(((v_y) % 100)::text, 2, '0') || '-' || lpad(((v_y + 1) % 100)::text, 2, '0');
  ELSE
    v_fy := lpad(((v_y - 1) % 100)::text, 2, '0') || '-' || lpad(((v_y) % 100)::text, 2, '0');
  END IF;

  INSERT INTO public.invoice_series (fy_label, last_no)
  VALUES (v_fy, 0)
  ON CONFLICT (fy_label) DO NOTHING;

  UPDATE public.invoice_series
     SET last_no = last_no + 1
   WHERE fy_label = v_fy
  RETURNING last_no INTO v_n;

  RETURN 'MG/' || v_fy || '/' ||
         CASE WHEN length(v_n::text) >= 4 THEN v_n::text ELSE lpad(v_n::text, 4, '0') END;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_new_series_unique
  ON public.invoices (invoice_no)
  WHERE invoice_no LIKE 'MG/%-%/%';
