import { createFileRoute } from "@tanstack/react-router";

/** READ-ONLY. There is deliberately no write path for invoices. */
export const Route = createFileRoute("/api/public/integration/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:invoices:read", "invoices:read");
        if (g.isResponse(auth)) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const customerId = url.searchParams.get("customer_id");
        if (!customerId) {
          return g.jsonResponse(
            { error: "invalid_request", error_description: "customer_id is required" },
            400,
          );
        }
        const { limit, offset, since } = g.pagination(url);

        let query = supabaseAdmin
          .from("invoices")
          .select(
            "id, invoice_no, customer_id, customer_name, invoice_date, payment_mode, base_amount, cgst, sgst, discount_amount, gross_total, paid_amount, pending_balance, source, voided_at, created_at, updated_at",
            { count: "exact" },
          )
          .eq("customer_id", customerId)
          .order("invoice_date", { ascending: false })
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
