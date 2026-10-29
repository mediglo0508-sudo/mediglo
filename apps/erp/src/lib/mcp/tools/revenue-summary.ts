import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  name: "revenue_summary",
  title: "Revenue summary",
  description:
    "Summarise live (non-voided) invoice revenue for a date range: invoice count, gross total, paid amount and balance due.",
  inputSchema: {
    from: DATE.describe("Start date (YYYY-MM-DD), inclusive."),
    to: DATE.describe("End date (YYYY-MM-DD), inclusive."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("v_live_invoices")
      .select("id, invoice_date, gross_total, paid_amount, pending_balance")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .limit(5000);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []) as Array<{
      gross_total: number | null;
      paid_amount: number | null;
      pending_balance: number | null;
    }>;
    const sum = (k: "gross_total" | "paid_amount" | "pending_balance") =>
      Math.round(rows.reduce((a, r) => a + Number(r[k] ?? 0), 0) * 100) / 100;

    const summary = {
      from,
      to,
      invoice_count: rows.length,
      gross_total: sum("gross_total"),
      amount_paid: sum("paid_amount"),
      balance_due: sum("pending_balance"),
    };
    return { content: [{ type: "text", text: JSON.stringify(summary) }], structuredContent: summary };
  },
});
