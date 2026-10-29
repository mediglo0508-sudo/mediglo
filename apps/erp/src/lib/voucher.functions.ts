import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saleSchema = z.object({
  invoice_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().min(1).max(64),
  invoice_date: z.string().min(1).max(32).nullable().optional(),
  customer_name: z.string().min(1).max(255),
  base_amount: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  gross_total: z.number(),
  paid_amount: z.number(),
  payment_mode: z.string().min(1).max(64),
  splits: z.array(z.object({ mode: z.string().min(1).max(64), amount: z.number() })).optional(),
});

const MODE_LEDGER: Record<string, string> = {
  Cash: "Cash A/c",
  UPI: "Bank A/c (UPI)",
  Card: "Bank A/c (Card)",
  "Net Banking": "Bank A/c (Net Banking)",
  Razorpay: "Bank A/c (Razorpay Gateway)",
  Finance: "Finance Receivable A/c",
  SaveIn: "SaveIn Receivable A/c",
  "Save In": "SaveIn Receivable A/c",
  "Credit Card EMI": "Credit Card EMI Receivable A/c",
  CNH: "CNH A/c",
  Credit: "Sundry Debtors A/c (Credit Sales)",
  Pending: "Suspense A/c (Pending Tender)",
};

const UNMAPPED_LEDGER = "Suspense A/c (Unmapped Tender)";

/** Resolve a UI/tender label (e.g. "Save in Finance", "Finance/EMI") to a ledger. */
function ledgerFor(mode: string): string {
  const direct = MODE_LEDGER[mode];
  if (direct) return direct;
  const v = String(mode ?? "").trim().toLowerCase();
  if (!v) return UNMAPPED_LEDGER;
  if (/\bcnh\b/.test(v)) return MODE_LEDGER.CNH;
  if (/credit\s*card\s*emi|cc\s*emi|card\s*emi/.test(v)) return MODE_LEDGER["Credit Card EMI"];
  if (v.includes("savein") || v.includes("save in")) return MODE_LEDGER.SaveIn;
  if (v.includes("finance") || v.includes("emi") || v.includes("bajaj") || v.includes("snapmint"))
    return MODE_LEDGER.Finance;
  if (v.includes("net banking") || v.includes("netbanking") || v.includes("neft") || v.includes("imps"))
    return MODE_LEDGER["Net Banking"];
  if (v.includes("razor")) return MODE_LEDGER.Razorpay;
  if (v.includes("upi")) return MODE_LEDGER.UPI;
  if (v.includes("card") || v.includes("swipe")) return MODE_LEDGER.Card;
  if (v.includes("cash")) return MODE_LEDGER.Cash;
  if (v.includes("credit")) return MODE_LEDGER.Credit;
  if (v.includes("pending") || v.includes("advance") || v.includes("part payment")) return MODE_LEDGER.Pending;
  return UNMAPPED_LEDGER;
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;


/**
 * Posts Sales + Receipt double-entry vouchers for a saved invoice.
 * Caller must be authenticated AND hold a billing role (reception/admin/accountant).
 * Vouchers are written with the service-role client so reception users do not need
 * direct row-level access to the accounting tables.
 */
export const postSaleVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError) throw roleError;
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.some((r) => r === "admin" || r === "accountant" || r === "reception")) throw new Error("Forbidden");

    const stamp = Date.now().toString().slice(-8);
    const vdate = data.invoice_date ?? new Date().toISOString().slice(0, 10);

    // --- Sales Voucher ---
    const { data: sv } = await supabaseAdmin
      .from("vouchers")
      .insert({
        vtype: "sales",
        invoice_id: data.invoice_id ?? null,
        voucher_no: `SV-${stamp}`,
        vdate,
        party: data.customer_name,
        narration: `Sales against ${data.invoice_no}`,
        amount: round2(data.gross_total),
        gst_rate: 5,
        cgst: round2(data.cgst),
        sgst: round2(data.sgst),
        payment_mode: data.payment_mode,
      })
      .select("id")
      .single();

    const partyLedger = `${data.customer_name} (Debtors)`;
    if (sv) {
      await supabaseAdmin.from("voucher_entries").insert([
        { voucher_id: sv.id, ledger: partyLedger, debit: round2(data.gross_total), credit: 0 },
        { voucher_id: sv.id, ledger: "Sales A/c", debit: 0, credit: round2(data.base_amount) },
        { voucher_id: sv.id, ledger: "Output CGST 2.5%", debit: 0, credit: round2(data.cgst) },
        { voucher_id: sv.id, ledger: "Output SGST 2.5%", debit: 0, credit: round2(data.sgst) },
      ]);
    }

    // --- Receipt Voucher (only if money collected) ---
    const paid = round2(data.paid_amount);
    const splits = (data.splits ?? []).filter((s) => round2(s.amount) > 0);
    const tenders = splits.length > 0
      ? splits.map((s) => ({ mode: s.mode, amount: round2(s.amount) }))
      : paid > 0
        ? [{ mode: data.payment_mode, amount: paid }]
        : [];

    for (let i = 0; i < tenders.length; i++) {
      const t = tenders[i];
      if (t.amount <= 0) continue;
      const cashBank = ledgerFor(t.mode);
      const { data: rv } = await supabaseAdmin
        .from("vouchers")
        .insert({
          vtype: "receipt",
          invoice_id: data.invoice_id ?? null,
          voucher_no: tenders.length > 1 ? `RV-${stamp}-${i + 1}` : `RV-${stamp}`,
          vdate,
          party: data.customer_name,
          narration: `Receipt against ${data.invoice_no} via ${t.mode}`,
          amount: t.amount,
          gst_rate: 0,
          cgst: 0,
          sgst: 0,
          payment_mode: t.mode,
        })
        .select("id")
        .single();
      if (rv) {
        await supabaseAdmin.from("voucher_entries").insert([
          { voucher_id: rv.id, ledger: cashBank, debit: t.amount, credit: 0 },
          { voucher_id: rv.id, ledger: partyLedger, debit: 0, credit: t.amount },
        ]);
      }
    }

    return { ok: true };
  });
