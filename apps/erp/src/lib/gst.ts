// MediGlo flat 5% GST engine (Module 4 & 5)
export const GST_RATE = 5; // mandated flat rate for all sales

export interface TaxBreakdown {
  base: number; // taxable value
  cgst: number; // 2.5%
  sgst: number; // 2.5% — ALWAYS identical to cgst
  roundOff: number; // residual paisa so base + cgst + sgst + roundOff === gross
  tax: number; // total GST
  gross: number; // grand total
}


/**
 * Inclusive: the entered amount already contains 5% GST.
 *   base = amount / 1.05 ; tax = amount - base
 * Exclusive: the entered amount is the taxable base.
 *   tax = amount * 0.05 ; gross = amount + tax
 */
export function computeTax(
  amount: number,
  mode: "inclusive" | "exclusive",
  ratePct: number = GST_RATE,
): TaxBreakdown {
  const a = Number.isFinite(amount) ? amount : 0;
  const rate = Number.isFinite(ratePct) ? ratePct : GST_RATE;
  let base: number;
  let gross: number;
  if (rate <= 0) {
    // GST-exempt line (e.g. Doctor Consultation @ 0%)
    base = a;
    gross = a;
  } else if (mode === "inclusive") {
    base = a / (1 + rate / 100);
    gross = a;
  } else {
    base = a;
    gross = a * (1 + rate / 100);
  }
  // Round the totals FIRST, then derive the second half by subtraction so the
  // parts always reconcile to the whole (no phantom paisa).
  const rBase = round2(base);
  const rGross = round2(gross);
  const rTax = round2(rGross - rBase);
  const half = round2(rTax / 2);
  const cgst = half;
  const sgst = half;
  const roundOff = round2(rGross - (rBase + cgst + sgst));
  return {
    base: rBase,
    cgst,
    sgst,
    roundOff,
    tax: rTax,
    gross: rGross,
  };
}

/**
 * Doctor Consultation is GST-exempt (0%). Everything else (clinical services
 * and products) is taxed at the flat 5% inclusive rate. Returns the GST rate %
 * to apply for a given line description.
 */
export function lineGstRate(description: string, sacCode?: string | null): number {
  const sac = String(sacCode ?? "").trim();
  if (sac === "999312") return 0; // Human health / OPD consultation SAC
  const d = String(description ?? "").toLowerCase();
  if (
    d.includes("consult") ||
    d.includes("opd") ||
    d.includes("dr.") ||
    d.includes("doctor")
  ) {
    return 0;
  }
  return GST_RATE;
}


// Effective-date freeze: stock & ledger impact only for entries on/after this date.
export const FREEZE_DATE = "2026-06-04";

export function isAfterFreeze(dateStr?: string | null): boolean {
  if (!dateStr) return true; // POS / undated entries are current
  return String(dateStr).slice(0, 10) >= FREEZE_DATE;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function inr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export function inr2(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}
