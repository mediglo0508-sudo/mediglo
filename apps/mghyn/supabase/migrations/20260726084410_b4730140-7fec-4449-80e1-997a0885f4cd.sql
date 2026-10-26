ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_discount_type_chk'
  ) THEN
    ALTER TABLE public.invoice_lines
      ADD CONSTRAINT invoice_lines_discount_type_chk
      CHECK (discount_type IN ('amount','percent'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.revise_invoice(old_id uuid, payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_allowed      boolean;
  v_old          public.invoices%ROWTYPE;
  v_new_id       uuid;
  v_new_no       text;
  v_line         jsonb;
  v_new_line_id  uuid;
  v_line_index   integer := 0;
  v_line_ids     uuid[]  := ARRAY[]::uuid[];
  v_cons         jsonb;
  v_freeze       date := '2026-06-04'::date;
  v_pkg_id       uuid;
  v_gross        numeric;
  v_disc         numeric;
  v_net          numeric;
  v_rate         numeric;
  v_base         numeric;
  v_tax          numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT (app_private.has_role(v_uid, 'admin'::public.app_role)
       OR app_private.has_role(v_uid, 'accountant'::public.app_role)
       OR app_private.has_role(v_uid, 'reception'::public.app_role))
    INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Forbidden: requires admin/accountant/reception'; END IF;

  SELECT * INTO v_old FROM public.invoices WHERE id = old_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', old_id; END IF;
  IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Invoice already voided'; END IF;
  IF v_old.source = 'receipt' THEN RAISE EXCEPTION 'Balance-clearance receipts cannot be edited'; END IF;

  IF v_old.invoice_date >= v_freeze THEN
    UPDATE public.inventory i
       SET stock = COALESCE(i.stock,0) + sc.qty_used
      FROM public.service_consumption sc
     WHERE sc.invoice_id = old_id AND sc.item_id IS NOT NULL AND i.id = sc.item_id;
  END IF;

  FOR v_pkg_id IN
    SELECT package_id FROM public.invoice_lines WHERE invoice_id = old_id AND package_id IS NOT NULL
  LOOP
    UPDATE public.treatment_packages
       SET sessions_completed = GREATEST(0, COALESCE(sessions_completed,0) - 1)
     WHERE id = v_pkg_id;
  END LOOP;

  DELETE FROM public.service_wallets WHERE invoice_id = old_id;
  DELETE FROM public.vouchers
   WHERE vtype IN ('sales','receipt') AND narration ILIKE '%' || v_old.invoice_no || '%';

  UPDATE public.invoices
     SET voided_at = now(), voided_by = v_uid,
         voided_reason = COALESCE(NULLIF(payload->>'reason',''),'revised')
   WHERE id = old_id;

  INSERT INTO public.invoices (
    customer_id, customer_name, invoice_date, state_code, tax_mode, payment_mode,
    base_amount, cgst, sgst, discount_amount, gross_total, paid_amount, pending_balance,
    source, revised_from, assigned_staff
  ) VALUES (
    NULLIF(payload->>'customer_id','')::uuid,
    COALESCE(NULLIF(payload->>'customer_name',''), v_old.customer_name),
    COALESCE((NULLIF(payload->>'invoice_date',''))::date, CURRENT_DATE),
    COALESCE(NULLIF(payload->>'state_code',''), v_old.state_code),
    COALESCE((NULLIF(payload->>'tax_mode',''))::tax_mode, v_old.tax_mode),
    COALESCE(NULLIF(payload->>'payment_mode',''), v_old.payment_mode),
    COALESCE((payload->>'base_amount')::numeric, 0),
    COALESCE((payload->>'cgst')::numeric, 0),
    COALESCE((payload->>'sgst')::numeric, 0),
    COALESCE((payload->>'discount_amount')::numeric, 0),
    COALESCE((payload->>'gross_total')::numeric, 0),
    COALESCE((payload->>'paid_amount')::numeric, 0),
    COALESCE((payload->>'pending_balance')::numeric, 0),
    'pos', old_id, v_old.assigned_staff
  )
  RETURNING id, invoice_no INTO v_new_id, v_new_no;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'lines','[]'::jsonb))
  LOOP
    -- Recompute the line net-of-discount taxable value server-side.
    v_gross := COALESCE((v_line->>'qty')::numeric, 1) * COALESCE((v_line->>'unit_price')::numeric, 0);
    IF COALESCE(v_line->>'discount_type','amount') = 'percent' THEN
      v_disc := round(v_gross * COALESCE((v_line->>'discount_value')::numeric, 0) / 100, 2);
    ELSE
      v_disc := round(COALESCE((v_line->>'discount_value')::numeric, 0), 2);
    END IF;
    v_disc := LEAST(GREATEST(v_disc, 0), round(v_gross, 2));
    v_net  := round(v_gross - v_disc, 2);
    v_rate := COALESCE((v_line->>'gst_rate')::numeric, 5);

    IF v_rate <= 0 THEN
      v_base := v_net; v_tax := 0;
    ELSIF COALESCE(payload->>'tax_mode','inclusive') = 'exclusive' THEN
      v_base := v_net; v_tax := round(v_net * v_rate / 100, 2); v_net := round(v_base + v_tax, 2);
    ELSE
      v_base := round(v_net / (1 + v_rate/100), 2); v_tax := round(v_net - v_base, 2);
    END IF;

    INSERT INTO public.invoice_lines (
      invoice_id, description, sac_code, qty, unit_price,
      discount_type, discount_value, discount_amount,
      base_amount, cgst, sgst, line_total, session_label, package_id, is_complimentary
    ) VALUES (
      v_new_id, v_line->>'description', NULLIF(v_line->>'sac_code',''),
      COALESCE((v_line->>'qty')::numeric, 1), COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE(NULLIF(v_line->>'discount_type',''), 'amount'),
      COALESCE((v_line->>'discount_value')::numeric, 0),
      v_disc,
      v_base, round(v_tax/2, 2), round(v_tax/2, 2), v_net,
      NULLIF(v_line->>'session_label',''), NULLIF(v_line->>'package_id','')::uuid,
      COALESCE((v_line->>'is_complimentary')::boolean, false)
    )
    RETURNING id INTO v_new_line_id;
    v_line_ids := v_line_ids || v_new_line_id;

    IF (v_line->>'package_id') IS NOT NULL AND (v_line->>'package_id') <> '' THEN
      UPDATE public.treatment_packages
         SET sessions_completed = LEAST(COALESCE(total_sessions,0), COALESCE(sessions_completed,0) + 1)
       WHERE id = (v_line->>'package_id')::uuid;
    END IF;
  END LOOP;

  FOR v_cons IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'consumption','[]'::jsonb))
  LOOP
    v_line_index := COALESCE((v_cons->>'line_index')::int, 0);
    INSERT INTO public.service_consumption (
      invoice_id, invoice_line_id, service_name, item_id, item_name, qty_used, unit_cost, total_cost
    ) VALUES (
      v_new_id,
      v_line_ids[v_line_index + 1],
      v_cons->>'service_name',
      NULLIF(v_cons->>'item_id','')::uuid,
      v_cons->>'item_name',
      COALESCE((v_cons->>'qty_used')::numeric, 0),
      COALESCE((v_cons->>'unit_cost')::numeric, 0),
      COALESCE((v_cons->>'total_cost')::numeric, 0)
    );

    IF COALESCE((NULLIF(payload->>'invoice_date',''))::date, CURRENT_DATE) >= v_freeze THEN
      UPDATE public.inventory
         SET stock = GREATEST(0, COALESCE(stock,0) - COALESCE((v_cons->>'qty_used')::numeric, 0))
       WHERE id = NULLIF(v_cons->>'item_id','')::uuid;
    END IF;
  END LOOP;

  RETURN v_new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION app_private.revise_invoice(uuid, jsonb) TO authenticated;