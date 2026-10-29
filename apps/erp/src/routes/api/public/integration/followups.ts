import { createFileRoute } from "@tanstack/react-router";

/** Writes into the EXISTING cos_follow_ups structure — never a parallel copy. */
export const Route = createFileRoute("/api/public/integration/followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:followups:write", "followups:write");
        if (g.isResponse(auth)) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const core = await import("@/lib/oauth/core.server");

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return g.jsonResponse({ error: "invalid_request", error_description: "JSON body required" }, 400);
        }

        const patientId = typeof body.customer_id === "string" ? body.customer_id : null;
        let patientName = typeof body.patient_name === "string" ? body.patient_name.trim() : "";
        let patientPhone = typeof body.patient_phone === "string" ? body.patient_phone : null;

        if (patientId) {
          const { data: customer } = await supabaseAdmin
            .from("customers")
            .select("name, phone")
            .eq("id", patientId)
            .maybeSingle();
          if (!customer) {
            return g.jsonResponse({ error: "not_found", error_description: "Unknown customer_id" }, 404);
          }
          patientName = patientName || customer.name;
          patientPhone = patientPhone ?? customer.phone;
        }
        if (!patientName) {
          return g.jsonResponse(
            { error: "invalid_request", error_description: "customer_id or patient_name is required" },
            400,
          );
        }

        const nextAt =
          typeof body.next_followup_at === "string" && !Number.isNaN(Date.parse(body.next_followup_at))
            ? new Date(body.next_followup_at).toISOString()
            : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const sourceKey =
          typeof body.source_key === "string" && body.source_key.trim()
            ? body.source_key.trim()
            : `tracker:${auth.claims.client_id}:${patientId ?? patientName}:${nextAt}`;

        // Idempotent on source_key.
        const { data: existing } = await supabaseAdmin
          .from("cos_follow_ups")
          .select("id")
          .eq("source_key", sourceKey)
          .limit(1)
          .maybeSingle();

        const row: Record<string, unknown> = {
          patient_id: patientId,
          patient_name: patientName,
          patient_phone: patientPhone,
          trigger_reason: body.reason != null ? String(body.reason) : "tracker",
          notes: body.notes != null ? String(body.notes) : null,
          next_followup_at: nextAt,
          status: body.status != null ? String(body.status) : "pending",
          kind: body.kind != null ? String(body.kind) : "followup",
          assigned_to: typeof body.assigned_to === "string" ? body.assigned_to : auth.claims.sub,
          source_key: sourceKey,
        };

        if (existing) {
          const { error } = await supabaseAdmin.from("cos_follow_ups").update(row as never).eq("id", existing.id);
          if (error) return g.jsonResponse({ error: "update_failed", error_description: error.message }, 500);
          await core.auditIntegration({
            userId: auth.claims.sub,
            action: "INTEGRATION_FOLLOWUP_UPDATED",
            entityType: "cos_follow_ups",
            entityId: existing.id,
            newValue: { via: auth.claims.client_id, row },
            ip: auth.ip,
          });
          return g.jsonResponse({ id: existing.id, result: "updated" });
        }

        const { data, error } = await supabaseAdmin
          .from("cos_follow_ups")
          .insert(row as never)
          .select("id")
          .maybeSingle();
        if (error) return g.jsonResponse({ error: "insert_failed", error_description: error.message }, 500);

        await core.auditIntegration({
          userId: auth.claims.sub,
          action: "INTEGRATION_FOLLOWUP_CREATED",
          entityType: "cos_follow_ups",
          entityId: data?.id ?? null,
          newValue: { via: auth.claims.client_id, row },
          ip: auth.ip,
        });
        return g.jsonResponse({ id: data?.id, result: "created" }, 201);
      },
    },
  },
});
