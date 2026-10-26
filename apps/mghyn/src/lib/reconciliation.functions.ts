import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const allocSchema = z.object({
  bank_txn_id: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        target_type: z.enum(["invoice", "purchase", "vendor_payment", "expense"]),
        target_id: z.string().uuid(),
        target_ref: z.string().optional().nullable(),
        amount: z.number().positive(),
        note: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

async function assertFinance(ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = new Set(((data ?? []) as { role: string }[]).map((r) => r.role));
  if (!(roles.has("admin") || roles.has("accountant"))) throw new Error("Forbidden");
}

export const applyReconAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => allocSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context as never);
    const { supabase, userId } = context;
    const rows = data.allocations.map((a) => ({
      bank_txn_id: data.bank_txn_id,
      target_type: a.target_type,
      target_id: a.target_id,
      target_ref: a.target_ref ?? null,
      amount: a.amount,
      note: a.note ?? null,
      created_by: userId,
    }));
    const { error, data: inserted } = await supabase
      .from("reconciliation_allocations")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, inserted: (inserted ?? []).length };
  });

export const listReconAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_txn_id?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertFinance(context as never);
    const q = context.supabase
      .from("reconciliation_allocations")
      .select("id, bank_txn_id, target_type, target_id, target_ref, amount, note, created_at")
      .order("created_at", { ascending: false });
    if (data.bank_txn_id) q.eq("bank_txn_id", data.bank_txn_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteReconAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context as never);
    const { error } = await context.supabase.from("reconciliation_allocations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
