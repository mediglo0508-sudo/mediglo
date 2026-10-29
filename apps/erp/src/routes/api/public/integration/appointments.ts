import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/integration/appointments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:appointments:read", "appointments:read");
        if (g.isResponse(auth)) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const { limit, offset, since } = g.pagination(url);

        let query = supabaseAdmin
          .from("appointments")
          .select(
            "id, customer_id, customer_name, phone, email, gender, service_inquiry, appointment_date, appointment_time, status, notes, created_at, updated_at",
            { count: "exact" },
          )
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

      POST: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:appointments:write", "appointments:write");
        if (g.isResponse(auth)) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const core = await import("@/lib/oauth/core.server");
        const { sha256b64url } = await import("@/lib/oauth/crypto.server");

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return g.jsonResponse({ error: "invalid_request", error_description: "JSON body required" }, 400);
        }

        const customerId = typeof body.customer_id === "string" ? body.customer_id : null;
        const startsAtRaw = typeof body.starts_at === "string" ? body.starts_at : null;
        if (!customerId || !startsAtRaw || Number.isNaN(Date.parse(startsAtRaw))) {
          return g.jsonResponse(
            { error: "invalid_request", error_description: "customer_id and ISO starts_at are required" },
            400,
          );
        }

        const { data: customer } = await supabaseAdmin
          .from("customers")
          .select("id, name, phone, email, gender")
          .eq("id", customerId)
          .maybeSingle();
        if (!customer) {
          return g.jsonResponse({ error: "not_found", error_description: "Unknown customer_id" }, 404);
        }

        const startsAt = new Date(startsAtRaw);
        const appointmentDate = startsAt.toISOString().slice(0, 10);
        const appointmentTime = startsAt.toISOString().slice(11, 19);

        const idemHeader = request.headers.get("idempotency-key");
        if (!idemHeader) {
          return g.jsonResponse(
            { error: "invalid_request", error_description: "Idempotency-Key header is required" },
            400,
          );
        }
        const integrationKey = await sha256b64url(
          `${auth.claims.client_id}|${idemHeader}|${customerId}|${startsAt.toISOString()}`,
        );

        const patch: Record<string, unknown> = {
          customer_id: customerId,
          customer_name: customer.name,
          phone: (body.phone as string) ?? customer.phone ?? null,
          email: (body.email as string) ?? customer.email ?? null,
          gender: customer.gender ?? null,
          service_inquiry: body.service != null ? String(body.service) : null,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          status: body.status != null ? String(body.status) : "scheduled",
          notes: body.notes != null ? String(body.notes) : null,
          integration_key: integrationKey,
        };

        // Idempotent: same key -> update; otherwise match same customer + slot.
        const { data: byKey } = await supabaseAdmin
          .from("appointments")
          .select("id")
          .eq("integration_key", integrationKey)
          .maybeSingle();

        let existingId = byKey?.id ?? null;
        if (!existingId) {
          const { data: bySlot } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("customer_id", customerId)
            .eq("appointment_date", appointmentDate)
            .eq("appointment_time", appointmentTime)
            .limit(1)
            .maybeSingle();
          existingId = bySlot?.id ?? null;
        }

        if (existingId) {
          const { error } = await supabaseAdmin.from("appointments").update(patch as never).eq("id", existingId);
          if (error) return g.jsonResponse({ error: "update_failed", error_description: error.message }, 500);
          await core.auditIntegration({
            userId: auth.claims.sub,
            action: "INTEGRATION_APPOINTMENT_UPDATED",
            entityType: "appointments",
            entityId: existingId,
            newValue: { via: auth.claims.client_id, patch },
            ip: auth.ip,
          });
          return g.jsonResponse({ id: existingId, result: "updated" });
        }

        const { data, error } = await supabaseAdmin
          .from("appointments")
          .insert(patch as never)
          .select("id")
          .maybeSingle();
        if (error) return g.jsonResponse({ error: "insert_failed", error_description: error.message }, 500);

        await core.auditIntegration({
          userId: auth.claims.sub,
          action: "INTEGRATION_APPOINTMENT_CREATED",
          entityType: "appointments",
          entityId: data?.id ?? null,
          newValue: { via: auth.claims.client_id, patch },
          ip: auth.ip,
        });
        return g.jsonResponse({ id: data?.id, result: "created" }, 201);
      },
    },
  },
});
