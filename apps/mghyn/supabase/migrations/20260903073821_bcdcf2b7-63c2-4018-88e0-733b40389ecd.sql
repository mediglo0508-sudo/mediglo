ALTER TABLE public.integration_outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS integration_outbox_claim_idx
  ON public.integration_outbox (next_attempt_at)
  WHERE delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_integration_outbox_batch(p_limit integer DEFAULT 100)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM public.integration_outbox o
    WHERE o.delivered_at IS NULL
      AND o.next_attempt_at <= now()
      AND (o.claimed_at IS NULL OR o.claimed_at < now() - interval '5 minutes')
    ORDER BY o.created_at ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.integration_outbox t
  SET claimed_at = now()
  FROM picked
  WHERE t.id = picked.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_integration_outbox_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_outbox_batch(integer) TO service_role;