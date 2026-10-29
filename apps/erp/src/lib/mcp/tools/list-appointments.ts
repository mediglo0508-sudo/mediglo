import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  name: "list_appointments",
  title: "List appointments",
  description: "List clinic appointments within a date range, with customer, time, service inquiry and status.",
  inputSchema: {
    from: DATE.describe("Start date (YYYY-MM-DD), inclusive."),
    to: DATE.describe("End date (YYYY-MM-DD), inclusive."),
    status: z.string().trim().min(1).optional().describe("Optional status filter, e.g. scheduled or cancelled."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("appointments")
      .select("id, customer_name, phone, appointment_date, appointment_time, service_inquiry, status, notes")
      .gte("appointment_date", from)
      .lte("appointment_date", to)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { appointments: data ?? [] },
    };
  },
});
