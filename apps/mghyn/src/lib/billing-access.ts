import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BillingAccess {
  user_id: string | null;
  billing_locked: boolean;
  lock_reason: string | null;
  locked_at: string | null;
  locked_by_name: string | null;
  can_override_duplicate: boolean;
}

const OPEN: BillingAccess = {
  user_id: null,
  billing_locked: false,
  lock_reason: null,
  locked_at: null,
  locked_by_name: null,
  can_override_duplicate: false,
};

export interface DuplicateMatch {
  invoice_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  customer_name: string | null;
  customer_id: string | null;
  gross_total: number | null;
  paid_amount: number | null;
  pending_balance: number | null;
  payment_mode: string | null;
  services: string | null;
  source: string | null;
  created_by_name: string | null;
  created_at: string | null;
  level: "possible" | "high";
  score: number | null;
  reasons: string[];
}

export interface DuplicateCheckResult {
  level: "none" | "possible" | "high";
  can_override: boolean;
  matches: DuplicateMatch[];
}

export interface DuplicateCheckPayload {
  customer_name?: string;
  customer_id?: string | null;
  phone?: string | null;
  invoice_date?: string;
  gross_total?: number;
  payment_mode?: string;
  lines?: { description: string }[];
  exclude_invoice_id?: string | null;
}

export type BillingEventType =
  | "duplicate_warned"
  | "duplicate_blocked"
  | "duplicate_overridden"
  | "duplicate_override_denied"
  | "blocked_attempt"
  | "bill_printed";


export interface BillingEventPayload {
  event_type: BillingEventType;
  invoice_id?: string | null;
  invoice_no?: string | null;
  matched_invoice_id?: string | null;
  matched_invoice_no?: string | null;
  match_level?: string | null;
  match_score?: number | null;
  match_reasons?: string[] | null;
  customer_name?: string | null;
  phone?: string | null;
  amount?: number | null;
  entry_point?: string | null;
  reason?: string | null;
}

/** Live billing-lock state for the signed-in user. A failure is treated as NOT locked. */
export function useBillingAccess() {
  const q = useQuery({
    queryKey: ["billing-access"],
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BillingAccess> => {
      const { data, error } = await supabase.rpc("my_billing_access");
      if (error || !data) return OPEN;
      const r = data as Partial<BillingAccess>;
      return {
        user_id: r.user_id ?? null,
        billing_locked: !!r.billing_locked,
        lock_reason: r.lock_reason ?? null,
        locked_at: r.locked_at ?? null,
        locked_by_name: r.locked_by_name ?? null,
        can_override_duplicate: !!r.can_override_duplicate,
      };
    },
  });
  return q.data ?? OPEN;
}

export async function checkDuplicateBill(
  payload: DuplicateCheckPayload,
): Promise<DuplicateCheckResult> {
  const { data, error } = await supabase.rpc("check_duplicate_bill", {
    p: payload as never,
  });
  if (error || !data) return { level: "none", can_override: false, matches: [] };
  const r = data as Partial<DuplicateCheckResult>;
  return {
    level: r.level ?? "none",
    can_override: !!r.can_override,
    matches: (r.matches ?? []) as DuplicateMatch[],
  };
}

export async function logBillingEvent(payload: BillingEventPayload): Promise<void> {
  try {
    await supabase.rpc("log_billing_event", { p: payload as never });
  } catch {
    /* auditing must never block billing */
  }
}

export const BILLING_LOCKED_MESSAGE =
  "Billing access has been locked by Admin. Please contact Admin/Director.";

/** Turns raw Postgres billing-guard errors into text the front desk can act on. */
export function friendlyBillingError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : ((err as { message?: string } | null)?.message ?? "Something went wrong");

  if (raw.includes("BILLING_LOCKED")) {
    const m = raw.match(/\(Reason:\s*([^)]*)\)/i);
    const reason = m?.[1]?.trim();
    return reason ? `${BILLING_LOCKED_MESSAGE} Reason: ${reason}` : BILLING_LOCKED_MESSAGE;
  }
  if (raw.includes("DUPLICATE_OVERRIDE_FORBIDDEN")) {
    return "Only an Admin/Director can save a bill flagged as a high-confidence duplicate.";
  }
  if (raw.includes("DUPLICATE_BILL_HIGH")) {
    return raw.split("DUPLICATE_BILL_HIGH:")[1]?.trim() || raw;
  }
  if (raw.includes("DUPLICATE_ACK_INVALID")) {
    return raw.split("DUPLICATE_ACK_INVALID:")[1]?.trim() || raw;
  }
  if (raw.includes("FORBIDDEN:")) {
    return raw.split("FORBIDDEN:")[1]?.trim() || raw;
  }
  if (/permission denied|row-level security|violates row-level/i.test(raw)) {
    return `Your role is not allowed to do this. Only Admin, Accountant, Front-Desk or Pharmacist can edit or cancel invoices. (${raw})`;
  }
  return raw;

}

export function isBillingLockedError(message: string): boolean {
  return message.startsWith(BILLING_LOCKED_MESSAGE);
}
