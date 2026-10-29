// Unified Print Layout Engine — MediGlo Clinic
// Renders branded A4 documents (Clinical Prescription + Tally-style Invoice)
// modelled on the "MEDIGLO LETTER HEAD" identity. Every builder returns a
// complete, self-contained HTML document string that can be:
//   • injected into an <iframe srcDoc> for on-screen preview, or
//   • opened in a print window via openPrintDocument().

import { stateName } from "@/lib/constants";
import { fmtDate as fmtInvDate } from "@/lib/date-format";
import logoAsset from "@/assets/mediglo-logo.jpg.asset.json";

// Absolute URL so the logo loads inside print windows and iframe srcDoc previews.
const LOGO_URL = (typeof window !== "undefined" ? window.location.origin : "https://mediglo-vision.lovable.app") + logoAsset.url;

/* ----------------------------- shared types ----------------------------- */

export interface PrintLine {
  description: string;
  sac_code?: string | null;
  qty: number;
  discount_amount?: number | null;
  base_amount: number;
  cgst: number;
  sgst: number;
  cgst_pct?: number | null;
  sgst_pct?: number | null;
  line_total: number;
  session_label?: string | null;
}

export interface PackageSummary {
  total_sessions: number;
  delivered_sessions: number; // includes today
  remaining_sessions: number;
  outstanding_balance: number;
}

export interface PrintInvoice {
  invoice_no: string;
  invoice_date?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_age?: string | number | null;
  client_type?: string | null;
  state_code: string;
  payment_mode: string;
  tax_mode?: string | null;
  base_amount: number;
  cgst: number;
  sgst: number;
  discount_amount?: number | null;
  gross_total: number;
  paid_amount?: number | null;
  pending_balance?: number | null;
  session_note?: string | null;
  package?: PackageSummary | null;
}

export interface PrintPrescription {
  patient_name: string;
  age?: string | number | null;
  gender?: string | null;
  consultation_date?: string | null;
  provisional_diagnosis?: string | null;
  investigations?: string | null;
  notes?: string | null; // Notes / Treatment Recommendations
  suggested_services?: string | null; // Suggested Services Log
  suggested_products?: string | null; // Suggested Homecare Products / Topical Medicines
}

/* ----------------------------- utilities ----------------------------- */

function money(n: unknown) {
  const v = Number(n);
  return "₹" + (Number.isFinite(v) ? v : 0).toFixed(2);
}

export function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

// Render free text into clean paragraph lines (preserves line breaks, never concatenates).
function textBlock(value?: string | null, placeholder = "—") {
  const raw = String(value ?? "").trim();
  if (!raw) return `<div class="ph">${placeholder}</div>`;
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div class="tline">${escapeHtml(l)}</div>`)
    .join("");
}

/* ----------------------------- shared chrome (letterhead) ----------------------------- */

// Corporate palette extracted from the MediGlo clinic logo (deep burgundy / wine).
const BURGUNDY = "#5C2536";
const CHARCOAL = "#111111";

const BRAND_CSS = `
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${CHARCOAL};background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .sheet{width:210mm;min-height:297mm;margin:0 auto;padding:14mm 14mm 26mm;position:relative;display:flex;flex-direction:column;}
  /* ---- letterhead ---- */
  .lh{border-bottom:2.5px solid ${BURGUNDY};padding-bottom:10px;}
  .lh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;}
  .lh-idw{display:flex;align-items:center;gap:12px;}
  .lh-logo{width:62px;height:62px;border-radius:50%;object-fit:contain;background:#fff;}
  .lh-brand .title{font-size:26px;font-weight:800;letter-spacing:-.5px;color:${CHARCOAL};line-height:1;}
  .lh-brand .title b{color:${BURGUNDY};}
  .lh-brand .sub{font-size:11px;font-weight:700;letter-spacing:3px;color:${BURGUNDY};margin-top:4px;}
  .lh-brand .spectrum{font-size:9.5px;font-weight:600;letter-spacing:1.5px;color:#6b6b6b;margin-top:3px;}
  .lh-brand .gst{font-size:9px;font-weight:700;letter-spacing:.5px;color:#6b6b6b;margin-top:3px;}
  .lh-doc{text-align:right;border-left:2px solid ${BURGUNDY};padding-left:12px;}
  .lh-doc .name{font-size:14px;font-weight:800;color:${BURGUNDY};}
  .lh-doc .qual{font-size:10px;color:#333;margin-top:2px;}
  .lh-doc .regs{font-size:10px;color:#555;margin-top:2px;font-weight:600;}
  .lh-doc .aff{font-size:8.5px;color:#555;margin-top:3px;max-width:230px;line-height:1.4;}
  /* ---- doc title ---- */
  .doc-title{margin:16px 0 10px;display:flex;justify-content:space-between;align-items:flex-end;}
  .doc-title h1{margin:0;font-size:16px;letter-spacing:1px;text-transform:uppercase;color:${BURGUNDY};}
  .doc-title .meta{font-size:11px;color:#555;text-align:right;}
  .body{flex:1;}
  /* ---- footer ---- */
  .lh-foot{position:absolute;left:14mm;right:14mm;bottom:10mm;border-top:2.5px solid ${BURGUNDY};padding-top:8px;text-align:center;}
  .lh-foot .addr{font-size:9.5px;color:#333;}
  .lh-foot .comm{font-size:9.5px;color:${BURGUNDY};font-weight:700;margin-top:2px;}
  .lh-foot .legal{font-size:8px;color:#999;margin-top:4px;font-style:italic;}
  /* ---- generic blocks ---- */
  .muted{color:#8a8a8a;}
  .ph{color:#bbb;font-style:italic;}
  @page{size:A4;margin:0;}
  @media print{ body{background:#fff;} .sheet{margin:0;} }
`;

function letterhead() {
  return `
  <div class="lh">
    <div class="lh-top">
      <div class="lh-idw">
        <img class="lh-logo" src="${LOGO_URL}" alt="MediGlo Clinic" />
        <div class="lh-brand">
          <div class="title"><b>MediGlo</b> CLINIC</div>
          <div class="sub">AESTHETICS &amp; WELLBEING</div>
          <div class="spectrum">SKIN | HAIR | BODY | ANTI-AGING | LONGEVITY</div>
        </div>
      </div>
      <div class="lh-doc">
        <div class="name">Mediglo Clinic</div>
        <div class="qual">Aesthetic &amp; Wellness Care</div>
        <div class="regs">Phone: 7303338004</div>
        <div class="aff">Website: www.mediglo.in</div>
      </div>
    </div>
  </div>`;
}

function footer() {
  return `
  <div class="lh-foot">
    <div class="addr">A1/243 Second Floor, Mediglo Clinic, Raghvendra Marg, Block A1, Gurugram 122011, Haryana</div>
    <div class="comm">Phone: 7303338004 | Website: www.mediglo.in</div>
    <div class="legal">*Not valid for medico-legal purposes</div>
  </div>`;
}


function wrapDocument(title: string, inner: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${BRAND_CSS}</style></head><body><div class="sheet">${letterhead()}<div class="body">${inner}</div>${footer()}</div></body></html>`;
}

/* ----------------------------- Profile A: Prescription ----------------------------- */

const RX_CSS = `
  <style>
    .demo{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:14px;}
    .demo .cell{padding:8px 12px;border-right:1px solid #e2e8f0;}
    .demo .cell:last-child{border-right:none;}
    .demo .k{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;}
    .demo .v{font-size:13px;font-weight:600;color:#111111;margin-top:2px;}
    .clin{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
    .field{border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;min-height:56px;}
    .field .lbl{font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5C2536;margin-bottom:4px;}
    .rx-wrap{border:1px solid #e2e8f0;border-radius:8px;padding:0;overflow:hidden;}
    .rx-head{display:flex;align-items:center;gap:10px;background:#f6eef1;border-bottom:1px solid #cbd5e1;padding:8px 14px;}
    .rx-sym{font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;font-style:italic;color:#5C2536;line-height:1;}
    .rx-sym small{display:block;font-family:'Segoe UI';font-size:9px;font-style:normal;letter-spacing:1px;color:#64748b;}
    .rx-section{padding:12px 16px;border-bottom:1px dashed #e2e8f0;}
    .rx-section:last-child{border-bottom:none;}
    .rx-section .head{font-size:11px;font-weight:800;letter-spacing:.5px;color:#111111;margin-bottom:6px;display:flex;align-items:center;gap:8px;}
    .rx-section .head .dot{width:7px;height:7px;border-radius:2px;background:#5C2536;}
    .tline{font-size:12.5px;line-height:1.55;color:#334155;}
  </style>`;

export function buildPrescriptionHtml(rx: PrintPrescription): string {
  const ageGender = [rx.age != null && String(rx.age).trim() ? String(rx.age) + "y" : "", rx.gender ?? ""]
    .filter(Boolean)
    .join(" · ");
  const inner = `
    ${RX_CSS}
    <div class="doc-title"><h1>Clinical Prescription</h1></div>
    <div class="demo">
      <div class="cell"><div class="k">Patient Name</div><div class="v">${escapeHtml(rx.patient_name || "—")}</div></div>
      <div class="cell"><div class="k">Age &amp; Gender</div><div class="v">${escapeHtml(ageGender || "—")}</div></div>
      <div class="cell"><div class="k">Consultation Date</div><div class="v">${escapeHtml(rx.consultation_date || new Date().toISOString().slice(0, 10))}</div></div>
    </div>
    <div class="clin">
      <div class="field"><div class="lbl">Provisional Diagnosis</div>${textBlock(rx.provisional_diagnosis)}</div>
      <div class="field"><div class="lbl">Investigations</div>${textBlock(rx.investigations)}</div>
    </div>
    <div class="rx-wrap">
      <div class="rx-head"><div class="rx-sym">℞<small>PRESCRIPTION</small></div></div>
      <div class="rx-section">
        <div class="head"><span class="dot"></span>Notes / Treatment Recommendations</div>
        ${textBlock(rx.notes, "No notes recorded.")}
      </div>
      <div class="rx-section">
        <div class="head"><span class="dot"></span>Suggested Services Log</div>
        ${textBlock(rx.suggested_services, "No services suggested.")}
      </div>
      <div class="rx-section">
        <div class="head"><span class="dot"></span>Suggested Homecare Products / Topical Medicines</div>
        ${textBlock(rx.suggested_products, "No homecare products suggested.")}
      </div>
    </div>`;
  return wrapDocument(`Rx — ${rx.patient_name}`, inner);
}

/* ----------------------------- Profile B: Tally Invoice ----------------------------- */

const INV_CSS = `
  <style>
    .frame{display:flex;flex-wrap:wrap;gap:10px 24px;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;}
    .frame .it{font-size:11px;}
    .frame .it .k{color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-size:9px;}
    .frame .it .v{font-weight:700;color:#111111;font-size:12.5px;margin-top:1px;}
    table.grid{width:100%;border-collapse:collapse;font-size:11.5px;}
    table.grid th{background:#f6eef1;border:1px solid #e2e8f0;padding:7px 8px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#475569;}
    table.grid td{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top;color:#334155;}
    table.grid td.c,table.grid th.c{text-align:center;}
    table.grid td.r,table.grid th.r{text-align:right;}
    .sub-lbl{color:#94a3b8;font-size:9px;}
    .totwrap{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-top:14px;}
    .pkgcard{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;background:#f8fafc;max-width:46%;}
    .pkgcard h4{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5C2536;}
    .pkgrow{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;border-bottom:1px dashed #e2e8f0;}
    .pkgrow:last-child{border-bottom:none;}
    .pkgrow b{color:#111111;}
    .totals{width:300px;margin-left:auto;}
    .totals .row{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;}
    .totals .grand{font-weight:800;font-size:15px;border-top:2px solid #5C2536;margin-top:4px;padding-top:6px;color:#111111;}
    .totals .pending{color:#dc2626;font-weight:700;}
  </style>`;

export function buildInvoiceHtml(inv: PrintInvoice, lines: PrintLine[]): string {
  const rows = (lines ?? [])
    .map(
      (l, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(l.description)}${l.session_label ? `<div class="sub-lbl">${escapeHtml(l.session_label)}</div>` : ""}</td>
        <td class="c">${escapeHtml(l.sac_code ?? "—")}</td>
        <td class="r">${l.qty}</td>
        <td class="r">${Number(l.discount_amount ?? 0) > 0 ? "- " + money(l.discount_amount) : "—"}</td>
        <td class="r">${money(l.base_amount)}</td>
        <td class="r">${(l.cgst_pct ?? (Number(l.base_amount) > 0 ? Number(((l.cgst / l.base_amount) * 100).toFixed(2)) : 0))}% · ${money(l.cgst)}</td>
        <td class="r">${(l.sgst_pct ?? (Number(l.base_amount) > 0 ? Number(((l.sgst / l.base_amount) * 100).toFixed(2)) : 0))}% · ${money(l.sgst)}</td>
        <td class="r">${money(l.line_total)}</td>
      </tr>`,
    )
    .join("");

  const pkg = inv.package
    ? `
    <div class="pkgcard">
      <h4>Package Ledger</h4>
      <div class="pkgrow"><span>Total Package Sessions Contracted</span><b>${inv.package.total_sessions}</b></div>
      <div class="pkgrow"><span>Current Session Number Delivered (Today)</span><b>${inv.package.delivered_sessions}</b></div>
      <div class="pkgrow"><span>Remaining Balance Sessions</span><b>${inv.package.remaining_sessions}</b></div>
      <div class="pkgrow"><span>Outstanding Pending Balance Due</span><b>${money(inv.package.outstanding_balance)}</b></div>
    </div>`
    : `<div style="flex:1"></div>`;

  const inner = `
    ${INV_CSS}
    <div class="doc-title"><h1>Tax Invoice</h1><div class="meta">${escapeHtml(inv.invoice_no)}<br/>${escapeHtml(fmtInvDate(inv.invoice_date))}</div></div>
    <div class="frame">
      <div class="it"><div class="k">Billed To</div><div class="v">${escapeHtml(inv.customer_name)}</div></div>
      ${inv.customer_age != null && String(inv.customer_age).trim() ? `<div class="it"><div class="k">Age</div><div class="v">${escapeHtml(String(inv.customer_age))}</div></div>` : ""}
      ${inv.customer_phone ? `<div class="it"><div class="k">Contact</div><div class="v">${escapeHtml(inv.customer_phone)}</div></div>` : ""}
      ${inv.client_type ? `<div class="it"><div class="k">Client Type</div><div class="v">${escapeHtml(inv.client_type)}</div></div>` : ""}
      <div class="it"><div class="k">Mode of Payment</div><div class="v">${escapeHtml(inv.payment_mode)}</div></div>
      <div class="it"><div class="k">Place of Supply</div><div class="v">${escapeHtml(inv.state_code)} · ${escapeHtml(stateName(inv.state_code))}</div></div>
      <div class="it"><div class="k">Tax Treatment</div><div class="v">${escapeHtml(inv.tax_mode ?? "inclusive")}</div></div>
    </div>
    <table class="grid">
      <thead><tr>
        <th class="c">S.No</th><th>Particulars / Service / Product</th><th class="c">SAC/HSN</th>
        <th class="r">Qty/Sessions</th><th class="r">Item Discount</th><th class="r">Taxable Base</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">Line Net Total</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="9" class="c muted">No line items</td></tr>`}</tbody>
    </table>
    <div class="totwrap">
      ${pkg}
      <div class="totals">
        ${inv.discount_amount != null && Number(inv.discount_amount) > 0 ? `
        <div class="row"><span class="muted">Subtotal</span><span>${money(Number(inv.base_amount) + Number(inv.cgst) + Number(inv.sgst) + Number(inv.discount_amount))}</span></div>
        <div class="row"><span class="muted">Bill Discount Allowed</span><span>- ${money(inv.discount_amount)}</span></div>` : ""}
        ${(lines ?? []).some((l) => Number(l.discount_amount ?? 0) > 0) ? `<div class="row"><span class="muted">Item-wise Discounts</span><span>- ${money((lines ?? []).reduce((a, l) => a + Number(l.discount_amount ?? 0), 0))}</span></div>` : ""}
        <div class="row"><span class="muted">Taxable Base</span><span>${money(inv.base_amount)}</span></div>
        <div class="row"><span class="muted">CGST</span><span>${money(inv.cgst)}</span></div>
        <div class="row"><span class="muted">SGST</span><span>${money(inv.sgst)}</span></div>
        <div class="row grand"><span>Grand Total</span><span>${money(inv.gross_total)}</span></div>
        ${inv.paid_amount != null ? `<div class="row"><span class="muted">Paid Amount</span><span>${money(inv.paid_amount)}</span></div>` : ""}
        ${inv.pending_balance != null ? `<div class="row ${Number(inv.pending_balance) > 0 ? "pending" : ""}"><span${Number(inv.pending_balance) > 0 ? "" : ' class="muted"'}>Outstanding / Due</span><span>${money(inv.pending_balance)}</span></div>` : ""}
      </div>
    </div>
    ${inv.session_note ? `<div style="margin-top:12px;font-size:11px;color:#475569;"><b>Session Tracking:</b> ${escapeHtml(inv.session_note)}</div>` : ""}`;
  return wrapDocument(`Invoice ${inv.invoice_no}`, inner);
}

/* ----------------------------- print runtime ----------------------------- */

export function openPrintDocument(html: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // wait for layout, then print
  w.onload = () => {
    setTimeout(() => w.print(), 150);
  };
}

export function printPrescription(rx: PrintPrescription) {
  openPrintDocument(buildPrescriptionHtml(rx));
}

export function printTallyInvoice(inv: PrintInvoice, lines: PrintLine[]) {
  openPrintDocument(buildInvoiceHtml(inv, lines));
}

/* ----------------------------- Profile C: Wallet Redemption Voucher ----------------------------- */

export interface WalletReceipt {
  patient_name: string;
  service_name: string;
  service_date: string;
  sessions_used: number;
  total_sessions: number;
  consumed_sessions: number;
  remaining: number;
  therapist_name?: string | null;
  notes?: string | null;
}

export function buildWalletReceiptHtml(r: WalletReceipt): string {
  const row = (k: string, v: string) =>
    `<div class="pkgrow"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`;
  const inner = `
    ${INV_CSS}
    <div class="doc-title"><h1>Service Wallet Voucher</h1><div class="meta">${escapeHtml(fmtInvDate(r.service_date))}</div></div>
    <div class="pkgcard" style="max-width:100%">
      <h4>Session Redemption Summary</h4>
      ${row("Client Name", r.patient_name)}
      ${row("Service Redeemed", r.service_name)}
      ${row("Date Rendered", fmtInvDate(r.service_date))}
      ${row("Sessions Used (this voucher)", String(r.sessions_used))}
      ${row("Total Sessions Purchased", String(r.total_sessions))}
      ${row("Sessions Consumed To Date", String(r.consumed_sessions))}
      ${row("Remaining Wallet Balance", String(r.remaining))}
      ${r.therapist_name ? row("Therapist / Staff", r.therapist_name) : ""}
      ${r.notes ? row("Notes", r.notes) : ""}
    </div>
    <p style="margin-top:12px;font-size:11px;color:#475569;">This voucher records a pre-paid package session. No payment is due for this redemption.</p>`;
  return wrapDocument(`Wallet Voucher — ${r.patient_name}`, inner);
}

export function printWalletReceipt(r: WalletReceipt) {
  openPrintDocument(buildWalletReceiptHtml(r));
}

/* ----------------------------- Profile D: Consolidated Master Statement ----------------------------- */

export interface StatementInvoice {
  invoice_no: string | null;
  invoice_date: string | null;
  gross_total: number;
  payment_mode: string;
  paid_amount: number;
  pending_balance: number;
}
export interface StatementSession {
  service_name: string;
  date: string | null;
  session_number: number | string;
  staff_name?: string | null;
}
export interface StatementWallet {
  service_name: string;
  total_sessions: number;
  consumed_sessions: number;
  remaining: number;
}
export interface MasterStatement {
  customer_name: string;
  phone?: string | null;
  age?: number | string | null;
  client_type?: string | null;
  outstanding: number;
  gross: number;
  invoices: StatementInvoice[];
  sessions: StatementSession[];
  wallets: StatementWallet[];
}

export function buildMasterStatementHtml(s: MasterStatement): string {
  const invRows = s.invoices.length
    ? s.invoices
        .map(
          (i) => `<tr>
        <td>${escapeHtml(i.invoice_no ?? "—")}</td>
        <td>${escapeHtml(fmtInvDate(i.invoice_date))}</td>
        <td class="r">${money(i.gross_total)}</td>
        <td>${escapeHtml(i.payment_mode)}</td>
        <td class="r">${money(i.paid_amount)}</td>
        <td class="r">${money(i.pending_balance)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="c muted">No billing history</td></tr>`;

  const sesRows = s.sessions.length
    ? s.sessions
        .map(
          (x) => `<tr>
        <td>${escapeHtml(x.service_name)}</td>
        <td>${escapeHtml(fmtInvDate(x.date))}</td>
        <td class="c">${escapeHtml(String(x.session_number))}</td>
        <td>${escapeHtml(x.staff_name ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="c muted">No sessions rendered</td></tr>`;

  const walRows = s.wallets.length
    ? s.wallets
        .map(
          (w) => `<tr>
        <td>${escapeHtml(w.service_name)}</td>
        <td class="c">${w.total_sessions}</td>
        <td class="c">${w.consumed_sessions}</td>
        <td class="c">${w.remaining}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="c muted">No active wallet balance</td></tr>`;

  const inner = `
    ${INV_CSS}
    <div class="doc-title"><h1>Consolidated Client Statement</h1><div class="meta">${escapeHtml(fmtInvDate(new Date().toISOString().slice(0, 10)))}</div></div>
    <div class="frame">
      <div class="it"><div class="k">Client</div><div class="v">${escapeHtml(s.customer_name)}</div></div>
      ${s.phone ? `<div class="it"><div class="k">Phone</div><div class="v">${escapeHtml(s.phone)}</div></div>` : ""}
      ${s.age != null && String(s.age).trim() ? `<div class="it"><div class="k">Age</div><div class="v">${escapeHtml(String(s.age))}</div></div>` : ""}
      ${s.client_type ? `<div class="it"><div class="k">Client Type</div><div class="v">${escapeHtml(s.client_type)}</div></div>` : ""}
      <div class="it"><div class="k">Gross Invoiced</div><div class="v">${money(s.gross)}</div></div>
      <div class="it"><div class="k">Outstanding Dues</div><div class="v">${money(s.outstanding)}</div></div>
    </div>

    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${BURGUNDY};margin:14px 0 6px;">Billing History</h3>
    <table class="grid">
      <thead><tr><th>Invoice No</th><th>Date</th><th class="r">Total</th><th>Payment Mode</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
      <tbody>${invRows}</tbody>
    </table>

    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${BURGUNDY};margin:14px 0 6px;">Service &amp; Session History</h3>
    <table class="grid">
      <thead><tr><th>Service</th><th>Date Rendered</th><th class="c">Session #</th><th>Staff</th></tr></thead>
      <tbody>${sesRows}</tbody>
    </table>

    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${BURGUNDY};margin:14px 0 6px;">Active Wallet Balance</h3>
    <table class="grid">
      <thead><tr><th>Service</th><th class="c">Purchased</th><th class="c">Used</th><th class="c">Remaining</th></tr></thead>
      <tbody>${walRows}</tbody>
    </table>`;
  return wrapDocument(`Statement — ${s.customer_name}`, inner);
}

export function printMasterStatement(s: MasterStatement) {
  openPrintDocument(buildMasterStatementHtml(s));
}

/* ----------------------------- Profile D: Counselor Quotation ----------------------------- */

export interface QuotationPrintItem {
  name: string;
  kind: "service" | "product";
  quantity: number;
  unit_price: number;
  discount: number;
  amount: number;
}

export interface QuotationPrint {
  quotation_no: string;
  patient_name: string;
  patient_phone?: string | null;
  date: string;
  valid_till: string;
  items: QuotationPrintItem[];
  subtotal: number;
  discount_amount: number;
  discount_reason?: string | null;
  cgst: number;
  sgst: number;
  net_total: number;
}

export function buildQuotationHtml(q: QuotationPrint): string {
  const rows = (q.items ?? [])
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(it.name)}<div class="sub-lbl">${it.kind === "service" ? "Treatment" : "Product"}</div></td>
        <td class="r">${it.quantity}</td>
        <td class="r">${money(it.unit_price)}</td>
        <td class="r">${Number(it.discount) > 0 ? "- " + money(it.discount) : "—"}</td>
        <td class="r">${money(it.amount)}</td>
      </tr>`,
    )
    .join("");

  const inner = `
    ${INV_CSS}
    <div class="doc-title"><h1>Treatment Quotation</h1><div class="meta">${escapeHtml(q.quotation_no)}<br/>${escapeHtml(fmtInvDate(q.date))}</div></div>
    <div class="frame">
      <div class="it"><div class="k">Prepared For</div><div class="v">${escapeHtml(q.patient_name)}</div></div>
      ${q.patient_phone ? `<div class="it"><div class="k">Contact</div><div class="v">${escapeHtml(q.patient_phone)}</div></div>` : ""}
      <div class="it"><div class="k">Valid Till</div><div class="v">${escapeHtml(fmtInvDate(q.valid_till))}</div></div>
      <div class="it"><div class="k">Tax Treatment</div><div class="v">GST 5% inclusive</div></div>
    </div>
    <table class="grid">
      <thead><tr>
        <th class="c">S.No</th><th>Recommended Treatment / Product</th><th class="r">Qty / Sessions</th>
        <th class="r">Unit Price</th><th class="r">Discount</th><th class="r">Amount</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="c muted">No items quoted</td></tr>`}</tbody>
    </table>
    <div class="totwrap">
      <div style="flex:1"></div>
      <div class="totals">
        <div class="row"><span class="muted">Subtotal</span><span>${money(q.subtotal)}</span></div>
        ${Number(q.discount_amount) > 0 ? `<div class="row"><span class="muted">Special Discount${q.discount_reason ? ` (${escapeHtml(q.discount_reason)})` : ""}</span><span>- ${money(q.discount_amount)}</span></div>` : ""}
        <div class="row"><span class="muted">CGST</span><span>${money(q.cgst)}</span></div>
        <div class="row"><span class="muted">SGST</span><span>${money(q.sgst)}</span></div>
        <div class="row grand"><span>Net Payable</span><span>${money(q.net_total)}</span></div>
      </div>
    </div>
    <div style="margin-top:14px;font-size:10.5px;color:#475569;line-height:1.6;">
      <b>Terms &amp; Conditions</b><br/>
      1. This quotation is valid till ${escapeHtml(fmtInvDate(q.valid_till))} and prices may change thereafter.<br/>
      2. Treatment outcomes vary between individuals; sessions quoted are a clinical recommendation, not a guarantee.<br/>
      3. Prices are inclusive of GST at 5%. This is a quotation, not a tax invoice.<br/>
      4. Package sessions once billed are non-transferable and non-refundable.
    </div>`;
  return wrapDocument(`Quotation ${q.quotation_no}`, inner);
}

export function printQuotation(q: QuotationPrint) {
  openPrintDocument(buildQuotationHtml(q));
}
