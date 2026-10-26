// Excel bulk-import engine for batch-managed inventory (Retail + Injectable).
// Pure parsing/validation — no DB calls. The RPC `import_inventory_rows` does the writes.
import * as XLSX from "xlsx";

export type ImportCategory = "Retail" | "Injectable";

export const IMPORT_FIELDS = [
  "name",
  "brand",
  "company",
  "supplier",
  "sub_category",
  "sku",
  "barcode",
  "batch_no",
  "expiry_date",
  "mrp",
  "purchase_price",
  "quantity",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Product Name *",
  brand: "Brand",
  company: "Company",
  supplier: "Supplier",
  sub_category: "Sub-category",
  sku: "SKU",
  barcode: "Barcode",
  batch_no: "Batch No.",
  expiry_date: "Expiry",
  mrp: "MRP *",
  purchase_price: "Purchase Price",
  quantity: "Quantity *",
};

// Header synonyms — matched case/space/punctuation-insensitively, longest first.
const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  name: ["descriptionmedicinename", "productname", "itemname", "description", "medicinename", "product", "item", "name", "particulars"],
  brand: ["brandname", "brand", "make"],
  company: ["companyname", "company", "manufacturer", "mfg"],
  supplier: ["suppliername", "supplier", "vendor", "distributor", "party"],
  sub_category: ["subcategory", "category", "type", "group", "segment"],
  sku: ["skucode", "sku", "itemcode", "productcode", "code"],
  barcode: ["barcode", "eancode", "ean", "upc"],
  batch_no: ["batchno", "batchnumber", "batch", "lotno", "lot"],
  expiry_date: ["expirydate", "expdate", "expiry", "exp", "expdt", "useby"],
  mrp: ["mrp", "mrprs", "rate", "price", "unitprice", "sellingprice"],
  purchase_price: ["purchaseprice", "purchaserate", "costprice", "cost", "ptr", "buyingprice"],
  quantity: ["quantity", "qty", "stock", "openingstock", "closingstock", "units", "nos"],
};

export interface SheetInfo {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  rows: unknown[][];
  category: ImportCategory | "skip";
  mapping: Partial<Record<ImportField, number>>;
}

export interface ParsedRow {
  row_index: number; // 1-based Excel row of the source line
  sheet: string;
  category: ImportCategory;
  name: string;
  brand: string;
  company: string;
  supplier: string;
  sub_category: string;
  sku: string;
  barcode: string;
  batch_no: string;
  expiry_date: string; // ISO yyyy-mm-dd or ""
  expiry_raw: string;
  mrp: number;
  purchase_price: number;
  quantity: number;
  errors: string[];
  skip: boolean;
  mergedFrom?: number[]; // other Excel rows merged into this one
}

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function detectField(header: unknown): ImportField | null {
  const h = norm(header);
  if (!h) return null;
  let best: { f: ImportField; len: number } | null = null;
  for (const f of IMPORT_FIELDS) {
    for (const syn of HEADER_SYNONYMS[f]) {
      if (h === syn || h.includes(syn)) {
        if (!best || syn.length > best.len) best = { f, len: syn.length };
      }
    }
  }
  return best?.f ?? null;
}

/** Read a workbook and return per-sheet grids with auto-detected header row + mapping. */
export function readWorkbook(data: ArrayBuffer): SheetInfo[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const out: SheetInfo[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    if (!grid.length) continue;

    // Header row = the first row within the top 15 whose cells map to >= 3 known fields.
    let headerRowIndex = 0;
    let bestScore = 0;
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const score = (grid[i] ?? []).filter((c) => detectField(c) !== null).length;
      if (score > bestScore) {
        bestScore = score;
        headerRowIndex = i;
      }
    }
    const headers = (grid[headerRowIndex] ?? []).map((c, i) =>
      String(c ?? "").trim() || `Column ${XLSX.utils.encode_col(i)}`,
    );
    const mapping: Partial<Record<ImportField, number>> = {};
    (grid[headerRowIndex] ?? []).forEach((cell, idx) => {
      const f = detectField(cell);
      if (f && mapping[f] === undefined) mapping[f] = idx;
    });

    const guess = norm(sheetName);
    const category: ImportCategory | "skip" = guess.includes("inject")
      ? "Injectable"
      : guess.includes("house")
        ? "skip"
        : "Retail";

    out.push({
      sheetName,
      headerRowIndex,
      headers,
      rows: grid.slice(headerRowIndex + 1),
      category,
      mapping,
    });
  }
  return out;
}

function textAt(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function numAt(row: unknown[], idx: number | undefined): number {
  if (idx === undefined) return 0;
  const v = row[idx];
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function lastDayOfMonth(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0)); // day 0 of next month = last day of this one
  return d.toISOString().slice(0, 10);
}

/**
 * Parse an expiry cell. Month/year forms ("03/28", "3-28", "Mar 2028") resolve to the
 * LAST day of that month — standard pharma convention.
 */
export function parseExpiry(raw: unknown): { iso: string; ok: boolean } {
  if (raw == null || raw === "") return { iso: "", ok: false };
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { iso: raw.toISOString().slice(0, 10), ok: true };
  }
  // Excel serial date
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    d.setUTCDate(d.getUTCDate() + Math.round(raw));
    return { iso: d.toISOString().slice(0, 10), ok: true };
  }
  const s = String(raw).trim();
  if (!s) return { iso: "", ok: false };

  // yyyy-mm-dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return { iso: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, ok: true };
  }
  // dd/mm/yyyy or dd-mm-yy
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, ok: true };
    }
  }
  // mm/yy or mm/yyyy → last day of month
  m = s.match(/^(\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const mo = Number(m[1]);
    let y = Number(m[2]);
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12) return { iso: lastDayOfMonth(y, mo), ok: true };
  }
  // Mon-YY / March 2028
  m = s.match(/^([a-z]{3,9})[-/ .]?(\d{2,4})$/i);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mo = months.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    let y = Number(m[2]);
    if (y < 100) y += 2000;
    if (mo > 0) return { iso: lastDayOfMonth(y, mo), ok: true };
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return { iso: d.toISOString().slice(0, 10), ok: true };
  return { iso: "", ok: false };
}

/** A row that only carries a single text cell acts as a sub-category banner for following rows. */
function isSectionHeader(row: unknown[], mapping: Partial<Record<ImportField, number>>): string | null {
  const filled = row
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c != null && String(c).trim() !== "");
  if (filled.length !== 1) return null;
  const only = filled[0];
  const val = String(only.c).trim();
  if (!/[a-z]/i.test(val)) return null;
  if (only.i === mapping.quantity || only.i === mapping.mrp) return null;
  return val;
}

export function extractRows(sheet: SheetInfo): ParsedRow[] {
  if (sheet.category === "skip") return [];
  const out: ParsedRow[] = [];
  let section = "";
  sheet.rows.forEach((row, i) => {
    const excelRow = sheet.headerRowIndex + 2 + i;
    const arr = Array.isArray(row) ? row : [];
    if (arr.every((c) => c == null || String(c).trim() === "")) return;
    const hdr = isSectionHeader(arr, sheet.mapping);
    if (hdr) {
      section = hdr;
      return;
    }
    const m = sheet.mapping;
    const name = textAt(arr, m.name);
    const expRaw = m.expiry_date === undefined ? "" : arr[m.expiry_date];
    const exp = parseExpiry(expRaw);
    out.push({
      row_index: excelRow,
      sheet: sheet.sheetName,
      category: sheet.category as ImportCategory,
      name,
      brand: textAt(arr, m.brand),
      company: textAt(arr, m.company),
      supplier: textAt(arr, m.supplier),
      sub_category: textAt(arr, m.sub_category) || section,
      sku: textAt(arr, m.sku),
      barcode: textAt(arr, m.barcode),
      batch_no: textAt(arr, m.batch_no),
      expiry_date: exp.iso,
      expiry_raw: expRaw instanceof Date ? expRaw.toISOString().slice(0, 10) : String(expRaw ?? ""),
      mrp: numAt(arr, m.mrp),
      purchase_price: numAt(arr, m.purchase_price),
      quantity: numAt(arr, m.quantity),
      errors: [],
      skip: false,
    });
  });
  return out;
}

export function validateRow(r: ParsedRow): string[] {
  const errs: string[] = [];
  if (!r.name.trim()) errs.push("Product name is blank");
  if (!(r.mrp > 0)) errs.push("MRP must be greater than 0");
  if (r.quantity < 0) errs.push("Quantity cannot be negative");
  if (!Number.isFinite(r.quantity)) errs.push("Quantity is not a number");
  if (!r.batch_no.trim()) errs.push("Batch No. is missing");
  if (r.expiry_raw.trim() && !r.expiry_date) errs.push(`Expiry "${r.expiry_raw}" is not a valid date`);
  return errs;
}

/**
 * Validate + merge in-sheet duplicates. Rows with the same product identity, batch and MRP
 * are merged (quantities summed); conflicting duplicates are flagged instead.
 */
export function validateAll(rows: ParsedRow[]): ParsedRow[] {
  const byKey = new Map<string, ParsedRow>();
  const out: ParsedRow[] = [];
  for (const r of rows) {
    const row = { ...r, errors: validateRow(r) };
    const key = [
      row.category,
      row.sku.toLowerCase() || row.barcode.toLowerCase() || `${row.brand.toLowerCase()}|${row.name.toLowerCase()}`,
      row.batch_no.toLowerCase(),
    ].join("::");
    const prev = row.errors.length === 0 ? byKey.get(key) : undefined;
    if (prev && prev.mrp === row.mrp && prev.expiry_date === row.expiry_date) {
      prev.quantity += row.quantity;
      prev.mergedFrom = [...(prev.mergedFrom ?? []), row.row_index];
      continue;
    }
    if (prev) row.errors.push(`Duplicate of row ${prev.row_index} with a different MRP/expiry`);
    if (row.errors.length === 0) byKey.set(key, row);
    out.push(row);
  }
  return out;
}

export interface ImportPayloadRow {
  row_index: number;
  name: string;
  brand: string;
  company: string;
  supplier: string;
  sub_category: string;
  sku: string;
  barcode: string;
  batch_no: string;
  expiry_date: string | null;
  mrp: number;
  purchase_price: number;
  quantity: number;
  category: ImportCategory;
}

export function toPayload(r: ParsedRow): ImportPayloadRow {
  return {
    row_index: r.row_index,
    name: r.name.trim(),
    brand: r.brand.trim(),
    company: r.company.trim(),
    supplier: r.supplier.trim(),
    sub_category: r.sub_category.trim(),
    sku: r.sku.trim(),
    barcode: r.barcode.trim(),
    batch_no: r.batch_no.trim() || "NO-BATCH",
    expiry_date: r.expiry_date || null,
    mrp: r.mrp,
    purchase_price: r.purchase_price,
    quantity: r.quantity,
    category: r.category,
  };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
