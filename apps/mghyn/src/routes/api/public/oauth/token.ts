import { createFileRoute } from "@tanstack/react-router";

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const core = await import("@/lib/oauth/core.server");
        const cryptoMod = await import("@/lib/oauth/crypto.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const ip = core.clientIp(request);
        const fail = async (code: string, desc: string, status = 400, clientId?: string | null) => {
          await core.logAccess({
            client_id: clientId ?? null,
            endpoint: "token",
            ip,
            ok: false,
            error: `${code}: ${desc}`,
          });
          return core.oauthError(code, desc, status);
        };

        if (!(await core.rateLimit(`token:${ip ?? "unknown"}`, 60, 60))) {
          return fail("slow_down", "Too many token requests", 429);
        }

        let form: URLSearchParams;
        try {
          form = new URLSearchParams(await request.text());
        } catch {
          return fail("invalid_request", "Body must be form-encoded");
        }

        // Client authentication: HTTP Basic or form parameters.
        let clientId = form.get("client_id") ?? "";
        let clientSecret = form.get("client_secret") ?? "";
        const basic = request.headers.get("authorization");
        if (basic?.startsWith("Basic ")) {
          try {
            const [id, secret] = atob(basic.slice(6)).split(":");
            clientId = decodeURIComponent(id ?? "");
            clientSecret = decodeURIComponent(secret ?? "");
          } catch {
            return fail("invalid_client", "Malformed Basic credentials", 401);
          }
        }
        if (!clientId || !clientSecret) {
          return fail("invalid_client", "Client credentials are required", 401, clientId);
        }
        if (!(await core.rateLimit(`token:client:${clientId}`, 300, 60))) {
          return fail("slow_down", "Too many token requests", 429, clientId);
        }

        const client = await core.authenticateClient(clientId, clientSecret);
        if (!client) return fail("invalid_client", "Client authentication failed", 401, clientId);

        const grantType = form.get("grant_type");

        // ---------- authorization_code ----------
        if (grantType === "authorization_code") {
          const code = form.get("code") ?? "";
          const redirectUri = form.get("redirect_uri") ?? "";
          const verifier = form.get("code_verifier") ?? "";
          if (!code || !redirectUri || !verifier) {
            return fail("invalid_request", "code, redirect_uri and code_verifier are required", 400, clientId);
          }

          const codeHash = await cryptoMod.sha256b64url(code);
          const { data: row } = await supabaseAdmin
            .from("oauth_authorization_codes")
            .select("*")
            .eq("code_hash", codeHash)
            .maybeSingle();

          if (!row || row.client_id !== clientId) {
            return fail("invalid_grant", "Unknown authorization code", 400, clientId);
          }
          if (row.consumed_at) {
            return fail("invalid_grant", "Authorization code already used", 400, clientId);
          }
          if (new Date(row.expires_at).getTime() < Date.now()) {
            return fail("invalid_grant", "Authorization code expired", 400, clientId);
          }
          if (row.redirect_uri !== redirectUri) {
            return fail("invalid_grant", "redirect_uri mismatch", 400, clientId);
          }
          if (!(await cryptoMod.verifyPkce(verifier, row.code_challenge, row.code_challenge_method))) {
            return fail("invalid_grant", "PKCE verification failed", 400, clientId);
          }

          // Single use — consume atomically.
          const { data: consumed } = await supabaseAdmin
            .from("oauth_authorization_codes")
            .update({ consumed_at: new Date().toISOString() })
            .eq("id", row.id)
            .is("consumed_at", null)
            .select("id");
          if (!consumed?.length) {
            return fail("invalid_grant", "Authorization code already used", 400, clientId);
          }

          // Re-intersect against live role permissions at exchange time.
          const live = await core.userScopes(row.user_id);
          const scopes = core.intersectScopes(row.scopes ?? [], client.allowed_scopes, live);
          const tokens = await core.mintTokenPair({
            clientId,
            userId: row.user_id,
            scopes,
          });

          await core.logAccess({
            client_id: clientId,
            user_id: row.user_id,
            endpoint: "token:authorization_code",
            scopes,
            ip,
            ok: true,
          });
          await core.auditIntegration({
            userId: row.user_id,
            action: "OAUTH_TOKEN_ISSUED",
            entityType: "oauth_clients",
            entityId: clientId,
            newValue: { grant: "authorization_code", scopes },
            ip,
          });
          return new Response(JSON.stringify(tokens), { headers: JSON_HEADERS });
        }

        // ---------- refresh_token ----------
        if (grantType === "refresh_token") {
          const presented = form.get("refresh_token") ?? "";
          if (!presented) return fail("invalid_request", "refresh_token is required", 400, clientId);

          const hash = await cryptoMod.sha256b64url(presented);
          const { data: row } = await supabaseAdmin
            .from("oauth_refresh_tokens")
            .select("*")
            .eq("token_hash", hash)
            .maybeSingle();

          if (!row || row.client_id !== clientId) {
            return fail("invalid_grant", "Unknown refresh token", 400, clientId);
          }
          if (row.revoked_at) {
            return fail("invalid_grant", "Refresh token revoked", 400, clientId);
          }
          if (row.used_at) {
            // Replay of a rotated token — burn the whole chain.
            await core.revokeChain(row.chain_id);
            await core.logAccess({
              client_id: clientId,
              user_id: row.user_id,
              endpoint: "token:refresh_token",
              ip,
              ok: false,
              error: "refresh token reuse detected — chain revoked",
            });
            return core.oauthError("invalid_grant", "Refresh token reuse detected", 400);
          }
          if (new Date(row.expires_at).getTime() < Date.now()) {
            return fail("invalid_grant", "Refresh token expired", 400, clientId);
          }

          const { data: claimed } = await supabaseAdmin
            .from("oauth_refresh_tokens")
            .update({ used_at: new Date().toISOString() })
            .eq("id", row.id)
            .is("used_at", null)
            .select("id");
          if (!claimed?.length) {
            await core.revokeChain(row.chain_id);
            return core.oauthError("invalid_grant", "Refresh token reuse detected", 400);
          }

          const live = await core.userScopes(row.user_id);
          const scopes = core.intersectScopes(row.scopes ?? [], client.allowed_scopes, live);
          const tokens = await core.mintTokenPair({
            clientId,
            userId: row.user_id,
            scopes,
            chainId: row.chain_id,
            rotatedFrom: row.id,
          });

          await core.logAccess({
            client_id: clientId,
            user_id: row.user_id,
            endpoint: "token:refresh_token",
            scopes,
            ip,
            ok: true,
          });
          return new Response(JSON.stringify(tokens), { headers: JSON_HEADERS });
        }

        return fail("unsupported_grant_type", `Unsupported grant_type: ${grantType}`, 400, clientId);
      },

      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "authorization, content-type",
          },
        }),
    },
  },
});
