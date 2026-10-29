// Universal DD/MM/YYYY frontend formatter. Backend keeps ISO/UTC.
// Accepts ISO date strings ("2026-07-18", "2026-07-18T10:00:00Z"), Date, or null/undefined.
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  let d: Date;
  if (value instanceof Date) d = value;
  else {
    const s = String(value).trim();
    if (!s) return "";
    // Bare YYYY-MM-DD → treat as local calendar date to avoid UTC shift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
  }
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${fmtDate(d)} ${fmtTime12(d)}`;
}

/**
 * Universal 12-hour AM/PM time formatter.
 * Accepts "HH:MM", "HH:MM:SS", ISO datetime strings or Date.
 */
export function fmtTime12(value: string | Date | null | undefined): string {
  if (!value) return "";
  let h: number;
  let mi: number;
  if (value instanceof Date) {
    h = value.getHours();
    mi = value.getMinutes();
  } else {
    const s = String(value).trim();
    if (!s) return "";
    const m = /^(\d{1,2}):(\d{2})/.exec(s);
    if (m) {
      h = Number(m[1]);
      mi = Number(m[2]);
    } else {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return String(value);
      h = d.getHours();
      mi = d.getMinutes();
    }
  }
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${ampm}`;
}
