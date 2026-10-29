import { createFileRoute } from "@tanstack/react-router";

/** OAuth 2.0 authorization server metadata for the Harmony-issued tokens. */
export const Route = createFileRoute("/api/public/oauth/metadata")({
  server: {
    handlers: {
      GET: async () => {
        const { issuer } = await import("@/lib/oauth/crypto.server");
        const { ALL_SCOPES } = await import("@/lib/oauth/core.server");
        const base = issuer();
        return new Response(
          JSON.stringify({
            issuer: base,
            authorization_endpoint: `${base}/oauth/authorize`,
            token_endpoint: `${base}/api/public/oauth/token`,
            userinfo_endpoint: `${base}/api/public/oauth/userinfo`,
            jwks_uri: `${base}/api/public/oauth/jwks`,
            scopes_supported: ALL_SCOPES,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
            id_token_signing_alg_values_supported: ["ES256"],
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "public, max-age=300",
              "access-control-allow-origin": "*",
            },
          },
        );
      },
    },
  },
});
