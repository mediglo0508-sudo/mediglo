import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/userinfo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const core = await import("@/lib/oauth/core.server");
        const { verifyAccessToken } = await import("@/lib/oauth/crypto.server");
        const ip = core.clientIp(request);

        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          await core.logAccess({ endpoint: "userinfo", ip, ok: false, error: "missing bearer" });
          return core.oauthError("invalid_token", "Bearer access token required", 401);
        }

        const claims = await verifyAccessToken(auth.slice(7).trim());
        if (!claims) {
          await core.logAccess({ endpoint: "userinfo", ip, ok: false, error: "invalid token" });
          return core.oauthError("invalid_token", "Access token is invalid or expired", 401);
        }

        const identity = await core.loadIdentity(claims.sub);
        await core.logAccess({
          client_id: claims.client_id,
          user_id: claims.sub,
          endpoint: "userinfo",
          scopes: claims.scopes,
          ip,
          ok: true,
        });

        return new Response(
          JSON.stringify({
            sub: claims.sub,
            email: identity.email,
            name: identity.fullName,
            full_name: identity.fullName,
            staff_id: identity.staffId,
            roles: identity.roles,
            scopes: claims.scopes,
            client_id: claims.client_id,
          }),
          { headers: { "content-type": "application/json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
