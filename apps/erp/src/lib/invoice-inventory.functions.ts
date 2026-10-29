// ============================================================================
// Invoice → inventory bridge.
//
// public.rebill_invoice_inventory() is EXECUTE-granted to service_role only, so
// the browser cannot call it directly. This server function verifies — through
// the caller's OWN Supabase session, i.e. under the existing RLS policies —
// that the caller can actually read the invoice, and only then runs the RPC
// with the privileged client. It never touches stock itself: all movement
// happens inside the SQL function.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface RebillSummary {
  reversedMovements: number;
  unitsRestored: number;
  appliedMovements: number;
  unitsDeducted: number;
  skippedUnmapped: number;
  alreadyApplied: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const rebillInvoiceInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string }) => {
    if (!data?.invoiceId || typeof data.invoiceId !== "string") {
      throw new Error("invoiceId is required");
    }
    return { invoiceId: data.invoiceId };
  })
  .handler(async ({ data, context }): Promise<RebillSummary> => {
    // RLS check as the caller — a user who cannot read the invoice cannot rebill it.
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, voided_at")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Forbidden");
    if ((inv as { voided_at: string | null }).voided_at) {
      throw new Error("This invoice is voided — un-void it before editing.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error: rpcErr } = await supabaseAdmin.rpc("rebill_invoice_inventory", {
      p_invoice_id: data.invoiceId,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const r = (res ?? {}) as Record<string, unknown>;
    const reversed = (r["reverse"] ?? r["reversed"] ?? {}) as Record<string, unknown>;
    const applied = (r["apply"] ?? r["applied"] ?? {}) as Record<string, unknown>;

    return {
      reversedMovements: num(reversed["reversed_movements"] ?? r["reversed_movements"]),
      unitsRestored: num(reversed["units_restored"] ?? r["units_restored"]),
      appliedMovements: num(applied["lines_applied"] ?? r["lines_applied"]),
      unitsDeducted: num(applied["units_deducted"] ?? r["units_deducted"]),
      skippedUnmapped: num(applied["skipped_unmapped"] ?? r["skipped_unmapped"]),
      alreadyApplied: Boolean(applied["already_applied"] ?? r["already_applied"]),
    };
  });
