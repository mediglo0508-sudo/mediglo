// POS automation hooks: auto-voucher posting, inventory consumption, package sessions
import { supabase } from "@/integrations/supabase/client";
import { round2, isAfterFreeze } from "@/lib/gst";
import { postSaleVouchers as postSaleVouchersServer } from "@/lib/voucher.functions";

interface AutoInvoice {
  id: string;
  invoice_no: string;
  invoice_date?: string | null;
  customer_name: string;
  base_amount: number;
  cgst: number;
  sgst: number;
  gross_total: number;
  paid_amount: number;
  payment_mode: string;
  splits?: Array<{ mode: string; amount: number }>;
}

/**
 * Post Sales + Receipt double-entry vouchers for a saved invoice.
 * Delegates to a secure server function: accounting tables are finance-only at the
 * RLS layer, and the server fn authorizes the caller before writing with elevated rights.
 */
export async function postSaleVouchers(inv: AutoInvoice) {
  await postSaleVouchersServer({
    data: {
      invoice_id: inv.id,
      invoice_no: inv.invoice_no,
      invoice_date: inv.invoice_date ?? null,
      customer_name: inv.customer_name,
      base_amount: round2(inv.base_amount),
      cgst: round2(inv.cgst),
      sgst: round2(inv.sgst),
      gross_total: round2(inv.gross_total),
      paid_amount: round2(inv.paid_amount),
      payment_mode: inv.payment_mode,
      splits: inv.splits,
    },
  });
}

/**
 * Decrement inventory stock for consumed products.
 * Freeze rule: entries dated before June 4, 2026 have zero impact on live stock.
 */
export async function applyConsumption(
  consumed: { item_id: string; qty_used: number; stock_qty: number }[],
  invoiceDate?: string | null,
) {
  if (!isAfterFreeze(invoiceDate)) return; // pre-freeze: no stock impact
  for (const c of consumed) {
    if (!c.item_id || c.qty_used <= 0) continue;
    const next = round2(Number(c.stock_qty) - Number(c.qty_used));
    await supabase.from("inventory").update({ stock: next }).eq("id", c.item_id);
  }
}

/** Increment completed sessions on linked treatment packages. */
export async function incrementPackages(packageIds: string[]) {
  const unique = Array.from(new Set(packageIds.filter(Boolean)));
  for (const id of unique) {
    const { data: pkg } = await supabase
      .from("treatment_packages")
      .select("sessions_completed, total_sessions")
      .eq("id", id)
      .single();
    if (!pkg) continue;
    const next = Math.min(Number(pkg.sessions_completed) + 1, Number(pkg.total_sessions));
    await supabase.from("treatment_packages").update({ sessions_completed: next }).eq("id", id);
  }
}
