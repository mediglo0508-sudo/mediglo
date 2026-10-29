import { createFileRoute } from "@tanstack/react-router";

/** READ-ONLY outstanding dues for a customer. */
export const Route = createFileRoute("/api/public/integration/dues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:dues:read", "dues:read");
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

        const [{ data: customer }, { data: open, error }] = await Promise.all([
          supabaseAdmin
            .from("customers")
            .select("id, name, phone, outstanding_balance")
            .eq("id", customerId)
            .maybeSingle(),
          supabaseAdmin
            .from("invoices")
            .select("id, invoice_no, invoice_date, gross_total, paid_amount, pending_balance")
            .eq("customer_id", customerId)
            .is("voided_at", null)
            .gt("pending_balance", 0)
            .order("invoice_date", { ascending: true }),
        ]);

        if (error) return g.jsonResponse({ error: "query_failed", error_description: error.message }, 500);
        if (!customer) return g.jsonResponse({ error: "not_found", error_description: "Unknown customer" }, 404);

        const outstanding = (open ?? []).reduce((sum, i) => sum + Number(i.pending_balance ?? 0), 0);

        return g.jsonResponse({
          customer_id: customer.id,
          customer_name: customer.name,
          recorded_outstanding: Number(customer.outstanding_balance ?? 0),
          computed_outstanding: Math.round(outstanding * 100) / 100,
          open_invoices: open ?? [],
        });
      },
    },
  },
});
