import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (handles conflicting utility classes). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Indian Rupees, e.g. 12345.5 -> "₹12,345.50". */
export function formatINR(amount: number | null | undefined): string {
  const value = amount ?? 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a date string/Date as "12 Sep 2026". */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "-";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Format a date+time string as "12 Sep 2026, 4:30 pm". */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "-";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** GST split helper - shared by POS, counselor quotation, and reception billing. */
export function calculateGst(
  amount: number,
  mode: "inclusive" | "exclusive",
  rate = 0.05
): { base: number; gst: number; cgst: number; sgst: number; total: number } {
  if (mode === "inclusive") {
    const base = amount / (1 + rate);
    const gst = amount - base;
    return { base, gst, cgst: gst / 2, sgst: gst / 2, total: amount };
  }
  const gst = amount * rate;
  return { base: amount, gst, cgst: gst / 2, sgst: gst / 2, total: amount + gst };
}

/** Generate a short client-side id for optimistic UI rows (server assigns the real UUID). */
export function tempId(): string {
  return `tmp_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// IST (India Standard Time, UTC+5:30) date helpers.
//
// The clinic operates in IST, but `new Date().toISOString().slice(0, 10)`
// (used all over the original build for "today") returns the UTC calendar
// date - between 00:00 and 05:29 IST that is silently YESTERDAY. That shifted
// "today's appointments", "today's sales", default voucher/expense dates,
// and the GST export's default date range by up to a full day, every single
// day, depending only on what time it is. These helpers compute the IST
// calendar date directly from the UTC epoch (immune to the browser/OS's own
// timezone setting, unlike relying on local Date methods), so "today" always
// means the clinic's own business day regardless of where or when the app
// happens to be opened.
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar date (YYYY-MM-DD) for a given instant. */
export function dateIST(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's date in IST, as YYYY-MM-DD - the correct replacement for
 * `new Date().toISOString().slice(0, 10)` everywhere "today" means the
 * clinic's business day. */
export function todayIST(): string {
  return dateIST(new Date());
}

/** The first day of the current IST calendar month, as YYYY-MM-DD. */
export function startOfMonthIST(): string {
  return `${todayIST().slice(0, 7)}-01`;
}

/** Convert an IST calendar-date boundary to the equivalent UTC instant
 * (ISO 8601), for filtering a `timestamptz` column (e.g. `invoices.created_at`)
 * by an IST calendar day/range. Comparing a bare date string directly against
 * a timestamptz column uses the database session's timezone (normally UTC),
 * which drifts the boundary by 5.5 hours from the clinic's actual day. */
export function istDateBoundaryToUtcISO(dateStr: string, endOfDay = false): string {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${dateStr}T${time}+05:30`).toISOString();
}

/** Build one `column.ilike."%value%"` clause for a PostgREST `.or()` filter,
 * with the value double-quoted and escaped. PostgREST's `.or()` mini-language
 * treats a bare `,` as a clause separator and `(`/`)` as grouping - a search
 * term containing any of those (e.g. a name with a comma) would otherwise
 * break the filter or silently match the wrong rows. Wrapping the value in
 * escaped double quotes is PostgREST's own documented escape mechanism. */
export function ilikeOrClause(column: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${column}.ilike."%${escaped}%"`;
}
