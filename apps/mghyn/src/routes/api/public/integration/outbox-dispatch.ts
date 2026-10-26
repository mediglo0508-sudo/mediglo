import { createFileRoute } from "@tanstack/react-router";

/**
 * Outbox worker trigger. Call on a schedule with the shared dispatch secret:
 *   POST /api/public/integration/outbox-dispatch
 *   x-dispatch-secret: <OUTBOX_DISPATCH_SECRET>
 */
export const Route = createFileRoute("/api/public/integration/outbox-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["OUTBOX_DISPATCH_SECRET"];
        const presented = request.headers.get("x-dispatch-secret") ?? "";

        if (!expected) {
          return new Response(JSON.stringify({ error: "dispatch secret not configured" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }

        // Constant-time comparison.
        let diff = presented.length ^ expected.length;
        for (let i = 0; i < Math.max(presented.length, expected.length); i++) {
          diff |= (presented.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
        }
        if (diff !== 0) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const { dispatchOutbox } = await import("@/lib/integration/outbox.server");
        try {
          const result = await dispatchOutbox();
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        } catch (e) {
          console.error("[outbox] dispatch failed", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "dispatch failed" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
