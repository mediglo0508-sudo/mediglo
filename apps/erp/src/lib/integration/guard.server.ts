// Server-only bearer-token guard for the Tracker integration Data API.
import type { AccessTokenClaims } from "@/lib/oauth/crypto.server";
import { verifyAccessToken } from "@/lib/oauth/crypto.server";
import { clientIp, logAccess, rateLimit } from "@/lib/oauth/core.server";

export interface Authorized {
  claims: AccessTokenClaims;
  ip: string | null;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Verifies the access token and enforces the required scope. */
export async function authorize(
  request: Request,
  endpoint: string,
  requiredScope: string,
): Promise<Authorized | Response> {
  const ip = clientIp(request);
  const header = request.headers.get("authorization") ?? "";

  if (!header.startsWith("Bearer ")) {
    await logAccess({ endpoint, ip, ok: false, error: "missing bearer token" });
    return jsonResponse({ error: "invalid_token", error_description: "Bearer token required" }, 401);
  }

  const claims = await verifyAccessToken(header.slice(7).trim());
  if (!claims) {
    await logAccess({ endpoint, ip, ok: false, error: "invalid token" });
    return jsonResponse({ error: "invalid_token", error_description: "Token invalid or expired" }, 401);
  }

  if (!(await rateLimit(`api:${claims.client_id}:${claims.sub}`, 600, 60))) {
    return jsonResponse({ error: "rate_limited", error_description: "Too many requests" }, 429);
  }

  if (!claims.scopes?.includes(requiredScope)) {
    await logAccess({
      client_id: claims.client_id,
      user_id: claims.sub,
      endpoint,
      scopes: claims.scopes,
      ip,
      ok: false,
      error: `missing scope ${requiredScope}`,
    });
    return jsonResponse(
      { error: "insufficient_scope", error_description: `Scope ${requiredScope} is required` },
      403,
    );
  }

  await logAccess({
    client_id: claims.client_id,
    user_id: claims.sub,
    endpoint,
    scopes: claims.scopes,
    ip,
    ok: true,
  });
  return { claims, ip };
}

export function isResponse(v: Authorized | Response): v is Response {
  return v instanceof Response;
}

export function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

export function pagination(url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const since = url.searchParams.get("since");
  return { limit, offset, since: since && !Number.isNaN(Date.parse(since)) ? since : null };
}
