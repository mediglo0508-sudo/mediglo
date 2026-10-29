// ============================================================================
// Pure item-categorisation logic (no React / no Supabase client imports) so the
// same rules can run in the browser AND inside server functions / AI tools.
// `src/lib/item-category.ts` re-exports everything here for existing callers.
// ============================================================================

export type ItemCategory = "product" | "consultation" | "service";

export interface CatalogIndex {
  products: Set<string>;
  consultations: Set<string>;
  services: Set<string>;
}

/** Doctor fee / consultation heuristics for free-typed line descriptions. */
export const CONSULT_RE =
  /\b(consult|consultation|doctor|dr\.?\s|opd|physician|second opinion|follow[- ]?up visit)\b/i;
/** Pharmacy heuristics for free-typed line descriptions. */
export const PRODUCT_RE =
  /\b(tablet|tab\.?|cap(sule)?|syrup|cream|serum|lotion|gel|ointment|sunscreen|shampoo|soap|kit|bottle|sachet|injection|medicine)\b/i;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function buildCatalogIndex(
  products: { name: string | null }[] = [],
  services: { name: string | null; category?: string | null; sac_code?: string | null }[] = [],
): CatalogIndex {
  const idx: CatalogIndex = { products: new Set(), consultations: new Set(), services: new Set() };
  for (const p of products) {
    const k = norm(p.name);
    if (k) idx.products.add(k);
  }
  for (const s of services) {
    const k = norm(s.name);
    if (!k) continue;
    const isConsult = /consult/i.test(s.category ?? "") || CONSULT_RE.test(s.name ?? "");
    (isConsult ? idx.consultations : idx.services).add(k);
  }
  return idx;
}

export function classifyDescription(
  description: string | null | undefined,
  idx: CatalogIndex,
): ItemCategory {
  const k = norm(description);
  if (!k) return "service";
  if (idx.consultations.has(k)) return "consultation";
  if (idx.products.has(k)) return "product";
  if (idx.services.has(k)) return "service";
  if (CONSULT_RE.test(k)) return "consultation";
  if (PRODUCT_RE.test(k)) return "product";
  return "service";
}

/** Normalise a stored `invoice_lines.item_category` value. */
export function normalizeCategory(v: string | null | undefined): ItemCategory | null {
  const k = norm(v);
  if (k === "product" || k === "consultation" || k === "service") return k;
  return null;
}

/**
 * Strict category for a saved line: the immutable stored tag wins, and only
 * legacy rows without a tag fall back to description matching.
 */
export function lineCategory(
  line: { item_category?: string | null; description?: string | null },
  idx: CatalogIndex,
): ItemCategory {
  return normalizeCategory(line.item_category) ?? classifyDescription(line.description, idx);
}

export interface RevenueSplit {
  consultation: number;
  service: number;
  product: number;
}

/**
 * "Sacred OPD" revenue distribution for ONE invoice.
 *
 * Line totals are bucketed by their strict category, then any invoice-level
 * discount is absorbed ONLY by Services first and Products second. The doctor
 * consultation (OPD) amount is always reported at 100% of its original fee.
 */
export function splitInvoiceRevenue(
  lines: { item_category?: string | null; description?: string | null; line_total: number | string }[],
  invoiceDiscount: number,
  idx: CatalogIndex,
): RevenueSplit {
  const split: RevenueSplit = { consultation: 0, service: 0, product: 0 };
  for (const l of lines) {
    split[lineCategory(l, idx)] += Number(l.line_total) || 0;
  }
  let remaining = Math.max(0, Number(invoiceDiscount) || 0);
  const cutService = Math.min(split.service, remaining);
  split.service -= cutService;
  remaining -= cutService;
  const cutProduct = Math.min(split.product, remaining);
  split.product -= cutProduct;
  return {
    consultation: Math.round(split.consultation * 100) / 100,
    service: Math.round(split.service * 100) / 100,
    product: Math.round(split.product * 100) / 100,
  };
}
