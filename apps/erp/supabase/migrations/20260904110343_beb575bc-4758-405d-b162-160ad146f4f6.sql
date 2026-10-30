CREATE UNIQUE INDEX IF NOT EXISTS cos_follow_ups_source_key_uidx
  ON public.cos_follow_ups (source_key) WHERE source_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.materialise_follow_ups()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inserted int := 0;
  v_updated  int := 0;
BEGIN
  CREATE TEMP TABLE _fu_candidates ON COMMIT DROP AS
  WITH inv AS (
    SELECT lower(btrim(customer_name)) AS k,
           min(btrim(customer_name))   AS nm,
           sum(coalesce(pending_balance, 0))::numeric AS pending,
           max(invoice_date::date)     AS last_d
    FROM public.invoices
    WHERE voided_at IS NULL AND coalesce(btrim(customer_name), '') <> ''
    GROUP BY 1
  ), vis AS (
    SELECT lower(btrim(customer_name)) AS k,
           min(btrim(customer_name))   AS nm,
           max(coalesce(treatment_ended_at::date, scheduled_for::date, created_at::date)) AS last_d,
           (array_agg(phone) FILTER (WHERE phone IS NOT NULL))[1] AS phone
    FROM public.patient_visits
    WHERE coalesce(btrim(customer_name), '') <> ''
    GROUP BY 1
  ), wal AS (
    SELECT lower(btrim(customer_name)) AS k,
           min(btrim(customer_name))   AS nm,
           sum(greatest(0, coalesce(total_sessions, 0) - coalesce(consumed_sessions, 0)))::int AS sessions,
           (array_agg(customer_phone) FILTER (WHERE customer_phone IS NOT NULL))[1] AS phone
    FROM public.service_wallets
    WHERE status = 'active' AND coalesce(btrim(customer_name), '') <> ''
    GROUP BY 1
  ), cust AS (
    SELECT lower(btrim(name)) AS k,
           (array_agg(id))[1] AS cid,
           (array_agg(phone) FILTER (WHERE phone IS NOT NULL))[1] AS phone,
           count(*) AS n
    FROM public.customers
    WHERE coalesce(btrim(name), '') <> ''
    GROUP BY 1
  ), sched AS (
    SELECT DISTINCT lower(btrim(c.name)) AS k
    FROM public.cos_appointments a
    JOIN public.customers c ON c.id = a.patient_id
    WHERE a.appointment_date >= current_date
      AND coalesce(lower(a.status), '') NOT LIKE '%cancel%'
  ), keys AS (
    SELECT k FROM inv UNION SELECT k FROM vis UNION SELECT k FROM wal
  )
  SELECT
    k.k AS key,
    coalesce(inv.nm, wal.nm, vis.nm) AS name,
    coalesce(cust.phone, vis.phone, wal.phone) AS phone,
    CASE WHEN cust.n = 1 THEN cust.cid END AS patient_id,
    coalesce(inv.pending, 0)::numeric AS pending,
    coalesce(wal.sessions, 0)::int AS sessions,
    greatest(inv.last_d, vis.last_d) AS last_d,
    (sched.k IS NOT NULL) AS scheduled
  FROM keys k
  LEFT JOIN inv  ON inv.k = k.k
  LEFT JOIN vis  ON vis.k = k.k
  LEFT JOIN wal  ON wal.k = k.k
  LEFT JOIN cust ON cust.k = k.k
  LEFT JOIN sched ON sched.k = k.k;

  CREATE TEMP TABLE _fu_final ON COMMIT DROP AS
  SELECT
    c.*,
    CASE WHEN c.pending > 0.5 THEN 'collection' ELSE 'sessions' END AS kind,
    CASE WHEN c.last_d IS NOT NULL THEN greatest(0, (current_date - c.last_d)) END AS gap
  FROM _fu_candidates c
  WHERE c.pending > 0.5 OR c.sessions > 0;

  WITH prepared AS (
    SELECT
      'auto:' || f.kind || ':' || f.key AS source_key,
      f.name, f.phone, f.patient_id, f.kind,
      array_to_string(
        array_remove(ARRAY[
          CASE WHEN f.pending > 0.5 THEN 'Outstanding balance' END,
          CASE WHEN f.sessions > 0 THEN f.sessions || ' session' || CASE WHEN f.sessions = 1 THEN '' ELSE 's' END || ' unused' END,
          CASE WHEN f.gap IS NOT NULL AND f.gap > 14 AND NOT f.scheduled THEN 'No visit in ' || f.gap || ' days' END
        ], NULL), ' · ') AS reason,
      CASE WHEN f.kind = 'collection' THEN 'Pending Collection' ELSE 'Package / Service Due' END AS bucket,
      CASE WHEN f.gap IS NULL THEN 0 WHEN f.gap > 42 THEN 3 WHEN f.gap > 28 THEN 2 WHEN f.gap > 14 THEN 1 ELSE 0 END AS gap_stage,
      'Pending ₹' || round(f.pending, 2) || ' · ' || f.sessions || ' unused session(s)'
        || coalesce(' · last activity ' || f.last_d, '') AS notes
    FROM _fu_final f
  ), ins AS (
    INSERT INTO public.cos_follow_ups
      (patient_id, patient_name, patient_phone, trigger_reason, bucket, gap_stage, notes, kind, status, next_followup_at, source_key)
    SELECT p.patient_id, p.name, p.phone, p.reason, p.bucket, p.gap_stage, p.notes, p.kind, 'open', now(), p.source_key
    FROM prepared p
    ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  WITH prepared AS (
    SELECT
      'auto:' || f.kind || ':' || f.key AS source_key,
      f.name, f.phone, f.patient_id, f.kind,
      array_to_string(
        array_remove(ARRAY[
          CASE WHEN f.pending > 0.5 THEN 'Outstanding balance' END,
          CASE WHEN f.sessions > 0 THEN f.sessions || ' session' || CASE WHEN f.sessions = 1 THEN '' ELSE 's' END || ' unused' END,
          CASE WHEN f.gap IS NOT NULL AND f.gap > 14 AND NOT f.scheduled THEN 'No visit in ' || f.gap || ' days' END
        ], NULL), ' · ') AS reason,
      CASE WHEN f.kind = 'collection' THEN 'Pending Collection' ELSE 'Package / Service Due' END AS bucket,
      CASE WHEN f.gap IS NULL THEN 0 WHEN f.gap > 42 THEN 3 WHEN f.gap > 28 THEN 2 WHEN f.gap > 14 THEN 1 ELSE 0 END AS gap_stage,
      'Pending ₹' || round(f.pending, 2) || ' · ' || f.sessions || ' unused session(s)'
        || coalesce(' · last activity ' || f.last_d, '') AS notes
    FROM _fu_final f
  ), upd AS (
    UPDATE public.cos_follow_ups t
    SET trigger_reason   = p.reason,
        notes            = p.notes,
        bucket           = p.bucket,
        gap_stage        = p.gap_stage,
        patient_id       = coalesce(p.patient_id, t.patient_id),
        patient_phone    = coalesce(p.phone, t.patient_phone),
        next_followup_at = coalesce(t.next_followup_at, now()),
        updated_at       = now()
    FROM prepared p
    WHERE t.source_key = p.source_key
      AND t.created_at < now() - interval '1 second'
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$fn$;

REVOKE ALL ON FUNCTION public.materialise_follow_ups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialise_follow_ups() TO service_role;