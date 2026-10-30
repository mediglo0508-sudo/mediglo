
CREATE OR REPLACE FUNCTION app_private.revise_invoice(old_id uuid, payload jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_old public.invoices%ROWTYPE;
  v_new_id uuid; v_new_no text;
  v_line jsonb; v_new_line_id uuid; v_line_index integer := 0;
  v_line_ids uuid[] := ARRAY[]::uuid[];
  v_cons jsonb;
  v_freeze date := '2026-06-04'::date;
  v_pkg_id uuid;
  v_gross numeric; v_disc numeric; v_net numeric; v_rate numeric;
  v_base numeric; v_tax numeric; v_half numeric;
  v_linked integer; v_dupes integer;
  v_json jsonb[] := ARRAY[]::jsonb[];
  v_tot numeric[] := ARRAY[]::numeric[];
  v_rates numeric[] := ARRAY[]::numeric[];
  v_discs numeric[] := ARRAY[]::numeric[];
  v_elig boolean[] := ARRAY[]::boolean[];
  v_alloc numeric[] := ARRAY[]::numeric[];
  v_bill_disc numeric; v_elig_sum numeric := 0; v_alloc_sum numeric := 0;
  v_big integer := 0; v_i integer; v_n integer; v_cat text;
  v_wallet_prev jsonb := '{}'::jsonb;
  v_new_date date;
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

  v_new_date := COALESCE((NULLIF(payload->>'invoice_date',''))::date, CURRENT_DATE);

  -- 1) FULL, AUDITED REVERSAL of everything the old bill took out of stock
  IF v_old.invoice_date >= v_freeze THEN
    PERFORM app_private.restock_inventory(
      app_private.invoice_stock_items(old_id), 'Bill Revised', 'Invoice Edit',
      'Stock returned while editing ' || COALESCE(v_old.invoice_no, old_id::text));
  END IF;

  FOR v_pkg_id IN
    SELECT package_id FROM public.invoice_lines WHERE invoice_id = old_id AND package_id IS NOT NULL
  LOOP
    UPDATE public.treatment_packages
       SET sessions_completed = GREATEST(0, COALESCE(sessions_completed,0) - 1)
     WHERE id = v_pkg_id;
  END LOOP;

  -- keep already-consumed wallet sessions across the edit
  SELECT COALESCE(jsonb_object_agg(lower(service_name), consumed), '{}'::jsonb)
    INTO v_wallet_prev
    FROM (SELECT service_name, max(consumed_sessions) consumed
            FROM public.service_wallets WHERE invoice_id = old_id
           GROUP BY service_name) w;

  DELETE FROM public.service_wallets WHERE invoice_id = old_id;

  SELECT count(*) INTO v_linked FROM public.vouchers WHERE invoice_id = old_id;
  IF v_linked = 0 THEN
    SELECT count(*) INTO v_dupes FROM public.invoices WHERE invoice_no = v_old.invoice_no;
    IF v_dupes > 1 THEN
      RAISE EXCEPTION 'Cannot revise invoice %: its invoice number is duplicated in historical data and its accounting entries cannot be identified safely. Please contact the administrator.', v_old.invoice_no;
    END IF;
  END IF;
  DELETE FROM public.vouchers WHERE invoice_id = old_id;

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
    v_new_date,
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

  -- PASS 1: line maths + bill-discount apportionment
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'lines','[]'::jsonb))
  LOOP
    v_gross := COALESCE((v_line->>'qty')::numeric, 1) * COALESCE((v_line->>'unit_price')::numeric, 0);
    IF COALESCE(v_line->>'discount_type','amount') = 'percent' THEN
      v_disc := round(v_gross * COALESCE((v_line->>'discount_value')::numeric, 0) / 100, 2);
    ELSE
      v_disc := round(COALESCE((v_line->>'discount_value')::numeric, 0), 2);
    END IF;
    v_disc := LEAST(GREATEST(v_disc, 0), round(v_gross, 2));
    v_net  := round(v_gross - v_disc, 2);
    v_rate := COALESCE((v_line->>'gst_rate')::numeric, 5);

    IF v_rate > 0 AND COALESCE(payload->>'tax_mode','inclusive') = 'exclusive' THEN
      v_net := round(v_net * (1 + v_rate/100), 2);
    END IF;

    v_cat := CASE WHEN COALESCE(v_line->>'item_category','') IN ('product','service','consultation')
                  THEN v_line->>'item_category' ELSE 'service' END;

    v_json  := v_json  || v_line;
    v_tot   := v_tot   || v_net;
    v_rates := v_rates || v_rate;
    v_discs := v_discs || v_disc;
    v_elig  := v_elig  || (v_cat <> 'consultation');
    v_alloc := v_alloc || 0::numeric;
  END LOOP;

  v_n := COALESCE(array_length(v_tot, 1), 0);
  v_bill_disc := GREATEST(COALESCE((payload->>'discount_amount')::numeric, 0), 0);

  IF v_n > 0 AND v_bill_disc > 0 THEN
    FOR v_i IN 1..v_n LOOP
      IF v_elig[v_i] THEN
        v_elig_sum := v_elig_sum + v_tot[v_i];
        IF v_big = 0 OR v_tot[v_i] > v_tot[v_big] THEN v_big := v_i; END IF;
      END IF;
    END LOOP;
    v_bill_disc := LEAST(v_bill_disc, round(v_elig_sum, 2));
    IF v_elig_sum > 0 THEN
      FOR v_i IN 1..v_n LOOP
        IF v_elig[v_i] THEN
          v_alloc[v_i] := round(v_bill_disc * v_tot[v_i] / v_elig_sum, 2);
          v_alloc_sum := v_alloc_sum + v_alloc[v_i];
        END IF;
      END LOOP;
      v_alloc[v_big] := round(v_alloc[v_big] + (v_bill_disc - v_alloc_sum), 2);
    END IF;
  END IF;

  -- PASS 2: write lines
  FOR v_i IN 1..v_n LOOP
    v_line := v_json[v_i];
    v_rate := v_rates[v_i];
    v_net  := GREATEST(round(v_tot[v_i] - v_alloc[v_i], 2), 0);

    IF v_rate <= 0 THEN
      v_base := v_net; v_tax := 0;
    ELSE
      v_base := round(v_net / (1 + v_rate/100), 2);
      v_tax  := round(v_net - v_base, 2);
    END IF;
    v_half := round(v_tax / 2, 2);

    INSERT INTO public.invoice_lines (
      invoice_id, description, sac_code, qty, unit_price,
      discount_type, discount_value, discount_amount,
      base_amount, cgst, sgst, round_off, line_total, session_label, package_id,
      is_complimentary, item_category
    ) VALUES (
      v_new_id, v_line->>'description', NULLIF(v_line->>'sac_code',''),
      COALESCE((v_line->>'qty')::numeric, 1), COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE(NULLIF(v_line->>'discount_type',''), 'amount'),
      COALESCE((v_line->>'discount_value')::numeric, 0),
      round(v_discs[v_i] + v_alloc[v_i], 2),
      v_base, v_half, v_half, round(v_tax - 2*v_half, 2), v_net,
      NULLIF(v_line->>'session_label',''), NULLIF(v_line->>'package_id','')::uuid,
      COALESCE((v_line->>'is_complimentary')::boolean, false),
      CASE WHEN COALESCE(v_line->>'item_category','') IN ('product','service','consultation')
           THEN v_line->>'item_category' ELSE 'service' END
    )
    RETURNING id INTO v_new_line_id;
    v_line_ids := v_line_ids || v_new_line_id;

    IF (v_line->>'package_id') IS NOT NULL AND (v_line->>'package_id') <> '' THEN
      UPDATE public.treatment_packages
         SET sessions_completed = LEAST(COALESCE(total_sessions,0), COALESCE(sessions_completed,0) + 1)
       WHERE id = (v_line->>'package_id')::uuid;
    END IF;
  END LOOP;

  IF v_n > 0 THEN
    UPDATE public.invoices i
       SET base_amount = agg.b, cgst = agg.c, sgst = agg.c,
           round_off = round(agg.g - agg.b - 2*agg.c, 2),
           gross_total = agg.g,
           paid_amount = LEAST(i.paid_amount, agg.g),
           pending_balance = GREATEST(round(agg.g - LEAST(i.paid_amount, agg.g), 2), 0)
      FROM (
        SELECT round(sum(base_amount),2) b, round(sum(cgst),2) c, round(sum(line_total),2) g
          FROM public.invoice_lines WHERE invoice_id = v_new_id
      ) agg
     WHERE i.id = v_new_id;
  END IF;

  -- carry over previously consumed wallet sessions
  UPDATE public.service_wallets w
     SET consumed_sessions = LEAST(w.total_sessions,
           GREATEST(w.consumed_sessions, COALESCE((v_wallet_prev->>lower(w.service_name))::int, 0))),
         status = CASE WHEN LEAST(w.total_sessions,
           GREATEST(w.consumed_sessions, COALESCE((v_wallet_prev->>lower(w.service_name))::int, 0))) >= w.total_sessions
           THEN 'completed' ELSE 'active' END
   WHERE w.invoice_id = v_new_id;

  -- consumption rows for the new bill (stock applied once, below)
  FOR v_cons IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'consumption','[]'::jsonb))
  LOOP
    v_line_index := COALESCE((v_cons->>'line_index')::int, 0);
    INSERT INTO public.service_consumption (
      invoice_id, invoice_line_id, service_name, item_id, item_name, qty_used, unit_cost, total_cost
    ) VALUES (
      v_new_id, v_line_ids[v_line_index + 1], v_cons->>'service_name',
      NULLIF(v_cons->>'item_id','')::uuid, v_cons->>'item_name',
      COALESCE((v_cons->>'qty_used')::numeric, 0),
      COALESCE((v_cons->>'unit_cost')::numeric, 0),
      COALESCE((v_cons->>'total_cost')::numeric, 0)
    );
  END LOOP;

  -- 2) SINGLE, AUDITED DEDUCTION for the revised bill (products + consumables)
  IF v_new_date >= v_freeze THEN
    PERFORM app_private.deduct_inventory_stock(
      app_private.invoice_stock_items(v_new_id), 'Bill Revised', 'Invoice Edit',
      'Stock applied for revised bill ' || COALESCE(v_new_no, v_new_id::text));
  END IF;

  RETURN v_new_id;
END;
$function$;
REVOKE ALL ON FUNCTION app_private.revise_invoice(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.revise_invoice(uuid, jsonb) TO authenticated, service_role;
