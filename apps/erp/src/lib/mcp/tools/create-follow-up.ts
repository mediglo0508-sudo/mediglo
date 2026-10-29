import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_follow_up",
  title: "Create follow-up task",
  description: "Create a follow-up task in the clinic follow-up desk queue for a patient.",
  inputSchema: {
    patient_name: z.string().trim().min(1).describe("Patient / customer name."),
    trigger_reason: z.string().trim().min(1).describe("Why this follow-up is needed."),
    patient_phone: z.string().trim().min(1).optional().describe("Contact phone number."),
    notes: z.string().trim().min(1).optional().describe("Additional notes for the caller."),
    next_followup_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .describe("Date the follow-up is due (YYYY-MM-DD)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cos_follow_ups")
      .insert({
        patient_name: input.patient_name,
        trigger_reason: input.trigger_reason,
        patient_phone: input.patient_phone ?? null,
        notes: input.notes ?? null,
        next_followup_at: input.next_followup_at ?? null,
        assigned_to: ctx.getUserId() ?? null,
      })
      .select("id, patient_name, status, next_followup_at");

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data?.[0] ?? null) }],
      structuredContent: { follow_up: data?.[0] ?? null },
    };
  },
});
