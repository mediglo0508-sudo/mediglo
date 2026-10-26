// ============================================================================
// Mediglo AI Manager — chat endpoint.
//
// Auth: the caller's Supabase bearer token is mandatory. Every tool executes
// with that same token, so RLS / billing lock / maintenance mode all apply.
// The model never receives database credentials and never issues raw SQL.
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import { streamText, stepCountIs } from "ai";
import { createLovableAiGatewayProvider, AI_MANAGER_MODEL } from "@/lib/ai-gateway.server";
import { buildTools, loadContext } from "@/lib/ai-tools.server";

const SYSTEM = `You are the Mediglo AI Manager, an assistant embedded inside the MGHYN clinic ERP.

Rules:
- Answer ONLY from the tools. Never invent, estimate or illustrate numbers, clients, invoices or stock.
- If a tool returns no rows, say so plainly. If a tool returns an error or a permission refusal, relay it in plain language.
- Money is Indian Rupees; format as ₹1,234.56. Dates as DD-MM-YYYY.
- Present lists as compact markdown tables with only the useful columns.
- Products / medicines are direct sales. They are never "consumed services" — never suggest marking a product as a consumed service.
- You may report invoice problems but you must never claim to have corrected one; corrections happen through the ERP invoice Edit workflow.
- Before creating a follow-up, confirm you have the client name and dates you were given; use list_marketing_staff when asked to assign someone by name.
- Be brief and operational: a short answer plus the table, no filler.

FINANCIAL ACCESS RULE (absolute):
- Financial information means: total collection, revenue, gross/net sales, payments received, pending payments or dues, outstanding balances, financial reports or summaries, profit, doctor-consultation collection, service/treatment collection, product sales totals, GST amounts, and any other clearly financial figure.
- Financial information is for Admin, Accountant/Finance and Pharmacist only. When a finance tool refuses, state the access limit plainly and stop. Never reveal or approximate the figure through rewording, follow-up questions, summaries, tables, cards, combined queries, or by adding up / deriving it from any other allowed data.
- NON-financial information is NOT restricted and must not be blocked: current stock and availability, low-stock lists, product name, details, brand, MRP or price, service and treatment names, details and prices, and customer profile, appointment, treatment and follow-up information. Answer those for any authorized user — a price or MRP by itself is not financial information.`;


export const Route = createFileRoute("/api/ai-manager")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "AI is not configured on this workspace." }, { status: 500 });
        }

        let ctx;
        try {
          ctx = await loadContext(auth.slice(7));
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (ctx.roles.length === 0) {
          return Response.json(
            { error: "Your account has no role assigned yet, so the AI Manager cannot read clinic data." },
            { status: 403 },
          );
        }
        if (!ctx.roles.some((r) => r === "admin" || r === "doctor")) {
          return Response.json(
            { error: "The AI Manager is available to Admin and Doctor accounts only." },
            { status: 403 },
          );
        }

        const body = (await request.json()) as {
          messages?: { role: "user" | "assistant"; content: string }[];
        };
        const messages = (body.messages ?? []).slice(-16);
        if (!messages.length) return Response.json({ error: "No message provided." }, { status: 400 });

        const gateway = createLovableAiGatewayProvider(apiKey);
        try {
          const result = streamText({
            model: gateway(AI_MANAGER_MODEL),
            system: `${SYSTEM}\n\nToday is ${new Date().toISOString().slice(0, 10)}. The signed-in user's roles: ${ctx.roles.join(", ")}.`,
            messages,
            tools: buildTools(ctx),
            stopWhen: stepCountIs(50),
          });

          const text = await result.text;
          const steps = await result.steps;
          const used: string[] = [];
          const refresh = new Set<string>();
          for (const step of steps) {
            for (const call of step.toolCalls ?? []) used.push(call.toolName);
            for (const res of step.toolResults ?? []) {
              const out = (res as { output?: unknown }).output as { refresh?: string[] } | undefined;
              for (const key of out?.refresh ?? []) refresh.add(key);
            }
          }
          return Response.json({ text, tools: used, refresh: [...refresh] });
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI request failed";
          const status = /rate limit|429/i.test(message)
            ? 429
            : /credit|402|payment/i.test(message)
              ? 402
              : 500;
          const friendly =
            status === 429
              ? "The AI is rate limited right now — try again in a few seconds."
              : status === 402
                ? "AI credits are exhausted for this workspace. Add credits in Lovable to continue."
                : message;
          console.error("[ai-manager]", message);
          return Response.json({ error: friendly }, { status });
        }
      },
    },
  },
});
