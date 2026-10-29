import { createFileRoute } from "@tanstack/react-router";

/**
 * Rebuilds the auto follow-up queue server-side (marketing staff have no
 * access to invoices / wallets, so this must not run in the browser).
 *
 *   POST|GET /api/public/integration/materialise-follow-ups
 *   x-cron-secret: <CRON_SECRET>
 */
async function run(request: Request) {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  const denied = authenticateCronRequest(request);
  if (denied) return denied;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("materialise_follow_ups" as never);

  if (error) {
    console.error("[follow-ups] materialise failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const result = (data ?? {}) as { inserted?: number; updated?: number };
  return new Response(
    JSON.stringify({ inserted: result.inserted ?? 0, updated: result.updated ?? 0 }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/public/integration/materialise-follow-ups")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
