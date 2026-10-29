import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/integration/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await import("@/lib/integration/guard.server");
        const auth = await g.authorize(request, "integration:customers:read", "patients:read");
        if (g.isResponse(auth)) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const { limit, offset, since } = g.pagination(url);

        let query = supabaseAdmin
          .from("customers")
          .select(
            "id, name, phone, email, city, age, gender, customer_code, client_type, outstanding_balance, created_at, updated_at",
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
        const auth = await g.authorize(request, "integration:customers:write", "patients:write");
        if (g.isResponse(auth)) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const core = await import("@/lib/oauth/core.server");

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return g.jsonResponse({ error: "invalid_request", error_description: "JSON body required" }, 400);
        }

        const name = String(body.name ?? "").trim();
        if (!name) {
          return g.jsonResponse({ error: "invalid_request", error_description: "name is required" }, 400);
        }
        const phoneNorm = g.normalizePhone(body.phone);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

        // MATCH FIRST — normalized phone, then email. Never create a duplicate.
        let existingId: string | null = null;
        if (phoneNorm) {
          const { data } = await supabaseAdmin
            .from("customers")
            .select("id, phone")
            .not("phone", "is", null)
            .ilike("phone", `%${phoneNorm}%`)
            .limit(50);
          existingId =
            (data ?? []).find((c) => g.normalizePhone(c.phone) === phoneNorm)?.id ?? null;
        }
        if (!existingId && email) {
          const { data } = await supabaseAdmin
            .from("customers")
            .select("id")
            .ilike("email", email)
            .limit(1)
            .maybeSingle();
          existingId = data?.id ?? null;
        }

        const patch: Record<string, unknown> = { name };
        if (body.phone != null) patch.phone = String(body.phone);
        if (email) patch.email = email;
        if (body.city != null) patch.city = String(body.city);
        if (body.gender != null) patch.gender = String(body.gender);
        if (body.age != null && Number.isFinite(Number(body.age))) patch.age = Number(body.age);
        if (body.client_type != null) patch.client_type = String(body.client_type);

        if (existingId) {
          const { data, error } = await supabaseAdmin
            .from("customers")
            .update(patch as never)
            .eq("id", existingId)
            .select("id")
            .maybeSingle();
          if (error) return g.jsonResponse({ error: "update_failed", error_description: error.message }, 500);
          await core.auditIntegration({
            userId: auth.claims.sub,
            action: "INTEGRATION_CUSTOMER_MATCHED",
            entityType: "customers",
            entityId: existingId,
            newValue: { via: auth.claims.client_id, patch },
            ip: auth.ip,
          });
          return g.jsonResponse({ id: data?.id ?? existingId, result: "matched" });
        }

        const { data, error } = await supabaseAdmin
          .from("customers")
          .insert(patch as never)
          .select("id")
          .maybeSingle();
        if (error) return g.jsonResponse({ error: "insert_failed", error_description: error.message }, 500);

        await core.auditIntegration({
          userId: auth.claims.sub,
          action: "INTEGRATION_CUSTOMER_CREATED",
          entityType: "customers",
          entityId: data?.id ?? null,
          newValue: { via: auth.claims.client_id, patch },
          ip: auth.ip,
        });
        return g.jsonResponse({ id: data?.id, result: "created" }, 201);
      },
    },
  },
});
