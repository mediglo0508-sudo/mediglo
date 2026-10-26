import { createFileRoute } from "@tanstack/react-router";

/** Public verification key so Tracker can verify Harmony access tokens offline. */
export const Route = createFileRoute("/api/public/oauth/jwks")({
  server: {
    handlers: {
      GET: async () => {
        const { jwks } = await import("@/lib/oauth/crypto.server");
        return new Response(JSON.stringify(jwks()), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
