
-- ============ OAuth 2.0 authorization server (additive) ============

CREATE TABLE public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  name text NOT NULL,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  allowed_scopes text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  last_used_at timestamptz
);
GRANT SELECT ON public.oauth_clients TO authenticated;
GRANT ALL ON public.oauth_clients TO service_role;
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_clients admin read" ON public.oauth_clients FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_authorization_codes TO service_role;
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  rotated_from uuid REFERENCES public.oauth_refresh_tokens(id) ON DELETE SET NULL,
  chain_id uuid NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth_refresh_chain ON public.oauth_refresh_tokens (chain_id);
GRANT ALL ON public.oauth_refresh_tokens TO service_role;
ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (client_id, user_id)
);
GRANT SELECT ON public.oauth_consents TO authenticated;
GRANT ALL ON public.oauth_consents TO service_role;
ALTER TABLE public.oauth_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_consents own or admin read" ON public.oauth_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.oauth_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text,
  user_id uuid,
  endpoint text NOT NULL,
  scopes text[],
  ip text,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth_access_log_created ON public.oauth_access_log (created_at DESC);
GRANT SELECT ON public.oauth_access_log TO authenticated;
GRANT ALL ON public.oauth_access_log TO service_role;
ALTER TABLE public.oauth_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_access_log admin read" ON public.oauth_access_log FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.oauth_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.oauth_rate_limits TO service_role;
ALTER TABLE public.oauth_rate_limits ENABLE ROW LEVEL SECURITY;

-- ============ Scope map derived from the EXISTING role model ============
CREATE OR REPLACE FUNCTION app_private.oauth_user_scopes(_uid uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT array_remove(ARRAY[
    -- general ERP reads: any staff member holding any Harmony role
    CASE WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid) THEN 'patients:read' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid) THEN 'appointments:read' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid) THEN 'inventory:read' END,
    -- operational writes
    CASE WHEN EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid AND r.role IN (
        'admin','doctor','reception','counselor','counselor_1','counselor_2',
        'marketing','marketing_admin','marketing_head','caller','therapist')
    ) THEN 'patients:write' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid AND r.role IN (
        'admin','doctor','reception','counselor','counselor_1','counselor_2',
        'marketing','marketing_admin','marketing_head','caller','therapist')
    ) THEN 'appointments:write' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid AND r.role IN (
        'admin','doctor','reception','counselor','counselor_1','counselor_2',
        'marketing','marketing_admin','marketing_head','caller')
    ) THEN 'followups:write' END,
    -- finance: mirrors today's public.invoices read access exactly
    CASE WHEN app_private.is_finance(_uid)
           OR app_private.has_role(_uid, 'reception'::public.app_role)
           OR app_private.has_role(_uid, 'counselor'::public.app_role)
           OR app_private.is_pharmacist(_uid)
         THEN 'invoices:read' END,
    CASE WHEN app_private.is_finance(_uid)
           OR app_private.has_role(_uid, 'reception'::public.app_role)
           OR app_private.has_role(_uid, 'counselor'::public.app_role)
           OR app_private.is_pharmacist(_uid)
         THEN 'dues:read' END
  ], NULL)
$$;
REVOKE ALL ON FUNCTION app_private.oauth_user_scopes(uuid) FROM PUBLIC;

-- ============ Outbound change feed ============
CREATE TABLE public.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_integration_outbox_pending
  ON public.integration_outbox (next_attempt_at) WHERE delivered_at IS NULL;
GRANT SELECT ON public.integration_outbox TO authenticated;
GRANT ALL ON public.integration_outbox TO service_role;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_outbox admin read" ON public.integration_outbox FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.integration_outbox_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_outbox_dead_letter TO authenticated;
GRANT ALL ON public.integration_outbox_dead_letter TO service_role;
ALTER TABLE public.integration_outbox_dead_letter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_dlq admin read" ON public.integration_outbox_dead_letter FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION app_private.integration_outbox_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.integration_outbox (entity_type, entity_id, event_type, payload)
  VALUES (
    TG_TABLE_NAME,
    (NEW).id::text,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END $$;

CREATE TRIGGER zzz_integration_outbox_customers
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION app_private.integration_outbox_capture();

CREATE TRIGGER zzz_integration_outbox_appointments
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION app_private.integration_outbox_capture();
