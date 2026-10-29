// ============================================================================
// Mediglo AI Manager — server-only tool implementations.
//
// Every tool runs with a Supabase client built from the CALLER's bearer token,
// so Row Level Security, the billing lock, maintenance mode and every existing
// database trigger apply exactly as they do in the app. There is no service
// role client here on purpose: the AI can never see or change more than the
// signed-in user can, and it never issues raw SQL.
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCatalogIndex,
  lineCategory,
  splitInvoiceRevenue,
  type CatalogIndex,
} from "./item-category.core";

export type Role = string;

export interface AiContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  roles: Role[];
}

export function supabaseForToken(token: string): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export async function loadContext(token: string): Promise<AiContext> {
  const supabase = supabaseForToken(token);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error("Unauthorized");
  const userId = String(data.claims.sub);
  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (roleRows ?? []).map((r) => String(r.role));
  return { supabase, userId, roles };
}

/* ------------------------------------------------------------------ utils */

const num = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(iso: string | null) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function deny(required: string[]): { error: string } {
  return {
    error: `Not permitted: this action requires one of these roles — ${required.join(", ")}. Ask an Admin if you need access.`,
  };
}

/** Refusal for money figures. Never leak the underlying value alongside it. */
const FINANCE_DENIED = {
  error:
    "Access denied: financial information (collections, revenue, dues, GST, financial reports) is restricted to Admin, Accountant/Finance and Pharmacist roles. Non-financial information such as stock, product MRP, service prices, customers, appointments and follow-ups is still available.",
} as const;

function allowed(ctx: AiContext, required: string[]) {
  return ctx.roles.some((r) => required.includes(r));
}

/** True only for roles cleared to see money figures. */
export function canSeeFinance(ctx: AiContext) {
  return allowed(ctx, ROLE_SETS.finance);
}


async function catalogIndex(ctx: AiContext): Promise<CatalogIndex> {
  const [prod, svc] = await Promise.all([
    ctx.supabase.from("inventory").select("name").eq("active", true),
    ctx.supabase.from("services_master").select("name, category, sac_code").eq("active", true),
  ]);
  return buildCatalogIndex(prod.data ?? [], svc.data ?? []);
}

/** Role sets, mirroring the ERP's own screen-level permissions. */
export const ROLE_SETS = {
  any: [
    "admin", "doctor", "reception", "accountant", "marketing", "marketing_admin",
    "marketing_head", "caller", "counselor", "counselor_1", "counselor_2",
    "therapist", "pharmacist",
  ],
  marketing: ["admin", "marketing_admin", "marketing_head", "marketing", "caller", "reception"],
  /**
   * FINANCIAL information only: collections, revenue, gross/net sales, payments,
   * pending dues, GST, financial reports and summaries, profit figures.
   * Deliberately NOT reception/counselor — money figures are Admin, Accountant
   * (Finance) and Pharmacist only.
   */
  finance: ["admin", "accountant", "pharmacist"],
  /**
   * Operational, non-financial ERP reads (stock, MRP, service prices, customers,
   * appointments, follow-ups). Any authorized ERP role; RLS still applies.
   */
  inventory: [
    "admin", "doctor", "reception", "accountant", "marketing", "marketing_admin",
    "marketing_head", "caller", "counselor", "counselor_1", "counselor_2",
    "therapist", "pharmacist",
  ],
};


/* ------------------------------------------------------------------ tools */

export function buildTools(ctx: AiContext) {
  return {
    /* ---------------- Phase 1: read-only ---------------- */

    pending_sessions: tool({
      description:
        "Clients who still have unused treatment/service sessions in an active wallet, with days since their last visit. Use for 'pending sessions', 'remaining sessions', 'long gap since last visit'.",
      inputSchema: z.object({
        min_gap_days: z.number().optional().describe("Only clients whose last visit is at least this many days ago."),
        limit: z.number().optional(),
      }),
      execute: async ({ min_gap_days, limit }) => {
        if (!allowed(ctx, ROLE_SETS.any)) return deny(ROLE_SETS.any);
        const [wRes, iRes] = await Promise.all([
          ctx.supabase
            .from("service_wallets")
            .select("id, customer_name, customer_phone, service_name, total_sessions, consumed_sessions, status, created_at")
            .eq("status", "active"),
          ctx.supabase
            .from("invoices")
            .select("customer_name, invoice_date, voided_at")
            .is("voided_at", null)
            .order("invoice_date", { ascending: false })
            .limit(4000),
        ]);
        const lastVisit = new Map<string, string>();
        for (const inv of iRes.data ?? []) {
          const k = norm(inv.customer_name);
          if (k && !lastVisit.has(k)) lastVisit.set(k, inv.invoice_date);
        }
        const rows = (wRes.data ?? [])
          .map((w) => {
            const left = Math.max(0, num(w.total_sessions) - num(w.consumed_sessions));
            const last = lastVisit.get(norm(w.customer_name)) ?? null;
            return {
              wallet_id: w.id,
              client: w.customer_name,
              phone: w.customer_phone,
              service: w.service_name,
              sessions_left: left,
              sessions_total: num(w.total_sessions),
              last_visit: last,
              days_since_last_visit: daysBetween(last),
            };
          })
          .filter((r) => r.sessions_left > 0)
          .filter((r) => (min_gap_days ? (r.days_since_last_visit ?? 9999) >= min_gap_days : true))
          .sort((a, b) => (b.days_since_last_visit ?? 0) - (a.days_since_last_visit ?? 0))
          .slice(0, limit ?? 50);
        return { count: rows.length, rows };
      },
    }),

    todays_appointments: tool({
      description: "Appointments for a given date (defaults to today) from the clinic calendar.",
      inputSchema: z.object({
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
        status: z.string().optional(),
      }),
      execute: async ({ date, status }) => {
        if (!allowed(ctx, ROLE_SETS.any)) return deny(ROLE_SETS.any);
        const day = date || todayIso();
        let q = ctx.supabase
          .from("appointments")
          .select("id, customer_name, phone, service_inquiry, appointment_date, appointment_time, status, notes")
          .eq("appointment_date", day)
          .order("appointment_time", { ascending: true });
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { date: day, count: (data ?? []).length, rows: data ?? [] };
      },
    }),

    collection_summary: tool({
      description:
        "Collection / revenue breakdown for a date or date range using the ERP's own rules: gross, net (pre-GST), GST, paid, pending, and the Doctor Consultation / Services / Products split.",
      inputSchema: z.object({
        from: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
        to: z.string().optional().describe("YYYY-MM-DD, defaults to `from`"),
      }),
      execute: async ({ from, to }) => {
        if (!canSeeFinance(ctx)) return FINANCE_DENIED;
        const start = from || todayIso();
        const end = to || start;
        const { data: invs, error } = await ctx.supabase
          .from("invoices")
          .select("id, invoice_no, customer_name, invoice_date, gross_total, base_amount, cgst, sgst, paid_amount, pending_balance, discount_amount, payment_mode, voided_at")
          .gte("invoice_date", start)
          .lte("invoice_date", end)
          .is("voided_at", null);
        if (error) return { error: error.message };
        const ids = (invs ?? []).map((i) => i.id);
        const idx = await catalogIndex(ctx);
        const lineMap = new Map<string, { item_category: string | null; description: string; line_total: number }[]>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: lines } = await ctx.supabase
            .from("invoice_lines")
            .select("invoice_id, description, item_category, line_total")
            .in("invoice_id", ids.slice(i, i + 200));
          for (const l of lines ?? []) {
            const arr = lineMap.get(l.invoice_id) ?? [];
            arr.push({ item_category: l.item_category, description: l.description, line_total: num(l.line_total) });
            lineMap.set(l.invoice_id, arr);
          }
        }
        let gross = 0, net = 0, gst = 0, paid = 0, pending = 0;
        const split = { consultation: 0, service: 0, product: 0 };
        for (const inv of invs ?? []) {
          gross += num(inv.gross_total);
          net += num(inv.base_amount);
          gst += num(inv.cgst) + num(inv.sgst);
          paid += num(inv.paid_amount);
          pending += num(inv.pending_balance);
          const s = splitInvoiceRevenue(lineMap.get(inv.id) ?? [], num(inv.discount_amount), idx);
          split.consultation += s.consultation;
          split.service += s.service;
          split.product += s.product;
        }
        return {
          from: start,
          to: end,
          invoices: (invs ?? []).length,
          gross: r2(gross),
          net_pre_gst: r2(net),
          gst: r2(gst),
          collected: r2(paid),
          pending: r2(pending),
          doctor_consultation: r2(split.consultation),
          services_treatments: r2(split.service),
          products_medicines: r2(split.product),
        };
      },
    }),

    pending_dues: tool({
      description: "Invoices with an outstanding balance (pending dues / uncollected payments), newest first.",
      inputSchema: z.object({
        client: z.string().optional().describe("Filter by client name (partial match)."),
        min_amount: z.number().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ client, min_amount, limit }) => {
        if (!canSeeFinance(ctx)) return FINANCE_DENIED;
        let q = ctx.supabase
          .from("invoices")
          .select("id, invoice_no, customer_name, invoice_date, gross_total, paid_amount, pending_balance, payment_mode")
          .is("voided_at", null)
          .gt("pending_balance", min_amount ?? 0)
          .order("invoice_date", { ascending: false })
          .limit(limit ?? 100);
        if (client) q = q.ilike("customer_name", `%${client}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const total = (data ?? []).reduce((s, r) => s + num(r.pending_balance), 0);
        return { count: (data ?? []).length, total_pending: r2(total), rows: data ?? [] };
      },
    }),

    low_stock: tool({
      description: "Products / medicines at or below a stock threshold, plus batches expiring soon.",
      inputSchema: z.object({
        threshold: z.number().optional().describe("Stock level considered low (default 10)."),
        expiry_days: z.number().optional().describe("Flag batches expiring within this many days (default 60)."),
      }),
      execute: async ({ threshold, expiry_days }) => {
        if (!allowed(ctx, ROLE_SETS.inventory)) return deny(ROLE_SETS.inventory);
        const lim = threshold ?? 10;
        const days = expiry_days ?? 60;
        const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        const [lowRes, expRes] = await Promise.all([
          ctx.supabase
            .from("inventory")
            .select("id, name, category, stock, rate, brand")
            .eq("active", true)
            .lte("stock", lim)
            .order("stock", { ascending: true })
            .limit(200),
          ctx.supabase
            .from("inventory_batches")
            .select("id, inventory_id, batch_no, expiry_date, quantity")
            .eq("active", true)
            .gt("quantity", 0)
            .not("expiry_date", "is", null)
            .lte("expiry_date", cutoff)
            .order("expiry_date", { ascending: true })
            .limit(100),
        ]);
        return {
          threshold: lim,
          low_stock: lowRes.data ?? [],
          expiring_within_days: days,
          expiring_batches: expRes.data ?? [],
        };
      },
    }),

    client_lookup: tool({
      description:
        "360° view of one client: profile, wallets/sessions, visit history and upcoming appointments. Billing amounts and dues are included only for finance-authorised roles.",
      inputSchema: z.object({ name: z.string().optional(), phone: z.string().optional() }),
      execute: async ({ name, phone }) => {
        if (!allowed(ctx, ROLE_SETS.any)) return deny(ROLE_SETS.any);
        if (!name && !phone) return { error: "Provide a client name or phone number." };
        const fin = canSeeFinance(ctx);
        let cq = ctx.supabase.from("customers").select("id, name, phone, city, outstanding_balance").limit(5);
        cq = phone ? cq.ilike("phone", `%${phone}%`) : cq.ilike("name", `%${name}%`);
        const { data: customers } = await cq;
        const target = customers?.[0];
        const nameFilter = target?.name ?? name ?? "";
        const [wallets, invoices, appts] = await Promise.all([
          ctx.supabase
            .from("service_wallets")
            .select("service_name, total_sessions, consumed_sessions, status, created_at")
            .ilike("customer_name", `%${nameFilter}%`),
          ctx.supabase
            .from("invoices")
            .select("id, invoice_no, invoice_date, gross_total, paid_amount, pending_balance, voided_at")
            .ilike("customer_name", `%${nameFilter}%`)
            .order("invoice_date", { ascending: false })
            .limit(20),
          ctx.supabase
            .from("appointments")
            .select("appointment_date, appointment_time, service_inquiry, status")
            .ilike("customer_name", `%${nameFilter}%`)
            .gte("appointment_date", todayIso())
            .order("appointment_date", { ascending: true })
            .limit(10),
        ]);
        // Strip every money field for non-finance roles; keep the visit history.
        const stripMoney = <T extends { id?: unknown; name?: unknown }>(rows: T[]) =>
          rows.map((r) => {
            const { outstanding_balance: _o, ...rest } = r as T & { outstanding_balance?: unknown };
            return rest;
          });
        const visits = (invoices.data ?? []).map((i) => ({
          invoice_no: i.invoice_no,
          date: i.invoice_date,
          voided: !!i.voided_at,
        }));
        return {
          matches: fin ? (customers ?? []) : stripMoney(customers ?? []),
          client: fin ? (target ?? { name: nameFilter }) : (target ? stripMoney([target])[0] : { name: nameFilter }),
          wallets: wallets.data ?? [],
          visit_history: visits,
          ...(fin
            ? { invoices: invoices.data ?? [] }
            : {
                billing:
                  "Access denied: invoice amounts, payments and pending dues are restricted to Admin, Accountant/Finance and Pharmacist roles.",
              }),
          upcoming_appointments: appts.data ?? [],
        };
      },
    }),

    catalog_lookup: tool({
      description:
        "Product / medicine and service catalogue: product name, brand, category, MRP / selling price and current stock; service or treatment name, category and price. Non-financial reference data — available to every authorized ERP user.",
      inputSchema: z.object({
        query: z.string().optional().describe("Partial product or service name."),
        kind: z.enum(["product", "service", "both"]).optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, kind, limit }) => {
        if (!allowed(ctx, ROLE_SETS.any)) return deny(ROLE_SETS.any);
        const want = kind ?? "both";
        const cap = limit ?? 40;
        const out: Record<string, unknown> = {};
        if (want !== "service") {
          let q = ctx.supabase
            .from("inventory")
            .select("id, name, brand, company, category, sub_category, rate, stock, batch_no, expiry_date")
            .eq("active", true)
            .order("name")
            .limit(cap);
          if (query) q = q.ilike("name", `%${query}%`);
          const { data, error } = await q;
          if (error) return { error: error.message };
          out.products = (data ?? []).map((p) => ({
            name: p.name,
            brand: p.brand,
            company: p.company,
            category: p.category,
            sub_category: p.sub_category,
            mrp: num(p.rate),
            stock_available: num(p.stock),
            batch_no: p.batch_no,
            expiry_date: p.expiry_date,
          }));
        }
        if (want !== "product") {
          let q = ctx.supabase
            .from("services_master")
            .select("id, name, category, default_price, gst_rate, sessions, duration_minutes")
            .eq("active", true)
            .order("name")
            .limit(cap);
          if (query) q = q.ilike("name", `%${query}%`);
          const { data, error } = await q;
          if (error) return { error: error.message };
          out.services = (data ?? []).map((s) => ({
            name: s.name,
            category: s.category,
            price: num(s.default_price),
            gst_rate: num(s.gst_rate),
            sessions: s.sessions,
            duration_minutes: s.duration_minutes,
          }));
        }
        return out;
      },
    }),


    follow_up_queue: tool({
      description:
        "Current Follow-Up Desk queue: open follow-ups with assignee, due date and whether they are due today or overdue (including the 3-day re-trigger after the follow-up date).",
      inputSchema: z.object({ mine_only: z.boolean().optional(), limit: z.number().optional() }),
      execute: async ({ mine_only, limit }) => {
        if (!allowed(ctx, ROLE_SETS.marketing)) return deny(ROLE_SETS.marketing);
        let q = ctx.supabase
          .from("cos_follow_ups")
          .select("id, patient_name, patient_phone, trigger_reason, status, assigned_to, next_followup_at, expected_visit_date, last_contacted_at, notes, kind")
          .order("next_followup_at", { ascending: true })
          .limit(limit ?? 100);
        if (mine_only) q = q.eq("assigned_to", ctx.userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const rows = (data ?? []).map((f) => {
          const due = f.next_followup_at ? Date.parse(f.next_followup_at) : null;
          const overdueDays = due === null ? null : Math.floor((Date.now() - due) / 86400000);
          return {
            ...f,
            due_today: overdueDays === 0,
            overdue_days: overdueDays && overdueDays > 0 ? overdueDays : 0,
            retrigger_due: overdueDays !== null && overdueDays >= 3 && f.status !== "closed",
          };
        });
        return { count: rows.length, rows };
      },
    }),

    invoice_diagnostics: tool({
      description:
        "Read-only invoice integrity report: header vs line-total mismatches, GST split errors, invoices with no line items, paid/pending inconsistencies and duplicate invoice numbers. Reports only — never edits.",
      inputSchema: z.object({
        from: z.string().optional().describe("YYYY-MM-DD start date"),
        to: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ from, to, limit }) => {
        if (!canSeeFinance(ctx)) return FINANCE_DENIED;
        const start = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const end = to || todayIso();
        const { data: invs, error } = await ctx.supabase
          .from("invoices")
          .select("id, invoice_no, customer_name, invoice_date, base_amount, cgst, sgst, round_off, gross_total, paid_amount, pending_balance, discount_amount, voided_at")
          .gte("invoice_date", start)
          .lte("invoice_date", end)
          .is("voided_at", null)
          .order("invoice_date", { ascending: false })
          .limit(limit ?? 400);
        if (error) return { error: error.message };
        const ids = (invs ?? []).map((i) => i.id);
        const lineSum = new Map<string, number>();
        const lineCount = new Map<string, number>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: lines } = await ctx.supabase
            .from("invoice_lines")
            .select("invoice_id, line_total")
            .in("invoice_id", ids.slice(i, i + 200));
          for (const l of lines ?? []) {
            lineSum.set(l.invoice_id, (lineSum.get(l.invoice_id) ?? 0) + num(l.line_total));
            lineCount.set(l.invoice_id, (lineCount.get(l.invoice_id) ?? 0) + 1);
          }
        }
        const seenNo = new Map<string, number>();
        for (const inv of invs ?? []) {
          const k = inv.invoice_no ?? "";
          if (k) seenNo.set(k, (seenNo.get(k) ?? 0) + 1);
        }
        const issues: Record<string, unknown>[] = [];
        for (const inv of invs ?? []) {
          const problems: string[] = [];
          const sum = lineSum.get(inv.id) ?? 0;
          const cnt = lineCount.get(inv.id) ?? 0;
          if (cnt === 0) problems.push("no line items");
          else if (Math.abs(sum - num(inv.gross_total)) > 1)
            problems.push(`lines total ₹${r2(sum)} vs header ₹${r2(num(inv.gross_total))}`);
          if (Math.abs(num(inv.cgst) - num(inv.sgst)) > 0.05) problems.push("CGST and SGST are not equal");
          const expected = r2(num(inv.base_amount) + num(inv.cgst) + num(inv.sgst) + num(inv.round_off));
          if (Math.abs(expected - num(inv.gross_total)) > 1)
            problems.push(`base+GST+round-off ₹${expected} vs gross ₹${r2(num(inv.gross_total))}`);
          const bal = r2(num(inv.gross_total) - num(inv.paid_amount));
          if (Math.abs(bal - num(inv.pending_balance)) > 1)
            problems.push(`pending should be ₹${bal} but is ₹${r2(num(inv.pending_balance))}`);
          if (num(inv.paid_amount) > num(inv.gross_total) + 1) problems.push("paid exceeds bill total");
          if ((seenNo.get(inv.invoice_no ?? "") ?? 0) > 1) problems.push("duplicate invoice number");
          if (problems.length)
            issues.push({
              invoice_id: inv.id,
              invoice_no: inv.invoice_no,
              client: inv.customer_name,
              date: inv.invoice_date,
              gross: num(inv.gross_total),
              pending: num(inv.pending_balance),
              problems,
            });
        }
        return {
          scanned: (invs ?? []).length,
          from: start,
          to: end,
          issue_count: issues.length,
          issues: issues.slice(0, 60),
          note: "Corrections must be made through the ERP invoice Edit workflow, which re-validates and re-posts accounting entries.",
        };
      },
    }),

    inventory_diagnostics: tool({
      description:
        "Cross-check billed products/medicines against recorded stock movements to find missing, doubled or unexpected deductions. Products are direct sales and are never treated as consumed services.",
      inputSchema: z.object({ days: z.number().optional().describe("Look-back window, default 30 days.") }),
      execute: async ({ days }) => {
        if (!allowed(ctx, ROLE_SETS.inventory)) return deny(ROLE_SETS.inventory);
        const window = days ?? 30;
        const since = new Date(Date.now() - window * 86400000).toISOString().slice(0, 10);
        const idx = await catalogIndex(ctx);
        const { data: invs } = await ctx.supabase
          .from("invoices")
          .select("id, invoice_no, invoice_date")
          .gte("invoice_date", since)
          .is("voided_at", null)
          .limit(2000);
        const ids = (invs ?? []).map((i) => i.id);
        const billed = new Map<string, number>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: lines } = await ctx.supabase
            .from("invoice_lines")
            .select("invoice_id, description, item_category, qty")
            .in("invoice_id", ids.slice(i, i + 200));
          for (const l of lines ?? []) {
            if (lineCategory(l, idx) !== "product") continue;
            const k = norm(l.description);
            billed.set(k, (billed.get(k) ?? 0) + num(l.qty));
          }
        }
        const { data: items } = await ctx.supabase
          .from("inventory")
          .select("id, name, stock")
          .eq("active", true)
          .limit(3000);
        const byName = new Map((items ?? []).map((i) => [norm(i.name), i]));
        const { data: ledger } = await ctx.supabase
          .from("inventory_ledger")
          .select("inventory_id, quantity_change, created_at")
          .gte("created_at", `${since}T00:00:00Z`)
          .limit(5000);
        const moved = new Map<string, number>();
        for (const m of ledger ?? []) {
          const q = num(m.quantity_change);
          if (q >= 0) continue;
          moved.set(m.inventory_id, (moved.get(m.inventory_id) ?? 0) + Math.abs(q));
        }
        const findings: Record<string, unknown>[] = [];
        for (const [name, qty] of billed) {
          const item = byName.get(name);
          if (!item) {
            findings.push({ product: name, billed_qty: qty, issue: "billed product is not in the inventory master" });
            continue;
          }
          const deducted = moved.get(item.id) ?? 0;
          const diff = r2(deducted - qty);
          if (Math.abs(diff) >= 1) {
            findings.push({
              product: item.name,
              billed_qty: r2(qty),
              stock_deducted: r2(deducted),
              difference: diff,
              current_stock: num(item.stock),
              issue: diff > 0 ? "more stock removed than billed (possible double deduction)" : "billed quantity was not fully deducted from stock",
            });
          }
        }
        for (const item of items ?? []) {
          if (num(item.stock) < 0) findings.push({ product: item.name, current_stock: num(item.stock), issue: "negative stock" });
        }
        return { window_days: window, billed_products: billed.size, finding_count: findings.length, findings: findings.slice(0, 60) };
      },
    }),

    list_marketing_staff: tool({
      description: "Active staff members a follow-up can be assigned to, with their user ids.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!allowed(ctx, ROLE_SETS.marketing)) return deny(ROLE_SETS.marketing);
        const { data, error } = await ctx.supabase
          .from("staff")
          .select("user_id, name, role_title")
          .eq("active", true)
          .not("user_id", "is", null);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /* ---------------- Phase 2: actions ---------------- */

    schedule_follow_up: tool({
      description:
        "Create a Follow-Up Desk task for a client and, when an expected visit date is given, also book the matching appointment in the clinic calendar under the client's name. Duplicates are prevented automatically.",
      inputSchema: z.object({
        client_name: z.string(),
        phone: z.string().optional(),
        follow_up_date: z.string().describe("YYYY-MM-DD — when the caller should follow up."),
        expected_visit_date: z.string().optional().describe("YYYY-MM-DD — books the calendar appointment."),
        expected_visit_time: z.string().optional().describe("HH:MM 24h, default 10:00"),
        reason: z.string().optional(),
        notes: z.string().optional(),
        assign_to_user_id: z.string().optional().describe("Staff user id from list_marketing_staff."),
        service: z.string().optional(),
      }),
      execute: async (input) => {
        if (!allowed(ctx, ROLE_SETS.marketing)) return deny(ROLE_SETS.marketing);

        // Match on exact name first, then a name that STARTS with the query.
        // A bare %contains% match is deliberately avoided: "Amit" would
        // otherwise resolve to "Samita Ghosh" and file the task on the wrong
        // client. Anything less certain is returned for the user to confirm.
        const { data: cust } = await ctx.supabase
          .from("customers")
          .select("id, name, phone")
          .ilike("name", `%${input.client_name}%`)
          .limit(10);
        const q = norm(input.client_name);
        const rows = cust ?? [];
        const exact = rows.filter((c) => norm(c.name) === q);
        const prefix = rows.filter((c) => norm(c.name).startsWith(q) && norm(c.name) !== q);
        const pool = exact.length ? exact : prefix;

        if (pool.length > 1) {
          return {
            needs_confirmation: true,
            message: `Several clients match "${input.client_name}". Ask which one, then retry with the exact full name.`,
            candidates: pool.slice(0, 8).map((c) => ({ name: c.name, phone: c.phone })),
          };
        }
        if (pool.length === 0 && rows.length > 0) {
          return {
            needs_confirmation: true,
            message: `No client is named exactly "${input.client_name}". Ask the user to confirm the full name before the follow-up is created.`,
            candidates: rows.slice(0, 8).map((c) => ({ name: c.name, phone: c.phone })),
          };
        }

        const client = pool[0];
        const name = client?.name ?? input.client_name;
        const phone = input.phone ?? client?.phone ?? null;
        const sourceKey = `ai:${norm(name)}:${input.follow_up_date}`;

        const { data: existing } = await ctx.supabase
          .from("cos_follow_ups")
          .select("id, patient_name, next_followup_at, appointment_id")
          .eq("source_key", sourceKey)
          .maybeSingle();

        // The appointment is created FIRST so its id can go into the
        // follow-up INSERT. Reception can insert follow-ups but the RLS UPDATE
        // policy excludes them, so a post-insert link update would be silently
        // dropped and the follow-up would lose its calendar appointment.
        let appointment: Record<string, unknown> | null = null;
        const visitDate = input.expected_visit_date;
        if (visitDate) {
          const { data: dupe } = await ctx.supabase
            .from("appointments")
            .select("id, appointment_date, appointment_time")
            .ilike("customer_name", name)
            .eq("appointment_date", visitDate)
            .limit(1);
          if (dupe && dupe.length) {
            appointment = { ...dupe[0], reused: true };
          } else {
            const { data: appt, error: aErr } = await ctx.supabase
              .from("appointments")
              .insert({
                customer_name: name,
                phone,
                service_inquiry: input.service ?? input.reason ?? "Follow-up visit",
                appointment_date: visitDate,
                appointment_time: input.expected_visit_time ?? "10:00",
                status: "scheduled",
                notes: input.notes ?? "Booked from AI Manager follow-up",
              })
              .select("id, appointment_date, appointment_time")
              .maybeSingle();
            if (aErr) return { error: `Appointment could not be booked: ${aErr.message}` };
            appointment = appt ?? null;
          }
        }
        const appointmentId = (appointment?.["id"] as string | undefined) ?? null;

        let followUpId = existing?.id ?? null;
        if (!followUpId) {
          const { data: created, error } = await ctx.supabase
            .from("cos_follow_ups")
            .insert({
              patient_id: client?.id ?? null,
              patient_name: name,
              patient_phone: phone,
              trigger_reason: input.reason ?? "AI Manager follow-up",
              status: "pending",
              kind: "ai",
              source_key: sourceKey,
              notes: input.notes ?? null,
              next_followup_at: new Date(`${input.follow_up_date}T09:00:00`).toISOString(),
              expected_visit_date: input.expected_visit_date ?? null,
              assigned_to: input.assign_to_user_id ?? null,
              appointment_id: appointmentId,
            })
            .select("id")
            .maybeSingle();
          if (error) return { error: error.message, appointment_booked: appointmentId };
          followUpId = created?.id ?? null;
        } else {
          const { error: uErr } = await ctx.supabase
            .from("cos_follow_ups")
            .update({
              expected_visit_date: input.expected_visit_date ?? undefined,
              notes: input.notes ?? undefined,
              assigned_to: input.assign_to_user_id ?? undefined,
              appointment_id: appointmentId ?? undefined,
            })
            .eq("id", followUpId);
          if (uErr) {
            return {
              follow_up_id: followUpId,
              appointment,
              error: `A follow-up already exists for this client and date, and your role cannot edit it: ${uErr.message}`,
            };
          }
        }


        return {
          ok: true,
          follow_up_id: followUpId,
          reused_existing: Boolean(existing),
          client: name,
          phone,
          follow_up_date: input.follow_up_date,
          appointment,
          refresh: ["follow-ups", "appointments"],
        };
      },
    }),

    assign_follow_up: tool({
      description: "Assign an existing follow-up to a staff member (use list_marketing_staff for ids).",
      inputSchema: z.object({ follow_up_id: z.string(), assign_to_user_id: z.string() }),
      execute: async ({ follow_up_id, assign_to_user_id }) => {
        if (!allowed(ctx, ROLE_SETS.marketing)) return deny(ROLE_SETS.marketing);
        const { error } = await ctx.supabase
          .from("cos_follow_ups")
          .update({ assigned_to: assign_to_user_id })
          .eq("id", follow_up_id);
        if (error) return { error: error.message };
        return { ok: true, follow_up_id, refresh: ["follow-ups"] };
      },
    }),

    add_follow_up_note: tool({
      description: "Log a discussion note against a follow-up and optionally move its next follow-up date.",
      inputSchema: z.object({
        follow_up_id: z.string(),
        note: z.string(),
        outcome: z.string().optional(),
        next_followup_at: z.string().optional().describe("YYYY-MM-DD"),
      }),
      execute: async ({ follow_up_id, note, outcome, next_followup_at }) => {
        if (!allowed(ctx, ROLE_SETS.marketing)) return deny(ROLE_SETS.marketing);
        const nextIso = next_followup_at ? new Date(`${next_followup_at}T09:00:00`).toISOString() : null;
        const { error } = await ctx.supabase.from("cos_follow_up_notes").insert({
          follow_up_id,
          note,
          outcome: outcome ?? null,
          next_followup_at: nextIso,
          author_id: ctx.userId,
        });
        if (error) return { error: error.message };
        await ctx.supabase
          .from("cos_follow_ups")
          .update({
            last_contacted_at: new Date().toISOString(),
            ...(nextIso ? { next_followup_at: nextIso } : {}),
          })
          .eq("id", follow_up_id);
        return { ok: true, follow_up_id, refresh: ["follow-ups"] };
      },
    }),
  };
}
