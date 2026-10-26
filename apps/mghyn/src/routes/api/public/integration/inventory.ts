import { createFileRoute } from "@tanstack/react-router";

/** READ-ONLY stock view. No write path exists for inventory. */
export const Route = createFileRoute("/api/public/integration/inventory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:inventory:read", "inventory:read");
        if (g.isResponse(auth)) return auth;
        void auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const { limit, offset, since } = g.pagination(url);

        let query = supabaseAdmin
          .from("inventory")
          .select("id, name, sku, category, sub_category, brand, company, stock, rate, active, updated_at", {
            count: "exact",
          })
          .eq("active", true)
          .order("updated_at", { ascending: true })
          .range(offset, offset + limit - 1);
        if (since) query = query.gt("updated_at", since);

        const { data, count, error } = await query;
        if (error) return g.jsonResponse({ error: "query_failed", error_description: error.message }, 500);

        return g.jsonResponse({
          items: data ?? [],
          limit,
          offset,
          total: count ?? 0,
          next_offset: (data?.length ?? 0) === limit ? offset + limit : null,
        });
      },
    },
  },
});
