import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "low_stock_items",
  title: "Low stock items",
  description: "List inventory items whose current stock is at or below a threshold, so reordering can be planned.",
  inputSchema: {
    threshold: z.number().int().min(0).max(10000).optional().describe("Stock level at or below which to report (default 5)."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ threshold, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const cut = threshold ?? 5;
    const { data, error } = await supabase
      .from("inventory")
      .select("id, name, category, brand, stock, rate")
      .eq("active", true)
      .lte("stock", cut)
      .order("stock", { ascending: true })
      .limit(limit ?? 50);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { threshold: cut, items: data ?? [] },
    };
  },
});
