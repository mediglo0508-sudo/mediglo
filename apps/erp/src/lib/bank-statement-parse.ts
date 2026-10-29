// Bank statement parsing helpers for the Reconciliation module.
// Indian bank statements are DAY-FIRST. Never guess month-first.
import * as XLSX from "xlsx";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse any bank-statement date cell into ISO `YYYY-MM-DD`, or null when unparseable. */
export function parseStatementDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  // 1. Real JS Date (cellDates) — use LOCAL parts, never toISOString() (IST would shift back a day).
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  // 2. Excel serial number (1899-12-30 epoch).
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 20000 || value > 60000) return null;
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const d = new Date(ms);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const s = String(value).trim();
  if (!s) return null;

  // 3. ISO passthrough YYYY-MM-DD (optionally with a time part).
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  // 4. Numeric-serial-as-string.
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseStatementDate(Number(s));

  // 5. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and 2-digit-year variants. DAY FIRST, always.
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[T ].*)?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length <= 2) y = y < 70 ? 2000 + y : 1900 + y;
    return iso(y, mo, d);
  }

  // 6. DD MMM YYYY / DD-MMM-YY / MMM DD YYYY.
  m = s.match(/^(\d{1,2})[\s\-/.]*([a-z]{3,9})[\s\-/.,]*(\d{2,4})$/i);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    let y = Number(m[3]);
    if (m[3].length <= 2) y = y < 70 ? 2000 + y : 1900 + y;
    if (mo > 0) return iso(y, mo, d);
    return null;
  }
  m = s.match(/^([a-z]{3,9})[\s\-/.]*(\d{1,2})[\s\-/.,]*(\d{2,4})$/i);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    const d = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length <= 2) y = y < 70 ? 2000 + y : 1900 + y;
    if (mo > 0) return iso(y, mo, d);
  }
  return null;
}

export interface ParsedAmount {
  /** Absolute magnitude; never NaN. */
  value: number;
  /** "in" | "out" when the cell itself declared a direction (CR/DR, parentheses, minus). */
  hint: "in" | "out" | null;
  /** True when a numeric value was actually present. */
  present: boolean;
}

/** Parse "1,25,000.00", "₹ 25,000", "25,000 CR", "(25,000)", "−25,000". Never NaN. */
export function parseAmount(v: unknown): ParsedAmount {
  if (v == null || v === "") return { value: 0, hint: null, present: false };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { value: 0, hint: null, present: false };
    return { value: Math.abs(v), hint: v < 0 ? "out" : null, present: true };
  }
  let s = String(v).trim();
  if (!s) return { value: 0, hint: null, present: false };

  let hint: "in" | "out" | null = null;
  // Parentheses = negative.
  if (/^\(.*\)$/.test(s)) {
    hint = "out";
    s = s.slice(1, -1);
  }
  // Leading / trailing CR or DR token.
  const crdr = s.match(/(^|[\s.])(cr|dr)([\s.]|$)/i);
  if (crdr) {
    hint = crdr[2].toLowerCase() === "cr" ? "in" : "out";
    s = s.replace(crdr[0], " ");
  }
  // Unicode minus / en dash used as minus.
  s = s.replace(/[\u2212\u2012\u2013\u2014]/g, "-");
  // Strip currency symbols, letters and grouping commas.
  s = s.replace(/[₹$€£]/g, "").replace(/,/g, "").replace(/[^0-9.\-]/g, "").trim();
  if (!s || s === "-" || s === ".") return { value: 0, hint, present: false };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: 0, hint, present: false };
  if (n < 0) hint = "out";
  return { value: Math.abs(n), hint, present: true };
}

/** Read a workbook, tolerating "xls" files that are actually HTML tables or CSV text. */
export function readStatementWorkbook(buf: ArrayBuffer): { wb: XLSX.WorkBook; format: string } {
  const bytes = new Uint8Array(buf);
  const head = bytes.slice(0, 512);
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // xlsx
  const isBiff = head[0] === 0xd0 && head[1] === 0xcf; // legacy .xls (OLE2)
  if (isZip) return { wb: XLSX.read(buf, { type: "array", cellDates: true }), format: "Excel (.xlsx)" };
  if (isBiff) return { wb: XLSX.read(buf, { type: "array", cellDates: true }), format: "Excel 97-2003 (.xls)" };

  const text = new TextDecoder("utf-8").decode(bytes);
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (/^</.test(trimmed)) {
    return { wb: XLSX.read(trimmed, { type: "string", cellDates: true }), format: "HTML table saved as .xls" };
  }
  // Plain text / delimited masquerading as a workbook.
  // eslint-disable-next-line no-control-regex
  const printable = /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(text.slice(0, 400));
  if (printable) {
    return { wb: XLSX.read(trimmed, { type: "string", cellDates: true }), format: "Delimited text saved as .xls" };
  }
  return { wb: XLSX.read(buf, { type: "array", cellDates: true }), format: "Excel (binary)" };
}

const DATE_HDR = /(txn\s*date|transaction\s*date|value\s*date|posting\s*date|tran\s*date|^date$|\bdate\b)/i;
const DESC_HDR = /(description|narration|particular|remark|details|transaction\s*remarks?|cheque\s*no|ref\s*no|utr)/i;
const AMT_HDR = /(amount|withdrawal|deposit|debit|credit|\bdr\b|\bcr\b|balance|paid\s*(in|out))/i;

export interface HeaderScan {
  headerRowIndex: number;
  headers: string[];
  map: { date: number; desc: number; debit: number; credit: number; amount: number; drcr: number };
}

/** Find the header row within the first 25 rows: needs a date header plus a desc or amount header. */
export function detectHeader(grid: unknown[][]): HeaderScan | null {
  const limit = Math.min(grid.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = Array.isArray(grid[i]) ? grid[i] : [];
    const cells = row.map((c) => String(c ?? "").trim());
    const hasDate = cells.some((c) => c && DATE_HDR.test(c));
    const hasOther = cells.some((c) => c && (DESC_HDR.test(c) || AMT_HDR.test(c)));
    if (!hasDate || !hasOther) continue;

    const h = cells.map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
    const date = h.findIndex((x) => DATE_HDR.test(x));
    const desc = h.findIndex((x) => /(description|narration|particular|remark|details)/.test(x));
    const debit = h.findIndex((x) => /(withdrawal|debit|paid out|\(dr\)|\bdr\b)/.test(x) && !/balance/.test(x));
    const credit = h.findIndex((x) => /(deposit|credit|paid in|\(cr\)|\bcr\b)/.test(x) && !/balance/.test(x));
    const amount = h.findIndex(
      (x, ix) =>
        ix !== debit && ix !== credit &&
        (x === "amount" || (x.includes("amount") && !/debit|credit|withdraw|deposit|balance/.test(x))),
    );
    const drcr = h.findIndex((x) => x === "type" || x.includes("dr/cr") || x.includes("dr / cr") || x.includes("txn type") || x.includes("transaction type"));
    return { headerRowIndex: i, headers: cells, map: { date, desc, debit, credit, amount, drcr } };
  }
  return null;
}

export function normDesc(s: string): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
