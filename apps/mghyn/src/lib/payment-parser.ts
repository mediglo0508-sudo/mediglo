// Shared payment tokenizer for POS / WhatsApp / Excel importers.
// Accepts free-form payment expressions and returns per-mode splits + pending.

export type PayMode = "Cash" | "UPI" | "Card" | "Razorpay" | "Finance" | "SaveIn" | "Credit" | "Pending";

export interface PaySplit { mode: PayMode; amount: number; }
export interface ParsedPayment { splits: PaySplit[]; pending: number; label: string; }

const MODE_ALIASES: Array<[RegExp, PayMode]> = [
  [/\b(upi|gpay|google\s?pay|phonepe|paytm|bhim)\b/i, "UPI"],
  [/\b(cash)\b/i, "Cash"],
  [/\b(card|swipe|pos|debit|credit\s?card|visa|master(card)?)\b/i, "Card"],
  [/\b(razor\s?pay|razorpay|rzp)\b/i, "Razorpay"],
  [/\b(finance|emi|no\s?cost\s?emi|bajaj|snapmint)\b/i, "Finance"],
  [/\b(save\s?in|savein|advance|deposit)\b/i, "SaveIn"],
  [/\b(credit|cr)\b/i, "Credit"],
  [/\b(net\s?bank(ing)?|neft|imps|rtgs|transfer)\b/i, "UPI"], // treat bank transfer as UPI-like online
];

function detectMode(token: string): PayMode | null {
  for (const [re, mode] of MODE_ALIASES) if (re.test(token)) return mode;
  return null;
}

function firstAmount(s: string): number {
  const m = s.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!m) return 0;
  return Number(m[1].replace(/,/g, "")) || 0;
}

/**
 * Parse payment expressions:
 *   "1000 UPI", "500 Cash + 500 UPI", "9000 UPI + 6000 Cash",
 *   "Cash & UPI 5000+5000", "Card 2000", "Pending 5000", "Razorpay 3000"
 * Returns explicit splits and pending amount.
 */
export function parsePayment(raw: string | null | undefined, totalHint?: number): ParsedPayment {
  const s = String(raw ?? "").trim();
  const splits: PaySplit[] = [];
  let pending = 0;
  if (!s) return { splits, pending, label: "" };

  // Extract "Pending N" first, then remove it.
  let rest = s;
  const pendM = rest.match(/pending\s*[:.-]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (pendM) { pending = Number(pendM[1].replace(/,/g, "")) || 0; rest = rest.replace(pendM[0], " "); }

  // Split on + / & / , / and
  const parts = rest.split(/\s*(?:\+|&|,|\band\b|\bplus\b)\s*/i).map((p) => p.trim()).filter(Boolean);

  // Case A: parts each contain amount+mode (typical)
  const modeAmountEach = parts.every((p) => detectMode(p) && firstAmount(p) > 0);
  if (modeAmountEach && parts.length > 0) {
    for (const p of parts) {
      const m = detectMode(p)!;
      const a = firstAmount(p);
      if (a > 0) splits.push({ mode: m, amount: a });
    }
  } else {
    // Case B: modes and numbers listed separately, e.g. "Cash & UPI 5000+5000"
    const modeTokens: PayMode[] = [];
    const numberTokens: number[] = [];
    for (const p of parts) {
      const m = detectMode(p);
      const a = firstAmount(p);
      if (m) modeTokens.push(m);
      if (a > 0) numberTokens.push(a);
    }
    // Also extract standalone numbers separated by + inside original rest
    const numMatches = [...rest.matchAll(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
    if (numMatches.length > numberTokens.length) numberTokens.splice(0, numberTokens.length, ...numMatches);

    if (modeTokens.length && numberTokens.length === modeTokens.length) {
      for (let i = 0; i < modeTokens.length; i++) splits.push({ mode: modeTokens[i], amount: numberTokens[i] });
    } else if (modeTokens.length === 1 && numberTokens.length >= 1) {
      const sum = numberTokens.reduce((a, b) => a + b, 0);
      splits.push({ mode: modeTokens[0], amount: sum });
    } else if (modeTokens.length && !numberTokens.length && typeof totalHint === "number") {
      // No explicit amount; assume single mode covers the invoice total.
      splits.push({ mode: modeTokens[0], amount: Math.max(0, totalHint - pending) });
    }
  }

  const label = splits.length
    ? splits.map((s) => `${s.mode} ${s.amount}`).join(" + ") + (pending ? ` (pending ${pending})` : "")
    : (pending ? `Pending ${pending}` : s);
  return { splits, pending, label };
}
