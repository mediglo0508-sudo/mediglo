import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ReviewRow {
  id: string; source: string; kind: string; reason: string;
  status: string; raw_payload: string; created_at: string;
}

export const listReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReviewRow[]> => {
    const { data, error } = await context.supabase
      .from("import_review_queue")
      .select("id, source, kind, reason, status, raw_payload, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string, source: r.source, kind: r.kind, reason: r.reason,
      status: r.status, created_at: r.created_at,
      raw_payload: JSON.stringify(r.raw_payload ?? null),
    }));
  });


export const setReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "fixed" | "discarded" | "pending" }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("import_review_queue")
      .update({ status: data.status, resolved_at: data.status === "pending" ? null : new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
