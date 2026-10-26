// Indian GST 2-digit state codes — Place of Supply (POS) vector for GSTR-1
export const GST_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

export function stateName(code: string) {
  return GST_STATES.find((s) => s.code === code)?.name ?? code;
}

export const PAYMENT_MODES = ["Cash", "UPI", "Card", "Net Banking", "Save in Finance", "Credit Card EMI", "Save In", "CNH"] as const;
// Widened to string: admins/accountants can add custom modes at runtime (app_settings.payment_modes).
export type PaymentMode = string;

// Counselor / deal-closure payment options (Stage 3)
export const DEAL_PAYMENT_MODES = ["UPI", "Cash", "Card", "Finance/EMI", "Part Payment/Advance", "Credit Card EMI", "Save In", "CNH"] as const;

// Active clinical nursing / therapist roster (fallback if staff table empty)
export const STAFF_ROSTER = ["Vikas Sir", "Gourav Sir"] as const;

export const AREAS_OF_INTEREST = ["Dr. Consultation", "Direct Treatment", "Counselling"] as const;

// Normalize raw payment text from imported sheets -> canonical mode (Module 9)
export function normalizePaymentMode(raw: unknown): PaymentMode {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v === "without upi" || v === "na" || v === "-") return "Cash";
  if (v === "cnh" || /\bcnh\b/.test(v)) return "CNH";
  if (/credit\s*card\s*emi|cc\s*emi|card\s*emi/.test(v)) return "Credit Card EMI";
  if (/^save\s?in$/.test(v)) return "Save In";
  if (v.includes("finance") || v.includes("emi") || v.includes("bajaj") || v.includes("snapmint"))
    return "Save in Finance";
  if (v.includes("savein") || v.includes("save in")) return "Save in Finance";
  if (v.includes("upi")) return "UPI";
  if (v.includes("razor") || v.includes("razer") || v.includes("paytm") || v.includes("online")) return "UPI";
  if (v.includes("card") || v.includes("swipe") || v.includes("pos")) return "Card";
  if (v.includes("net") || v.includes("bank") || v.includes("neft") || v.includes("imps") || v.includes("transfer"))
    return "Net Banking";
  if (v.includes("cash")) return "Cash";
  return "Cash";
}
