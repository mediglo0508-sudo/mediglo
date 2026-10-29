import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePayment } from "@/lib/payment-parser";


// ---------- Types shared with UI ----------
export interface GapPriceRule {
  name: string;
  price: number;
  gapDays: number | null;
  durationMinutes: number | null;
}
export interface SaleRow {
  date: string; // yyyy-mm-dd
  name: string;
  phone: string;
  item: string;
  consult: number;
  amount: number;
  mode: string; // free text: "UPI", "Cash", "Cash+UPI", "Cash & UPI 5000+5000"
  pending: number;
  // optional pre-split payments [{mode, amount}]
  payments?: { mode: string; amount: number }[];
}

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

async function requireAdmin(ctx: { supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

// ================= PHASE 2: Gap/Price ingest =================
export const ingestGapPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rules: GapPriceRule[] }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin.from("services_master").select("id, name");
    const map = new Map<string, string>();
    for (const r of existing ?? []) map.set(String(r.name).trim().toLowerCase(), r.id);

    let updated = 0, created = 0;
    for (const rule of data.rules) {
      const key = rule.name.trim().toLowerCase();
      const id = map.get(key);
      const patch = {
        default_price: rule.price,
        gap_days: rule.gapDays ?? null,
        duration_minutes: rule.durationMinutes ?? null,
      };
      if (id) {
        const { error } = await supabaseAdmin.from("services_master").update(patch).eq("id", id);
        if (error) throw new Error(`Update ${rule.name}: ${error.message}`);
        updated++;
      } else {
        const { error } = await supabaseAdmin.from("services_master").insert({
          name: rule.name.trim(),
          category: "Service",
          sac_code: "999319",
          gst_rate: 5,
          cost_estimate: 0,
          active: true,
          ...patch,
        });
        if (error) throw new Error(`Insert ${rule.name}: ${error.message}`);
        created++;
      }
    }
    return { updated, created };
  });

// ================= PHASE 3: Sales ingest =================
export const ingestSalesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: SaleRow[]; sourceLabel?: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const warnings: string[] = [];

    // ---- Load masters once ----
    const [{ data: svcRows }, { data: invRows }] = await Promise.all([
      supabaseAdmin.from("services_master").select("id, name, sac_code, default_price, gap_days"),
      supabaseAdmin.from("inventory").select("id, name, stock, rate"),
    ]);
    const svcByName = new Map((svcRows ?? []).map((s) => [String(s.name).trim().toLowerCase(), s]));
    const invByName = new Map((invRows ?? []).map((i) => [String(i.name).trim().toLowerCase(), i]));

    const SERVICE_HINTS = /(peel|laser|lhr|hbot|iv\s*drip|drip|facial|exion|hifu|q\s*switch|exosome|dermafra|photo\s*facial|hydra|milk|profilo|kenacort|micro\s*needl|prp|nctf|skin\s*booster|botox|mounjaro|glow|comedone|wart|tag|dpn|mole|kenacort|hydrocort|scalp|beard|mag[- ]shape|red\s*light|cold\s*plunge|sauna|iv\b|scalp\s*exosome|photo\s*luxe|dermafrac|glass\s*skin|hifu|skin\s*tag|millia|package|pkg|session)/i;
    const PRODUCT_HINTS = /(cream|gel|serum|cap(sule)?\b|shampoo|spf|lotion|tablet|tab\b|moisturiz|sunscreen|mask|kit|conditioner|drops|drop|oint|face\s*wash|cleanser|drink|glutone|melarid|momate|nadibact|t\s*bact|akosma|azilight|oryza|aveil|trichospire|trichosphire|grogain|lactofyn|procalp|pinedruff|melano|minoveil|sorg|scar\s*kit|emusone|glutone|lacsoft|vit|serum|ascee?|cutiyt|skinfay|skin\s*fay)/i;

    // 3-stage matcher: exact (map hit) -> substring/token overlap -> Levenshtein <=2 on shortest.
    function lev(a: string, b: string): number {
      if (a === b) return 0;
      const m = a.length, n = b.length;
      if (!m) return n; if (!n) return m;
      let prev = new Array(n + 1).fill(0).map((_, i) => i);
      for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        prev = cur;
      }
      return prev[n];
    }
    function fuzzyServiceId(item: string): string | null {
      const key = item.trim().toLowerCase();
      const hit = svcByName.get(key);
      if (hit) return hit.id;
      // substring token match
      for (const [name, row] of svcByName) {
        if (name.length > 3 && (key.includes(name) || name.includes(key))) return row.id;
      }
      // fuzzy Levenshtein
      let best: { id: string; d: number } | null = null;
      for (const [name, row] of svcByName) {
        if (Math.abs(name.length - key.length) > 3) continue;
        const d = lev(name, key);
        if (d <= 2 && (!best || d < best.d)) best = { id: row.id, d };
      }
      return best?.id ?? null;
    }
    function classify(item: string): "service" | "product" {
      const key = item.trim().toLowerCase();
      if (svcByName.has(key)) return "service";
      if (invByName.has(key)) return "product";
      if (fuzzyServiceId(item)) return "service";
      if (SERVICE_HINTS.test(item)) return "service";
      if (PRODUCT_HINTS.test(item)) return "product";
      return "product";
    }


    // ---- Upsert customers by phone ----
    const phoneToRow = new Map<string, { name: string; phone: string }>();
    for (const r of data.rows) {
      const p = (r.phone || "").replace(/\D/g, "");
      if (p.length >= 10) {
        const p10 = p.slice(-10);
        if (!phoneToRow.has(p10)) phoneToRow.set(p10, { name: r.name, phone: p10 });
      }
    }
    // fetch existing
    const phoneList = [...phoneToRow.keys()];
    const custByPhone = new Map<string, string>();
    if (phoneList.length) {
      const { data: existingCust } = await supabaseAdmin.from("customers").select("id, phone").in("phone", phoneList);
      for (const c of existingCust ?? []) if (c.phone) custByPhone.set(c.phone, c.id);
    }
    const toCreate = [...phoneToRow.values()].filter((r) => !custByPhone.has(r.phone));
    if (toCreate.length) {
      const { data: created, error } = await supabaseAdmin.from("customers").insert(
        toCreate.map((c) => ({ name: c.name, phone: c.phone, state_code: "06", client_type: "Existing" })),
      ).select("id, phone");
      if (error) throw new Error(`Customer insert: ${error.message}`);
      for (const c of created ?? []) if (c.phone) custByPhone.set(c.phone, c.id);
    }

    // ---- Group rows by date + phone (or name if no phone) into invoices ----
    const groups = new Map<string, SaleRow[]>();
    for (const r of data.rows) {
      const p = (r.phone || "").replace(/\D/g, "").slice(-10);
      const key = `${r.date}|${p || r.name.toLowerCase()}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }

    let invoicesCreated = 0, linesCreated = 0, vouchersCreated = 0, autoScheduled = 0;
    let sumPendingSource = 0, sumPendingStored = 0;

    for (const [, rows] of groups) {
      const first = rows[0];
      const p10 = (first.phone || "").replace(/\D/g, "").slice(-10);
      const customerId = p10 ? custByPhone.get(p10) ?? null : null;

      // Build lines
      const linePayloads: Array<{ description: string; sac_code: string | null; qty: number; unit_price: number; base_amount: number; cgst: number; sgst: number; line_total: number; gstRate: number; kind: "service" | "product" | "consult"; inventoryId?: string | null }> = [];

      let invBase = 0, invCgst = 0, invSgst = 0, invGross = 0;

      for (const r of rows) {
        // Consult line
        if (r.consult > 0) {
          const gross = round2(r.consult);
          linePayloads.push({ description: r.item.match(/consult/i) ? r.item : "Dr. Consultation", sac_code: "999319", qty: 1, unit_price: gross, base_amount: gross, cgst: 0, sgst: 0, line_total: gross, gstRate: 0, kind: "consult" });
          invBase += gross; invGross += gross;
        }
        // Amount line (service or product)
        if (r.amount > 0) {
          const kind = classify(r.item);
          const svcId = kind === "service" ? fuzzyServiceId(r.item) : null;
          const svc = svcId ? (svcRows ?? []).find((s) => s.id === svcId) : null;
          const prod = kind === "product" ? invByName.get(r.item.trim().toLowerCase()) : null;
          if (kind === "service" && !svcId) warnings.push(`Unmatched service: "${r.item}" (${first.name})`);
          const gross = round2(r.amount);
          const rate = 5;
          const base = round2(gross / 1.05);
          const tax = round2(gross - base);
          const cgst = round2(tax / 2);
          const sgst = round2(tax - cgst);
          linePayloads.push({
            description: r.item,
            sac_code: kind === "service" ? (svc?.sac_code ?? "999319") : null,
            qty: 1, unit_price: gross, base_amount: base, cgst, sgst, line_total: gross, gstRate: rate, kind,
            inventoryId: prod?.id ?? null,
          });

          invBase += base; invCgst += cgst; invSgst += sgst; invGross += gross;
        }
      }

      if (invGross <= 0) continue;

      const pending = round2(rows.reduce((s, r) => s + (r.pending || 0), 0));
      sumPendingSource += pending;
      const paid = round2(invGross - pending);

      // Combine modes for invoice.payment_mode display
      const modes = new Set<string>();
      for (const r of rows) {
        if (r.payments && r.payments.length) r.payments.forEach((p) => modes.add(p.mode));
        else if (r.mode) modes.add(r.mode);
      }
      const modeLabel = [...modes].join(" + ") || "Cash";

      const { data: invIns, error: invErr } = await supabaseAdmin.from("invoices").insert({
        invoice_no: null, // trigger fills MG/26/NN
        customer_id: customerId, customer_name: first.name,
        invoice_date: first.date, state_code: "06", tax_mode: "inclusive",
        payment_mode: modeLabel,
        base_amount: round2(invBase), cgst: round2(invCgst), sgst: round2(invSgst),
        gross_total: round2(invGross), paid_amount: paid, pending_balance: pending,
        source: data.sourceLabel ?? "import",
      }).select("id, invoice_no, pending_balance").single();
      if (invErr) { warnings.push(`Invoice for ${first.name} ${first.date}: ${invErr.message}`); continue; }
      invoicesCreated++;
      sumPendingStored += Number(invIns.pending_balance ?? 0);

      // Lines
      const lineRows = linePayloads.map((l) => ({
        invoice_id: invIns.id, description: l.description, sac_code: l.sac_code,
        qty: l.qty, unit_price: l.unit_price, base_amount: l.base_amount,
        cgst: l.cgst, sgst: l.sgst, line_total: l.line_total,
      }));
      if (lineRows.length) {
        const { error: lErr } = await supabaseAdmin.from("invoice_lines").insert(lineRows);
        if (lErr) warnings.push(`Lines for ${invIns.invoice_no}: ${lErr.message}`);
        else linesCreated += lineRows.length;
      }

      // Product stock decrement
      for (const l of linePayloads) {
        if (l.kind === "product" && l.inventoryId) {
          const item = invRows?.find((i) => i.id === l.inventoryId);
          if (item) {
            const newStock = Number(item.stock) - 1;
            if (newStock < 0) warnings.push(`Stock underrun on "${l.description}"`);
            await supabaseAdmin.from("inventory").update({ stock: Math.max(0, newStock) }).eq("id", l.inventoryId);
            item.stock = Math.max(0, newStock);
          }
        }
      }

      // Vouchers for split payments (receipts)
      const splits: { mode: string; amount: number }[] = [];
      for (const r of rows) {
        if (r.payments && r.payments.length) splits.push(...r.payments);
      }
      if (splits.length > 1) {
        for (const s of splits) {
          if (s.amount <= 0) continue;
          const { data: v, error: vErr } = await supabaseAdmin.from("vouchers").insert({
            vtype: "receipt", vdate: first.date, party: first.name,
            narration: `Payment for invoice ${invIns.invoice_no} (${s.mode})`,
            amount: round2(s.amount), gst_rate: 0, cgst: 0, sgst: 0, payment_mode: s.mode,
          }).select("id").single();
          if (vErr) { warnings.push(`Voucher: ${vErr.message}`); continue; }
          await supabaseAdmin.from("voucher_entries").insert([
            { voucher_id: v.id, ledger: "Cash/Bank", debit: round2(s.amount), credit: 0 },
            { voucher_id: v.id, ledger: `Sales - ${first.name}`, debit: 0, credit: round2(s.amount) },
          ]);
          vouchersCreated++;
        }
      }

      // Auto-schedule sessions for package/service lines with gap_days
      for (const l of linePayloads) {
        if (l.kind !== "service") continue;
        const svc = svcByName.get(l.description.trim().toLowerCase());
        const gap = svc?.gap_days ?? null;
        if (!gap || !customerId) continue;
        // Detect session count e.g. "6 sessions" / "2 session" in description
        const m = l.description.match(/(\d+)\s*sess/i);
        const sessions = m ? Math.min(24, Math.max(2, Number(m[1]))) : 0;
        if (sessions <= 1) continue;
        const baseDate = new Date(first.date + "T00:00:00");
        for (let i = 1; i < sessions; i++) {
          const dt = new Date(baseDate); dt.setDate(dt.getDate() + i * gap);
          const y = dt.getFullYear(), mo = String(dt.getMonth()+1).padStart(2,"0"), da = String(dt.getDate()).padStart(2,"0");
          const { error } = await supabaseAdmin.from("cos_scheduled_sessions").insert({
            patient_id: customerId, session_number: i + 1, scheduled_date: `${y}-${mo}-${da}`,
            gap_days_applied: gap, status: "scheduled",
          });
          if (!error) autoScheduled++;
        }
      }
    }

    const pendingAccurate = Math.abs(sumPendingSource - sumPendingStored) < 0.5;

    return {
      customersUpserted: custByPhone.size,
      invoices: invoicesCreated,
      lines: linesCreated,
      vouchers: vouchersCreated,
      autoScheduled,
      pendingAccurate,
      sumPendingSource: round2(sumPendingSource),
      sumPendingStored: round2(sumPendingStored),
      warnings,
    };
  });

// ================= Import Review Queue helpers =================
type ReviewSource = "whatsapp" | "excel" | "master" | "manual";
async function pushReview(admin: { from: (t: string) => { insert: (v: unknown) => Promise<{ error: unknown }> } }, source: ReviewSource, kind: string, reason: string, raw: unknown) {
  try { await admin.from("import_review_queue").insert({ source, kind, reason, raw_payload: raw as never }); } catch { /* best-effort */ }
}

// ================= Service Price Master importer =================
export interface ServiceMasterRow {
  category?: string; name: string; type?: "service" | "package" | "product" | "medicine";
  price?: number; gstRate?: number; sessions?: number; gapDays?: number | null;
  autoFollowup?: boolean; autoAppointment?: boolean; consumables?: string; // "item x qty, item x qty"
}

export const ingestServiceMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: ServiceMasterRow[] }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("services_master").select("id, name");
    const svcIdx = new Map((existing ?? []).map((r) => [String(r.name).trim().toLowerCase(), r.id as string]));
    const { data: invRows } = await supabaseAdmin.from("inventory").select("id, name");
    const invIdx = new Map((invRows ?? []).map((r) => [String(r.name).trim().toLowerCase(), r.id as string]));

    let updated = 0, created = 0, unknownConsumables = 0, skipped = 0;
    for (const row of data.rows) {
      const name = String(row.name || "").trim();
      if (!name) { skipped++; continue; }

      // Parse consumables "Cotton x 2, Gauze x 1"
      const cons: Array<{ inventory_id: string; qty: number; name: string }> = [];
      if (row.consumables) {
        for (const part of row.consumables.split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
          const m = part.match(/^(.*?)\s*(?:x|\*|:)\s*(\d+(?:\.\d+)?)$/i);
          const itemName = (m ? m[1] : part).trim();
          const qty = m ? Number(m[2]) : 1;
          const id = invIdx.get(itemName.toLowerCase());
          if (id) cons.push({ inventory_id: id, qty, name: itemName });
          else { unknownConsumables++; await pushReview(supabaseAdmin as never, "master", "unknown_consumable", `Unknown consumable "${itemName}" for service "${name}"`, row); }
        }
      }

      const patch: Record<string, unknown> = {
        category: row.category ?? "General",
        default_price: Number(row.price ?? 0) || 0,
        gst_rate: Number(row.gstRate ?? 5) || 5,
        sessions: Math.max(1, Number(row.sessions ?? 1) || 1),
        gap_days: row.gapDays != null ? Number(row.gapDays) : null,
        auto_followup: row.autoFollowup !== false,
        auto_appointment: row.autoAppointment !== false,
        consumables: cons,
      };

      const existingId = svcIdx.get(name.toLowerCase());
      if (existingId) {
        const { error } = await supabaseAdmin.from("services_master").update(patch as never).eq("id", existingId);
        if (error) { await pushReview(supabaseAdmin as never, "master", "update_failed", error.message, row); skipped++; }
        else updated++;
      } else {
        const { error } = await supabaseAdmin.from("services_master").insert({ name, sac_code: "999319", active: true, cost_estimate: 0, ...patch } as never);
        if (error) { await pushReview(supabaseAdmin as never, "master", "insert_failed", error.message, row); skipped++; }
        else created++;
      }

    }
    return { updated, created, unknownConsumables, skipped };
  });

// ================= Gap Day Master importer =================
export interface GapMasterRow { name: string; gapDays: number | null; autoFollowup?: boolean; autoAppointment?: boolean; }

export const ingestGapMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: GapMasterRow[] }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("services_master").select("id, name");
    const idx = new Map((existing ?? []).map((r) => [String(r.name).trim().toLowerCase(), r.id as string]));
    let updated = 0, unknown = 0;
    for (const row of data.rows) {
      const id = idx.get(String(row.name || "").trim().toLowerCase());
      if (!id) { unknown++; await pushReview(supabaseAdmin as never, "master", "unknown_service", `Gap row for unknown service "${row.name}"`, row); continue; }
      const patch: Record<string, unknown> = {
        gap_days: row.gapDays != null ? Number(row.gapDays) : null,
        auto_followup: row.autoFollowup !== false,
        auto_appointment: row.autoAppointment !== false,
      };
      const { error } = await supabaseAdmin.from("services_master").update(patch as never).eq("id", id);

      if (error) await pushReview(supabaseAdmin as never, "master", "update_failed", error.message, row);
      else updated++;
    }
    return { updated, unknown };
  });

// ================= WhatsApp Full-Text Parser (server) =================
type ParsedItem = { kind: "consultation" | "service" | "treatment" | "package" | "product" | "medicine" | "procedure" | "test"; description: string; price: number; qty: number; isComplimentary: boolean; };
type ParsedRecord = { date: string; name: string; phone: string; items: ParsedItem[]; paymentText: string; pending: number; };

const CAT_KEYS: Array<{ label: string; kind: ParsedItem["kind"] }> = [
  { label: "consultation", kind: "consultation" },
  { label: "appointment", kind: "consultation" },
  { label: "opd", kind: "consultation" },
  { label: "treatment", kind: "treatment" },
  { label: "service", kind: "service" },
  { label: "package", kind: "package" },
  { label: "procedure", kind: "procedure" },
  { label: "test", kind: "test" },
  { label: "product", kind: "product" },
  { label: "medicine", kind: "medicine" },
  { label: "complimentary", kind: "service" },
];

function normDate(raw: string): string {
  const s = raw.trim();
  const m = s.match(/(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?/);
  if (m) {
    const d = m[1].padStart(2, "0"); const mo = m[2].padStart(2, "0");
    let y = m[3] ?? String(new Date().getFullYear());
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  return "";
}
function extractPhone(s: string): string { const m = String(s).replace(/\D/g, ""); return m.length >= 10 ? m.slice(-10) : ""; }
function extractAmount(s: string): number { const m = s.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*\/?-?/i); return m ? Number(m[1].replace(/,/g, "")) : 0; }

export function parseWhatsappText(text: string): ParsedRecord[] {
  const raw = String(text || "").replace(/\r/g, "");
  const lines = raw.split(/\n/);
  const records: ParsedRecord[] = [];
  let activeDate = "";
  let cur: ParsedRecord | null = null;
  let activeCat: ParsedItem["kind"] | null = null;

  const startNew = (name: string) => {
    if (cur) records.push(cur);
    cur = { date: activeDate, name: name.trim(), phone: "", items: [], paymentText: "", pending: 0 };
    activeCat = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { activeCat = null; continue; }
    const lower = line.toLowerCase();

    // Global date header (persists until next Date: line)
    const dm = line.match(/^date\s*[:.-]\s*(.+)$/i);
    if (dm) { const nd = normDate(dm[1]); if (nd) activeDate = nd; continue; }

    // Start of a customer record
    const nm = line.match(/^name\s*[:.-]\s*(.+)$/i);
    if (nm) { startNew(nm[1]); continue; }
    if (!cur) continue;

    // Contact
    const ph = line.match(/^(contact|phone|mobile|number)\s*[:.-]\s*(.+)$/i);
    if (ph) { (cur as ParsedRecord).phone = extractPhone(ph[2]); continue; }

    // Payment / pending
    if (/^(payment|paid|received|price|amount|collected|mode)\b/i.test(line)) {
      (cur as ParsedRecord).paymentText = line.replace(/^[^:.-]+[:.-]\s*/, "").trim() || line;
      continue;
    }
    if (/^pending\b/i.test(line) || /pending/i.test(line)) {
      const a = extractAmount(line);
      if (a) (cur as ParsedRecord).pending = a;
      if (/pending/i.test(line) && !(cur as ParsedRecord).paymentText) (cur as ParsedRecord).paymentText = line;
      continue;
    }

    // Category label (may be inline "Treatment: Hydra Facial" or bare "Product:")
    const catM = line.match(/^([a-z ]+?)\s*[:.-]\s*(.*)$/i);
    if (catM) {
      const catLabel = catM[1].trim().toLowerCase();
      const catHit = CAT_KEYS.find((k) => catLabel === k.label || catLabel.endsWith(" " + k.label) || catLabel.startsWith(k.label + " ") || catLabel.includes(k.label));
      if (catHit) {
        activeCat = catHit.kind;
        const remainder = catM[2].trim();
        if (remainder) {
          // Inline single item on same line
          const price = extractAmount(remainder);
          const isComp = /complim|free/i.test(catLabel) || /complim|free/i.test(remainder);
          const desc = remainder.replace(/(?:₹|rs\.?|inr)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*\/?-?/i, "").replace(/^\s*[-•*]\s*/, "").trim() || remainder;
          (cur as ParsedRecord).items.push({ kind: activeCat, description: desc, price: isComp ? 0 : price, qty: 1, isComplimentary: isComp });
        }
        continue;
      }
    }

    // Continuation under an active category (bullet, dash, or bare line)
    if (activeCat) {
      const cleaned = line.replace(/^[-•*]\s*/, "").trim();
      if (!cleaned) continue;
      const price = extractAmount(cleaned);
      const isComp = /complim|free/i.test(cleaned);
      const desc = cleaned.replace(/(?:₹|rs\.?|inr)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*\/?-?/i, "").trim() || cleaned;
      (cur as ParsedRecord).items.push({ kind: activeCat, description: desc, price: isComp ? 0 : price, qty: 1, isComplimentary: isComp });
      continue;
    }

    // Fallback: line looks like "Something 1500 UPI"
    const inlineAmt = extractAmount(line);
    if (inlineAmt && /[a-z]/i.test(line)) {
      (cur as ParsedRecord).items.push({ kind: "service", description: line.replace(/(?:₹|rs\.?|inr)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*\/?-?/i, "").trim() || line, price: inlineAmt, qty: 1, isComplimentary: false });
    }
  }
  if (cur) records.push(cur);
  return records.filter((r) => r.name && (r.items.length || r.paymentText));
}

// ================= WhatsApp full-text ingest (POS-parity writer) =================
export const ingestWhatsappText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; sourceLabel?: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const records = parseWhatsappText(data.text);
    const summary = { records: records.length, imported: 0, updated: 0, skipped: 0, failed: 0, reviewIds: [] as string[], warnings: [] as string[] };

    // Load masters once
    const [{ data: svcRows }, { data: invRows }] = await Promise.all([
      supabaseAdmin.from("services_master").select("id, name, sac_code, default_price, gap_days, gst_rate, auto_appointment, sessions"),
      supabaseAdmin.from("inventory").select("id, name, stock, rate"),
    ]);
    const svcByName = new Map((svcRows ?? []).map((s) => [String(s.name).trim().toLowerCase(), s]));
    const invByName = new Map((invRows ?? []).map((i) => [String(i.name).trim().toLowerCase(), i]));

    function lev(a: string, b: string): number {
      if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
      let prev = new Array(n + 1).fill(0).map((_, i) => i);
      for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) { const cost = a[i-1] === b[j-1] ? 0 : 1; cur[j] = Math.min(cur[j-1]+1, prev[j]+1, prev[j-1]+cost); } prev = cur; }
      return prev[n];
    }
    function matchIn(map: Map<string, { id: string; name?: string }>, item: string): { id: string; name?: string } | null {
      const key = item.trim().toLowerCase(); if (!key) return null;
      const exact = map.get(key); if (exact) return exact;
      // token overlap
      const kt = new Set(key.split(/\s+/).filter((w) => w.length > 2));
      let best: { row: { id: string; name?: string }; score: number } | null = null;
      for (const [n, row] of map) {
        const nt = new Set(n.split(/\s+/).filter((w) => w.length > 2));
        let s = 0; for (const t of kt) if (nt.has(t)) s++;
        if (s >= 2 && (!best || s > best.score)) best = { row, score: s };
      }
      if (best) return best.row;
      // levenshtein <= 2
      let win: { row: { id: string; name?: string }; d: number } | null = null;
      for (const [n, row] of map) { if (Math.abs(n.length - key.length) > 3) continue; const d = lev(n, key); if (d <= 2 && (!win || d < win.d)) win = { row, d }; }
      return win?.row ?? null;
    }

    for (const rec of records) {
      try {
        // ---- resolve customer (phone -> name -> insert) ----
        let customerId: string | null = null;
        if (rec.phone) {
          const { data: existing } = await supabaseAdmin.from("customers").select("id, name, outstanding_balance").eq("phone", rec.phone).maybeSingle();
          if (existing) customerId = existing.id as string;
        }
        if (!customerId && rec.name) {
          const { data: byName } = await supabaseAdmin.from("customers").select("id").ilike("name", rec.name).limit(2);
          if (byName && byName.length === 1) customerId = byName[0].id as string;
          else if (byName && byName.length > 1) { await pushReview(supabaseAdmin as never, "whatsapp", "ambiguous_customer", `Multiple customers named ${rec.name}`, rec); summary.skipped++; continue; }
        }
        if (!customerId) {
          const { data: created, error } = await supabaseAdmin.from("customers").insert({ name: rec.name, phone: rec.phone || null, state_code: "06", client_type: "Existing" }).select("id").single();
          if (error) { await pushReview(supabaseAdmin as never, "whatsapp", "customer_insert_failed", error.message, rec); summary.failed++; continue; }
          customerId = created.id as string;
        }

        // ---- resolve line items ----
        const lines: Array<{ description: string; sac: string | null; qty: number; unit_price: number; base: number; cgst: number; sgst: number; gross: number; inventory_id?: string | null; is_service: boolean; is_package: boolean; gap: number | null; sessions: number; }> = [];
        let anyUnknown = false;

        for (const it of rec.items) {
          const isProduct = it.kind === "product" || it.kind === "medicine";
          const svc = !isProduct ? matchIn(svcByName as never, it.description) as { id: string; sac_code?: string; gap_days?: number | null; sessions?: number } | null : null;
          const prod = isProduct ? matchIn(invByName as never, it.description) as { id: string } | null : null;
          if (!svc && !prod) {
            anyUnknown = true;
            await pushReview(supabaseAdmin as never, "whatsapp", `unknown_${it.kind}`, `Could not match "${it.description}" (${it.kind})`, { rec, item: it });
            continue;
          }
          const gross = round2(it.price);
          const rate = 5;
          const base = gross > 0 ? round2(gross / (1 + rate/100)) : 0;
          const tax = round2(gross - base);
          const cgst = round2(tax / 2);
          const sgst = round2(tax - cgst);
          lines.push({
            description: it.description, sac: svc?.sac_code ?? null, qty: it.qty || 1,
            unit_price: gross, base, cgst, sgst, gross,
            inventory_id: prod?.id ?? null, is_service: !!svc, is_package: it.kind === "package",
            gap: svc?.gap_days ?? null, sessions: svc?.sessions ?? 1,
          });
        }

        if (!lines.length) { summary.skipped++; continue; }

        const invBase = lines.reduce((a, l) => a + l.base, 0);
        const invCgst = lines.reduce((a, l) => a + l.cgst, 0);
        const invSgst = lines.reduce((a, l) => a + l.sgst, 0);
        const invGross = lines.reduce((a, l) => a + l.gross, 0);

        // ---- payment parse ----
        const parsed = parsePayment(rec.paymentText || "", invGross);
        const pending = round2(rec.pending || parsed.pending || Math.max(0, invGross - parsed.splits.reduce((a, s) => a + s.amount, 0)));
        const paid = round2(invGross - pending);
        const modeLabel = parsed.splits.length ? parsed.splits.map((s) => s.mode).join(" + ") : (parsed.label || "Cash");

        // ---- invoice + lines ----
        const { data: invIns, error: invErr } = await supabaseAdmin.from("invoices").insert({
          invoice_no: null, customer_id: customerId, customer_name: rec.name,
          invoice_date: rec.date || new Date().toISOString().slice(0,10), state_code: "06", tax_mode: "inclusive",
          payment_mode: modeLabel, base_amount: round2(invBase), cgst: round2(invCgst), sgst: round2(invSgst),
          gross_total: round2(invGross), paid_amount: paid, pending_balance: pending, source: data.sourceLabel ?? "whatsapp-text",
        }).select("id, invoice_no").single();
        if (invErr) { await pushReview(supabaseAdmin as never, "whatsapp", "invoice_insert_failed", invErr.message, rec); summary.failed++; continue; }

        await supabaseAdmin.from("invoice_lines").insert(lines.map((l) => ({
          invoice_id: invIns.id, description: l.description, sac_code: l.sac,
          qty: l.qty, unit_price: l.unit_price, base_amount: l.base, cgst: l.cgst, sgst: l.sgst, line_total: l.gross,
        })));

        // ---- vouchers ----
        for (const s of parsed.splits) {
          if (s.amount <= 0) continue;
          const { data: v } = await supabaseAdmin.from("vouchers").insert({
            vtype: "receipt", vdate: rec.date || new Date().toISOString().slice(0,10), party: rec.name,
            narration: `Receipt for ${invIns.invoice_no} (${s.mode})`, amount: round2(s.amount),
            gst_rate: 0, cgst: 0, sgst: 0, payment_mode: s.mode,
          }).select("id").single();
          if (v) await supabaseAdmin.from("voucher_entries").insert([
            { voucher_id: v.id, ledger: `Cash/Bank (${s.mode})`, debit: round2(s.amount), credit: 0 },
            { voucher_id: v.id, ledger: `${rec.name} (Debtors)`, debit: 0, credit: round2(s.amount) },
          ]);
        }

        // ---- inventory decrement ----
        for (const l of lines) {
          if (l.inventory_id) {
            const item = (invRows ?? []).find((i) => i.id === l.inventory_id);
            if (item) {
              const ns = Math.max(0, Number(item.stock) - l.qty);
              await supabaseAdmin.from("inventory").update({ stock: ns }).eq("id", l.inventory_id);
              item.stock = ns;
            }
          }
        }

        // ---- outstanding balance ----
        if (pending > 0) {
          const { data: cust } = await supabaseAdmin.from("customers").select("outstanding_balance").eq("id", customerId).single();
          const cur = Number(cust?.outstanding_balance ?? 0);
          await supabaseAdmin.from("customers").update({ outstanding_balance: round2(cur + pending) }).eq("id", customerId);
        }

        // ---- package enrollment ----
        for (const l of lines) {
          if (l.is_package && l.sessions > 1) {
            await supabaseAdmin.from("cos_treatment_packages").insert({
              patient_id: customerId, package_name: l.description,
              total_sessions: l.sessions, sessions_remaining: l.sessions,
              purchase_date: rec.date || new Date().toISOString().slice(0,10),
              status: "active",
            } as never);

          }
        }

        summary.imported++;
        if (anyUnknown) summary.warnings.push(`${rec.name}: partial import (some items in review queue)`);
      } catch (e) {
        summary.failed++;
        const msg = e instanceof Error ? e.message : "unknown";
        await pushReview(supabaseAdmin as never, "whatsapp", "exception", msg, rec);
      }
    }

    return summary;
  });

// ================= Preview parser (client-safe wrapper) =================
export const previewWhatsappText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string }) => d)
  .handler(async ({ data }) => ({ records: parseWhatsappText(data.text) }));
