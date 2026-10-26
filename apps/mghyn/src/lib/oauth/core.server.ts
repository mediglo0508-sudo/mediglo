// Server-only OAuth 2.0 authorization-server core for Harmony.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  randomToken,
  sha256b64url,
  signAccessToken,
  verifyClientSecret,
} from "./crypto.server";

export const ALL_SCOPES = [
  "patients:read",
  "patients:write",
  "appointments:read",
  "appointments:write",
  "followups:write",
  "invoices:read",
  "dues:read",
  "inventory:read",
] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export const SCOPE_LABELS: Record<string, string> = {
  "patients:read": "Read patient / customer records",
  "patients:write": "Create and update patient records",
  "appointments:read": "Read appointments",
  "appointments:write": "Create and update appointments",
  "followups:write": "Create follow-up tasks",
  "invoices:read": "Read invoices (finance)",
  "dues:read": "Read outstanding dues (finance)",
  "inventory:read": "Read stock levels",
};

export const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days
export const CODE_TTL_SECONDS = 60;

export interface OAuthClientRow {
  id: string;
  client_id: string;
  client_secret_hash: string;
  name: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  active: boolean;
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

export async function logAccess(entry: {
  client_id?: string | null;
  user_id?: string | null;
  endpoint: string;
  scopes?: string[] | null;
  ip?: string | null;
  ok: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("oauth_access_log").insert({
      client_id: entry.client_id ?? null,
      user_id: entry.user_id ?? null,
      endpoint: entry.endpoint,
      scopes: entry.scopes ?? null,
      ip: entry.ip ?? null,
      ok: entry.ok,
      error: entry.error ?? null,
    });
  } catch {
    /* logging must never break the flow */
  }
}

/** Attributable audit trail entry — keeps Tracker actions tied to the staff member. */
export async function auditIntegration(entry: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  newValue?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    let userName: string | null = null;
    let userRole: string | null = null;
    if (entry.userId) {
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabaseAdmin.from("profiles").select("full_name").eq("id", entry.userId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", entry.userId),
      ]);
      userName = prof?.full_name ?? null;
      userRole = (roles ?? []).map((r) => r.role as string).join(",") || null;
    }
    await supabaseAdmin.from("audit_log").insert({
      user_id: entry.userId,
      user_name: userName,
      user_role: userRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      new_value: (entry.newValue ?? null) as never,
      ip_address: entry.ip ?? null,
    });
  } catch {
    /* auditing must never break the request */
  }
}

/** Fixed-window rate limiter backed by oauth_rate_limits. Returns true when allowed. */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const { data } = await supabaseAdmin
    .from("oauth_rate_limits")
    .select("bucket, window_start, hits")
    .eq("bucket", bucket)
    .maybeSingle();

  const windowStart = data ? new Date(data.window_start).getTime() : 0;
  const expired = !data || now - windowStart > windowSeconds * 1000;
  const hits = expired ? 1 : data!.hits + 1;

  await supabaseAdmin.from("oauth_rate_limits").upsert(
    {
      bucket,
      hits,
      window_start: expired ? new Date(now).toISOString() : new Date(windowStart).toISOString(),
    },
    { onConflict: "bucket" },
  );

  return hits <= limit;
}

export async function loadClient(clientId: string): Promise<OAuthClientRow | null> {
  const { data } = await supabaseAdmin
    .from("oauth_clients")
    .select("id, client_id, client_secret_hash, name, redirect_uris, allowed_scopes, active")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as OAuthClientRow | null) ?? null;
}

export async function authenticateClient(
  clientId: string,
  clientSecret: string,
): Promise<OAuthClientRow | null> {
  const client = await loadClient(clientId);
  if (!client || !client.active) return null;
  const ok = await verifyClientSecret(clientSecret, client.client_secret_hash);
  return ok ? client : null;
}

/** Scopes the signed-in Harmony user's own role already permits. */
export async function userScopes(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("oauth_user_scopes" as never, {
    _uid: userId,
  } as never);
  if (error || !data) return [];
  return data as unknown as string[];
}

/** Effective grant = requested ∩ client allowed ∩ user role permissions. */
export function intersectScopes(
  requested: string[],
  clientAllowed: string[],
  userAllowed: string[],
): string[] {
  const known = new Set<string>(ALL_SCOPES);
  return requested.filter(
    (s) => known.has(s) && clientAllowed.includes(s) && userAllowed.includes(s),
  );
}

export function parseScopeParam(raw: string | null): string[] {
  return (raw ?? "").split(/[\s+]+/).map((s) => s.trim()).filter(Boolean);
}

// ---------------- tokens ----------------

export async function issueAuthorizationCode(args: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string[];
}): Promise<string> {
  const code = randomToken(32);
  const { error } = await supabaseAdmin.from("oauth_authorization_codes").insert({
    code_hash: await sha256b64url(code),
    client_id: args.clientId,
    user_id: args.userId,
    redirect_uri: args.redirectUri,
    code_challenge: args.codeChallenge,
    code_challenge_method: args.codeChallengeMethod,
    scopes: args.scopes,
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw error;
  return code;
}

export interface UserIdentity {
  email: string | null;
  fullName: string | null;
  staffId: string | null;
  roles: string[];
}

export async function loadIdentity(userId: string): Promise<UserIdentity> {
  const [{ data: profile }, { data: staff }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("staff").select("id, email").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return {
    email: staff?.email ?? null,
    fullName: profile?.full_name ?? null,
    staffId: staff?.id ?? null,
    roles: (roles ?? []).map((r) => r.role as string),
  };
}

export async function mintTokenPair(args: {
  clientId: string;
  userId: string;
  scopes: string[];
  chainId?: string;
  rotatedFrom?: string | null;
}) {
  const identity = await loadIdentity(args.userId);
  const { token: accessToken, expiresIn } = await signAccessToken({
    sub: args.userId,
    email: identity.email,
    client_id: args.clientId,
    scopes: args.scopes,
    staff_id: identity.staffId,
    role: identity.roles,
    ttlSeconds: ACCESS_TOKEN_TTL,
  });

  const refreshToken = randomToken(32);
  const chainId = args.chainId ?? crypto.randomUUID();
  const { error } = await supabaseAdmin.from("oauth_refresh_tokens").insert({
    token_hash: await sha256b64url(refreshToken),
    client_id: args.clientId,
    user_id: args.userId,
    scopes: args.scopes,
    chain_id: chainId,
    rotated_from: args.rotatedFrom ?? null,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000).toISOString(),
  });
  if (error) throw error;

  await supabaseAdmin
    .from("oauth_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("client_id", args.clientId);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: args.scopes.join(" "),
  };
}

/** Revokes an entire rotation chain — used when a rotated token is replayed. */
export async function revokeChain(chainId: string) {
  await supabaseAdmin
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("chain_id", chainId)
    .is("revoked_at", null);
}

export function oauthError(error: string, description: string, status = 400) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
