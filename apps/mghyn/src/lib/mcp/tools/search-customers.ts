import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_customers",
  title: "Search customers",
  description:
    "Search clinic customers (CRM) by name or phone and return their contact details and outstanding balance.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Name or phone fragment to search for."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum rows to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    // Strip PostgREST filter metacharacters so the search text cannot inject extra clauses.
    const safeQuery = query.replace(/[,()."'\\%*]/g, " ").trim().slice(0, 100);
    if (!safeQuery) {
      return { content: [{ type: "text", text: "Search query contains no searchable characters." }], isError: true };
    }
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, city, client_type, outstanding_balance, created_at")
      .or(`name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { customers: data ?? [] },
    };
  },
});
