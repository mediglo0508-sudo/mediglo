import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizePaymentMode } from "@/lib/constants";
import { computeTax, round2, inr2 } from "@/lib/gst";
import { toast } from "sonner";
import { UploadCloud, Loader2, MessageSquareText, FileSpreadsheet, ScanText, Package, CalendarClock, Boxes } from "lucide-react";
import { InventoryImportWizard } from "@/components/inventory-import/InventoryImportWizard";
import { useServerFn } from "@tanstack/react-start";
import { ingestSalesBatch, ingestServiceMaster, ingestGapMaster, ingestWhatsappText, type SaleRow, type ServiceMasterRow, type GapMasterRow } from "@/lib/ingest.functions";



export const Route = createFileRoute("/_authenticated/ingest")({
  head: () => ({
    meta: [
      { title: "Data Ingestion — MGHYN Clinic ERP" },
      { name: "description", content: "Import historical sales and appointment data with quality checks." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Data Ingestion — MGHYN Clinic ERP" },
      { property: "og:description", content: "Import historical sales and appointment data with quality checks." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/ingest" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/ingest" }],
  }),
  component: IngestPage,
});

interface ParsedRow { date: string; clientType: string; name: string; phone: string; service: string; consult: number; service_amt: number; medicine: number; pending: number; mode: string; }
interface PasteRow { date: string; clientType: string; name: string; service: string; consult: number; amount: number; medicine: number; mode: string; phone: string; pending: number; }
interface OcrResult { invoice_no: string; gstin: string; company: string; date: string; amount: number; raw: string; }

const DIRECT_MEDICINE = "Direct Product/Medicine Sale";

function num(v: unknown) { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }

// Force phone-like values to a raw string; never let Excel coerce to scientific notation.
function phoneStr(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (typeof v === "number") {
    // Excel may hand us 9.810888222e9 — expand via toFixed and strip trailing zeros
    s = Number.isInteger(v) ? v.toFixed(0) : String(v);
  } else {
    s = String(v);
  }
  s = s.replace(/[^0-9]/g, "");
  return s.length >= 10 && s.length <= 15 ? s : s;
}

// Format a JS Date in LOCAL time as YYYY-MM-DD (no UTC round-trip, no ±1-day shift)
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Pull the first ₹ / numeric amount out of a free-text line
function amountIn(line: string): number {
  const m = line.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  return m ? num(m[1]) : 0;
}

// ---- Build invoice records shared by both engines (Dr.Consultation 0% exempt + service/medicine 5% inclusive) ----
function buildInvoiceRecord(opts: { date: string; name: string; customerId: string | null; consult: number; service: number; pending: number; mode: string }) {
  const consult = round2(opts.consult);
  const service = round2(opts.service);
  const gross = round2(consult + service);
  const ct = computeTax(consult, "inclusive", 0);
  const st = computeTax(service, "inclusive", 5);
  return {
    invoice_no: `IMP-${opts.date || ""}-${Math.random().toString(36).slice(2, 7)}`,
    customer_id: opts.customerId, customer_name: opts.name,
    invoice_date: opts.date || fmtLocalDate(new Date()), state_code: "06",
    tax_mode: "inclusive" as const, payment_mode: opts.mode,
    base_amount: round2(ct.base + st.base), cgst: round2(ct.cgst + st.cgst),
    sgst: round2(ct.sgst + st.sgst), gross_total: gross,
    paid_amount: round2(gross - opts.pending), pending_balance: round2(opts.pending), source: "import",
  };
}

async function ensureCustomers(names: { name: string; clientType?: string; phone?: string }[]) {
  const unique = [...new Map(names.map((n) => [n.name.toLowerCase(), n])).values()];
  const { data: existing } = await supabase.from("customers").select("id, name");
  const map = new Map((existing ?? []).map((c) => [c.name.toLowerCase(), c.id]));
  const toCreate = unique.filter((n) => !map.has(n.name.toLowerCase()));
  if (toCreate.length) {
    const { data: created } = await supabase.from("customers").insert(
      toCreate.map((n) => ({ name: n.name, state_code: "06", client_type: n.clientType || "Existing", phone: n.phone || null })),
    ).select("id, name");
    for (const c of created ?? []) map.set(c.name.toLowerCase(), c.id);
  }
  return map;
}

// Normalise common date formats (dd/mm/yyyy, dd-mm-yy, dd.mm) → ISO yyyy-mm-dd
function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?/);
  if (m) {
    const d = m[1].padStart(2, "0"); const mo = m[2].padStart(2, "0");
    let y = m[3] ?? String(new Date().getFullYear());
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  return "";
}

// ===================== WhatsApp Daily Report parser =====================
// Schema: Date, Client Type, Name, Service, Dr. Consultation, Paid For Service, Medicine, Pending Balance, Mode of Payment
function parseWhatsApp(text: string): PasteRow[] {
  const lines = text.split(/\r?\n/);
  const rows: PasteRow[] = [];
  let cur: Partial<PasteRow> | null = null;
  const flush = () => {
    if (cur && cur.name) {
      rows.push({
        date: cur.date || new Date().toISOString().slice(0, 10),
        clientType: (cur.clientType ?? "Existing").trim(),
        name: cur.name.trim(), service: (cur.service ?? "").trim(),
        consult: cur.consult ?? 0,
        amount: cur.amount ?? 0, medicine: cur.medicine ?? 0,
        mode: normalizePaymentMode(cur.mode), phone: (cur.phone ?? "").trim(), pending: cur.pending ?? 0,
      });
    }
    cur = null;
  };
  const val = (line: string) => line.split(/[:：]\s*-?\s*|-\s/).slice(1).join(":").trim() || line.split(/[:：]/).slice(1).join(":").replace(/^-\s*/, "").trim();
  // Detect payment mode keyword anywhere in a line
  const detectMode = (lower: string): string | null => {
    if (/\bupi\b|gpay|google\s?pay|phonepe|paytm/i.test(lower)) return "UPI";
    if (/\bcash\b/i.test(lower)) return "Cash";
    if (/\bcard\b|swipe|pos/i.test(lower)) return "Card";
    if (/\bbank\b|neft|imps|rtgs|transfer/i.test(lower)) return "Bank Transfer";
    return null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (/^name\b/i.test(lower)) { flush(); cur = { name: val(line) }; continue; }
    if (!cur) continue;
    if (/^date\b/i.test(lower)) cur.date = normalizeDate(val(line));
    else if (/^(client\s*type|type)\b/i.test(lower)) cur.clientType = val(line);
    else if (/^(treatment|appointment|package|service)/i.test(lower)) cur.service = val(line);
    else if (/^(dr\.?\s*consult|doctor\s*consult|consultation)/i.test(lower)) cur.consult = amountIn(val(line));
    else if (/^(medicine|product|pharmacy)/i.test(lower)) cur.medicine = amountIn(val(line));
    else if (/pending|balance|due/i.test(lower)) cur.pending = amountIn(line);
    else if (/^mode/i.test(lower)) cur.mode = val(line);
    else if (/^(contact|phone|mobile|number)/i.test(lower)) cur.phone = val(line);
    else if (/(paid|received|payment|price|amount|collected)/i.test(lower)) {
      // Capture amount + infer mode from keywords like UPI / Cash
      cur.amount = amountIn(line);
      const inferred = detectMode(lower);
      if (inferred && !cur.mode) cur.mode = inferred;
    } else {
      // Loose fallback: bare line containing a mode keyword + amount
      const inferred = detectMode(lower);
      if (inferred) { if (!cur.mode) cur.mode = inferred; if (!cur.amount) cur.amount = amountIn(line); }
    }
  }
  flush();
  return rows;
}

// ===================== OCR engine (invoices: PDF/image) =====================
async function ocrExtract(file: File): Promise<OcrResult> {
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(file, "eng");
  const raw = data.text || "";
  const inv = raw.match(/invoice\s*(?:no|number|#)?\s*[:.#-]*\s*([A-Z0-9/\-]{3,})/i);
  const gst = raw.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1})\b/i);
  const dateM = raw.match(/(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/);
  const totalM = raw.match(/(?:grand\s*total|total|amount\s*payable)\s*[:.]*\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  // Company name: first non-empty line that isn't a label/number
  const company = (raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 3 && !/invoice|gstin|tax|date|bill|total/i.test(l) && /[a-z]/i.test(l))) ?? "";
  return {
    invoice_no: inv?.[1]?.trim() ?? "",
    gstin: gst?.[1]?.toUpperCase() ?? "",
    company: company.trim(),
    date: dateM ? normalizeDate(dateM[1]) : "",
    amount: totalM ? num(totalM[1]) : 0,
    raw,
  };
}



interface IngestQA { updated?: number; created?: number; customersUpserted?: number; invoices?: number; lines?: number; vouchers?: number; autoScheduled?: number; pendingAccurate?: boolean; sumPendingSource?: number; sumPendingStored?: number; warnings?: string[]; label: string; }

function IngestPage() {
  const ingestSales = useServerFn(ingestSalesBatch);
  const ingestSvc = useServerFn(ingestServiceMaster);
  const ingestGap = useServerFn(ingestGapMaster);
  const ingestWa = useServerFn(ingestWhatsappText);
  const [qa, setQa] = useState<IngestQA | null>(null);
  const { isFinance } = useAuth();

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [pasteRows, setPasteRows] = useState<PasteRow[]>([]);
  const [processing, setProcessing] = useState(false);

  const [waText, setWaText] = useState("");
  const [waBusy, setWaBusy] = useState(false);
  const [waResult, setWaResult] = useState<{ records: number; imported: number; skipped: number; failed: number; warnings: string[] } | null>(null);

  const [svcFile, setSvcFile] = useState(""); const [svcRows, setSvcRows] = useState<ServiceMasterRow[]>([]); const [svcBusy, setSvcBusy] = useState(false);
  const [gapFile, setGapFile] = useState(""); const [gapRows, setGapRows] = useState<GapMasterRow[]>([]); const [gapBusy, setGapBusy] = useState(false);

  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [ocrName, setOcrName] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);

  async function submitWhatsapp() {
    if (!waText.trim()) return;
    setWaBusy(true); setWaResult(null);
    try {
      const res = await ingestWa({ data: { text: waText, sourceLabel: "whatsapp-fulltext" } });
      setWaResult(res);
      toast.success(`Parsed ${res.records}, imported ${res.imported}${res.failed ? `, ${res.failed} in review queue` : ""}`);
      if (res.imported > 0) setWaText("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    finally { setWaBusy(false); }
  }

  function parseMasterSheet<T>(file: File, mapRow: (r: Record<string, unknown>) => T | null): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
          const out: T[] = [];
          for (const r of rows) { const m = mapRow(r); if (m) out.push(m); }
          resolve(out);
        } catch (e) { reject(e); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  const key = (r: Record<string, unknown>, ...ks: string[]) => {
    const lower = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().trim(), v]));
    for (const k of ks) { const v = lower[k.toLowerCase()]; if (v != null && String(v).trim() !== "") return v; }
    return "";
  };

  async function handleSvcFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setSvcFile(file.name);
    const out = await parseMasterSheet<ServiceMasterRow>(file, (r) => {
      const name = String(key(r, "name", "service name", "service", "item", "package name") || "").trim();
      if (!name) return null;
      return {
        name,
        category: String(key(r, "category", "cat", "type of service") || "") || undefined,
        type: (String(key(r, "type") || "").toLowerCase() as ServiceMasterRow["type"]) || undefined,
        price: num(key(r, "price", "rate", "amount")),
        gstRate: num(key(r, "gst", "gst%", "gst rate")) || 5,
        sessions: num(key(r, "sessions", "session count", "no of sessions")) || 1,
        gapDays: num(key(r, "gap days", "gap", "interval days")) || null,
        autoFollowup: String(key(r, "auto follow-up", "auto followup") || "y").toLowerCase().startsWith("y"),
        autoAppointment: String(key(r, "auto appointment") || "y").toLowerCase().startsWith("y"),
        consumables: String(key(r, "consumables", "consumable") || "") || undefined,
      };
    });
    setSvcRows(out);
    toast.success(`Parsed ${out.length} service rows`);
  }
  async function importSvcMaster() {
    if (!svcRows.length) return;
    setSvcBusy(true);
    try {
      const res = await ingestSvc({ data: { rows: svcRows } });
      setQa({ label: "Service Price Master", ...res });
      toast.success(`Master: ${res.created} created, ${res.updated} updated${res.unknownConsumables ? `, ${res.unknownConsumables} unknown consumables → review queue` : ""}`);
      setSvcRows([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSvcBusy(false); }
  }

  async function handleGapFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setGapFile(file.name);
    const out = await parseMasterSheet<GapMasterRow>(file, (r) => {
      const name = String(key(r, "service name", "name", "service", "package") || "").trim();
      if (!name) return null;
      return {
        name,
        gapDays: num(key(r, "gap days", "gap between sessions", "gap", "interval days")) || null,
        autoFollowup: String(key(r, "auto follow-up", "auto followup") || "y").toLowerCase().startsWith("y"),
        autoAppointment: String(key(r, "auto appointment") || "y").toLowerCase().startsWith("y"),
      };
    });
    setGapRows(out);
    toast.success(`Parsed ${out.length} gap rows`);
  }
  async function importGapMaster() {
    if (!gapRows.length) return;
    setGapBusy(true);
    try {
      const res = await ingestGap({ data: { rows: gapRows } });
      setQa({ label: "Gap Day Master", ...res });
      toast.success(`Gap: ${res.updated} updated${res.unknown ? `, ${res.unknown} unknown → review queue` : ""}`);
      setGapRows([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setGapBusy(false); }
  }


  async function handleOcr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setOcrName(file.name); setOcr(null); setOcrBusy(true);
    try {
      const res = await ocrExtract(file);
      setOcr(res);
      toast.success(`OCR read: Invoice ${res.invoice_no || "—"} · ${res.company || "Company —"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OCR failed");
    } finally { setOcrBusy(false); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

      // ---- Smart Header Scanner: locate the real header row within the first 5 rows ----
      const ANCHORS = ["date", "name", "client", "patient", "service", "treatment", "mode", "payment", "paid", "medicine", "pending", "balance"];
      const scoreRow = (r: unknown[]) =>
        !Array.isArray(r) ? 0 : r.reduce<number>((acc, c) => acc + (ANCHORS.some((a) => String(c ?? "").trim().toLowerCase().includes(a)) ? 1 : 0), 0);
      let hi = 0, best = 0;
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        const s = scoreRow(raw[i]);
        if (s > best) { best = s; hi = i; }
      }
      if (best < 2) hi = 0; // couldn't confidently detect — fall back to first row

      const header = (raw[hi] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
      // Fuzzy column locator: first header cell containing any of the given keywords.
      const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      const ci = {
        date: find("date"),
        type: find("client type", "customer type"),
        name: find("patient name", "customer name", "client name", "name", "client", "patient"),
        service: find("service name", "service", "treatment", "package"),
        consult: find("consult", "doctor"),
        paidService: find("paid for service", "service amount", "paid service", "amount received", "collected", "received", "amount"),
        medicine: find("medicine", "product", "pharmacy"),
        pending: find("pending", "balance", "outstanding", "due"),
        mode: find("mode of payment", "payment mode", "mode", "payment"),
        phone: find("phone", "mobile", "contact", "number"),
      };

      const out: ParsedRow[] = [];
      const seen = new Set<string>();
      for (let i = hi + 1; i < raw.length; i++) {
        const r = raw[i]; if (!Array.isArray(r)) continue;
        const name = ci.name >= 0 ? String(r[ci.name] ?? "").trim() : "";
        if (!name || name.toLowerCase() === "total" || name.toLowerCase() === "grand total") continue;
        let dateStr = "";
        const dv = ci.date >= 0 ? r[ci.date] : undefined;
        if (dv instanceof Date) dateStr = fmtLocalDate(dv);
        else if (dv) dateStr = normalizeDate(String(dv)) || String(dv).slice(0, 10);
        const medicine = ci.medicine >= 0 ? num(r[ci.medicine]) : 0;
        let service = ci.service >= 0 ? String(r[ci.service] ?? "").trim() : "";
        // Combine "Paid for Service" + "Paid for Medicine/Product" into total collected.
        const serviceAmt = (ci.paidService >= 0 ? num(r[ci.paidService]) : 0) + medicine;
        if (!service && medicine > 0) service = DIRECT_MEDICINE;
        // De-duplicate identical rows within the same file.
        const key = `${dateStr}|${name.toLowerCase()}|${serviceAmt}|${service.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          date: dateStr, clientType: ci.type >= 0 ? String(r[ci.type] ?? "").trim() : "", name,
          phone: ci.phone >= 0 ? phoneStr(r[ci.phone]) : "",
          service,
          consult: ci.consult >= 0 ? num(r[ci.consult]) : 0, service_amt: serviceAmt, medicine,
          pending: ci.pending >= 0 ? num(r[ci.pending]) : 0,
          mode: normalizePaymentMode(ci.mode >= 0 ? r[ci.mode] : ""),
        });
      }
      setRows(out);
      if (out.length === 0) toast.error(`No data rows detected in ${file.name}. Check that the sheet has Date/Name columns.`);
      else toast.success(`Parsed ${out.length} rows from ${file.name} (header on row ${hi + 1})`);
    };
    reader.readAsArrayBuffer(file);
  }


  async function importRows() {
    if (!rows.length) return;
    setImporting(true);
    try {
      const sales: SaleRow[] = rows.map((r) => ({
        date: r.date, name: r.name, phone: r.phone,
        item: r.service || "Service", consult: r.consult, amount: r.service_amt,
        mode: r.mode, pending: r.pending,
      }));
      const res = await ingestSales({ data: { rows: sales, sourceLabel: "july-excel" } });
      setQa({ label: "July Excel", ...res });
      toast.success(`Imported ${res.invoices} invoices, ${res.lines} lines`);
      setRows([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  }

  function parsePaste() {
    const parsed = parseWhatsApp(pasteText);
    setPasteRows(parsed);
    if (!parsed.length) toast.error("No patient entries found. Check the format.");
    else toast.success(`Extracted ${parsed.length} entries`);
  }

  async function processPaste() {
    if (!pasteRows.length) return;
    setProcessing(true);
    try {
      const sales: SaleRow[] = pasteRows.map((r) => {
        const isConsult = /consult/i.test(r.service);
        return {
          date: r.date, name: r.name, phone: r.phone,
          item: r.service || (isConsult ? "Dr. Consultation" : "Item"),
          consult: r.consult || (isConsult ? r.amount : 0),
          amount: (isConsult ? 0 : r.amount) + r.medicine,
          mode: r.mode, pending: r.pending,
        };
      });
      const res = await ingestSales({ data: { rows: sales, sourceLabel: "whatsapp-paste" } });
      setQa({ label: "WhatsApp Paste", ...res });
      toast.success(`Registered ${res.invoices} invoices from WhatsApp report`);
      setPasteText(""); setPasteRows([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Processing failed");
    } finally { setProcessing(false); }
  }




  if (!isFinance) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Data Import Workbench" subtitle="Ingest gap/price rules, Excel sales, WhatsApp text, June text, and vendor invoices." />
      {qa && (
        <Card className="mb-4 p-4">
          <div className="mb-2 text-sm font-semibold">Quality Gate — {qa.label}</div>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {qa.updated !== undefined && (<tr><td className="p-2">Gap/Price Rules Updated</td><td className="p-2 text-right font-mono">{(qa.updated ?? 0) + (qa.created ?? 0)}</td></tr>)}
              {qa.invoices !== undefined && (<tr><td className="p-2">Total Invoices Generated</td><td className="p-2 text-right font-mono">{qa.invoices}</td></tr>)}
              {qa.lines !== undefined && (<tr><td className="p-2">Invoice Lines</td><td className="p-2 text-right font-mono">{qa.lines}</td></tr>)}
              {qa.customersUpserted !== undefined && (<tr><td className="p-2">Total Customers Mapped</td><td className="p-2 text-right font-mono">{qa.customersUpserted}</td></tr>)}
              {qa.vouchers !== undefined && qa.vouchers > 0 && (<tr><td className="p-2">Split-Payment Vouchers</td><td className="p-2 text-right font-mono">{qa.vouchers}</td></tr>)}
              {qa.autoScheduled !== undefined && qa.autoScheduled > 0 && (<tr><td className="p-2">Sessions Auto-Scheduled</td><td className="p-2 text-right font-mono">{qa.autoScheduled}</td></tr>)}
              {qa.pendingAccurate !== undefined && (<tr><td className="p-2">Pending Balances Accurate</td><td className="p-2 text-right font-mono">{qa.pendingAccurate ? "Yes" : `No (src ${qa.sumPendingSource} vs stored ${qa.sumPendingStored})`}</td></tr>)}
            </tbody>
          </table>
          {qa.warnings && qa.warnings.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-destructive">{qa.warnings.length} warning(s)</summary>
              <ul className="mt-1 list-disc pl-5">{qa.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </Card>
      )}
      <Tabs defaultValue="inv">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="inv"><Boxes className="mr-2 h-4 w-4" /> Inventory Bulk Import</TabsTrigger>
          <TabsTrigger value="file"><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Sales Import</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquareText className="mr-2 h-4 w-4" /> WhatsApp Full Text</TabsTrigger>
          <TabsTrigger value="paste"><MessageSquareText className="mr-2 h-4 w-4" /> WhatsApp (legacy)</TabsTrigger>
          <TabsTrigger value="svc"><Package className="mr-2 h-4 w-4" /> Service Master</TabsTrigger>
          <TabsTrigger value="gap"><CalendarClock className="mr-2 h-4 w-4" /> Gap Master</TabsTrigger>
          <TabsTrigger value="ocr"><ScanText className="mr-2 h-4 w-4" /> Invoice OCR</TabsTrigger>
        </TabsList>

        <TabsContent value="inv">
          <InventoryImportWizard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card className="mb-4 space-y-3 p-6">
            <label className="text-sm font-medium">Paste the FULL WhatsApp Sales Report (June format)</label>
            <p className="text-xs text-muted-foreground">The server parses multi-line items (Treatment/Product/Medicine blocks), split payments, and pending balances, then writes invoices identical to manual POS entry. Unmatched services/products go to the Import Review Queue.</p>
            <Textarea value={waText} onChange={(e) => setWaText(e.target.value)} rows={16} placeholder={"Date: 01/06/26\n\nName: Uma\nAppointment: Dr. Consultation\nPayment: 1000 (UPI)\nContact: 9999860869\n\nName: Rahul\nPackage: 6 Session Face LHR\nPayment: 18000 (Cash + UPI)\nPending: 12000"} />
            <div className="flex items-center gap-3">
              <Button onClick={submitWhatsapp} disabled={waBusy || !waText.trim()}>
                {waBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Parse &amp; Import
              </Button>
              {waResult && (
                <span className="text-xs text-muted-foreground">
                  {waResult.records} record(s) parsed · {waResult.imported} imported · {waResult.failed} failed · {waResult.skipped} skipped
                </span>
              )}
            </div>
            {waResult?.warnings?.length ? (
              <details className="text-xs"><summary className="cursor-pointer text-destructive">{waResult.warnings.length} warning(s)</summary>
                <ul className="mt-1 list-disc pl-5">{waResult.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="svc">
          <Card className="mb-4 space-y-3 p-6">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center">
              <UploadCloud className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">{svcFile || "Upload Service Price Master (.xlsx)"}</span>
              <span className="text-xs text-muted-foreground">Columns: Category, Name, Type, Price, GST%, Sessions, Gap Days, Auto Follow-up, Auto Appointment, Consumables</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSvcFile} />
            </label>
            {svcRows.length > 0 && (
              <Button onClick={importSvcMaster} disabled={svcBusy}>
                {svcBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Import {svcRows.length} Services
              </Button>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="gap">
          <Card className="mb-4 space-y-3 p-6">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center">
              <UploadCloud className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">{gapFile || "Upload Gap Day Master (.xlsx)"}</span>
              <span className="text-xs text-muted-foreground">Columns: Service Name, Gap Days, Auto Follow-up (Y/N), Auto Appointment (Y/N)</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleGapFile} />
            </label>
            {gapRows.length > 0 && (
              <Button onClick={importGapMaster} disabled={gapBusy}>
                {gapBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Apply {gapRows.length} Gap Rules
              </Button>
            )}
          </Card>
        </TabsContent>






        <TabsContent value="file">
          <Card className="mb-4 p-6">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center">
              <UploadCloud className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">{fileName || "Click to choose May (5).xlsx / pkg.xlsx"}</span>
              <span className="text-xs text-muted-foreground">Columns: Date, Client Type, Name, Service, Dr. Consultation, Paid For Service, Medicine, Pending Balance, Mode</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
            {rows.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={importRows} disabled={importing}>
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Import {rows.length} Rows
                </Button>
              </div>
            )}
          </Card>
          {rows.length > 0 && (
            <Card className="p-0">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">Name</th><th className="p-2">Service</th><th className="p-2">Mode</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">Pending</th></tr></thead>
                  <tbody className="divide-y">
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}><td className="p-2">{r.date}</td><td className="p-2">{r.name}</td><td className="p-2">{r.service}</td><td className="p-2">{r.mode}</td><td className="p-2 text-right">{inr2(r.consult + r.service_amt)}</td><td className="p-2 text-right">{inr2(r.pending)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="paste">
          <Card className="mb-4 p-6 space-y-3">
            <label className="text-sm font-medium">Paste Daily WhatsApp Billing Report Message Here</label>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={12}
              placeholder={"Name: - Riya Sharma\nTreatment / Appointment / Package: - Hydra Facial\nPayment / Price: - 8000\nMode: - UPI\nContact: - 9876543210\n2000 pending"}
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={parsePaste}>Extract Entries</Button>
              <Button onClick={processPaste} disabled={!pasteRows.length || processing}>
                {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Process Pasted Report
              </Button>
            </div>
          </Card>
          {pasteRows.length > 0 && (
            <Card className="p-0">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Name</th><th className="p-2">Service</th><th className="p-2">Mode</th><th className="p-2">Phone</th><th className="p-2 text-right">Consult</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Medicine</th><th className="p-2 text-right">Pending</th></tr></thead>
                  <tbody className="divide-y">
                    {pasteRows.map((r, i) => (
                      <tr key={i}><td className="p-2">{r.date}</td><td className="p-2">{r.clientType}</td><td className="p-2">{r.name}</td><td className="p-2">{r.service}</td><td className="p-2">{r.mode}</td><td className="p-2">{r.phone}</td><td className="p-2 text-right">{inr2(r.consult)}</td><td className="p-2 text-right">{inr2(r.amount)}</td><td className="p-2 text-right">{inr2(r.medicine)}</td><td className="p-2 text-right">{inr2(r.pending)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ocr">
          <Card className="mb-4 p-6">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center">
              {ocrBusy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <ScanText className="h-8 w-8 text-primary" />}
              <span className="text-sm font-medium">{ocrName || "Upload a vendor invoice (PDF / image)"}</span>
              <span className="text-xs text-muted-foreground">OCR reads Invoice No, GSTIN, Company Name, Date &amp; Total automatically</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleOcr} disabled={ocrBusy} />
            </label>
          </Card>
          {ocr && (
            <Card className="space-y-3 p-6">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Invoice No</p><p className="font-medium">{ocr.invoice_no || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">GSTIN</p><p className="font-medium">{ocr.gstin || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Company Name</p><p className="font-medium">{ocr.company || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{ocr.date || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Total</p><p className="font-medium">{inr2(ocr.amount)}</p></div>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Raw OCR text</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded bg-muted/40 p-2">{ocr.raw}</pre>
              </details>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
