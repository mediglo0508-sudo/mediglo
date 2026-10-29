// Shared service-wallet redemption engine.
// A redemption = N rows in wallet_redemptions (the DB trigger decrements the
// wallet) + one treatment_logs row per session so the clinical history carries
// the *rendered* date, not the billing date. Backdating is fully supported.
import { supabase } from "@/integrations/supabase/client";

export interface RedeemInput {
  walletId: string;
  serviceName: string;
  patientName: string;
  sessions: number;
  /** yyyy-mm-dd — the date the service was actually rendered. */
  serviceDate: string;
  notes?: string | null;
  therapistId?: string | null;
  therapistName?: string | null;
  roomName?: string | null;
}

export interface RedeemResult {
  serviceName: string;
  patientName: string;
  serviceDate: string;
  sessionsUsed: number;
  totalSessions: number;
  consumedSessions: number;
  remaining: number;
  therapistName: string | null;
  notes: string | null;
}

/** Midday timestamp keeps a backdated entry on the intended calendar day in any TZ. */
export function dateToStamp(d: string) {
  return new Date(`${d}T12:00:00`).toISOString();
}

export async function redeemWalletSessions(input: RedeemInput): Promise<RedeemResult> {
  const sessions = Math.max(1, Math.floor(input.sessions));
  const stamp = dateToStamp(input.serviceDate);

  const { data: wallet, error: wErr } = await supabase
    .from("service_wallets")
    .select("id, service_name, customer_name, total_sessions, consumed_sessions")
    .eq("id", input.walletId)
    .single();
  if (wErr) throw wErr;
  const remainingBefore = Math.max(0, Number(wallet.total_sessions) - Number(wallet.consumed_sessions));
  if (sessions > remainingBefore) {
    throw new Error(`Only ${remainingBefore} session(s) remaining in this wallet`);
  }

  const rows = Array.from({ length: sessions }, () => ({
    wallet_id: input.walletId,
    redeemed_at: stamp,
    therapist_id: input.therapistId || null,
    therapist_name: input.therapistName || null,
    room_name: input.roomName || null,
    notes: input.notes || null,
    is_initial: false,
  }));
  const { error: rErr } = await supabase.from("wallet_redemptions").insert(rows);
  if (rErr) throw rErr;

  await logTreatmentSessions({
    patientName: input.patientName || wallet.customer_name || "Client",
    treatment: input.serviceName || wallet.service_name,
    therapist: input.therapistName ?? null,
    room: input.roomName ?? null,
    dates: Array.from({ length: sessions }, () => input.serviceDate),
  });

  const consumed = Number(wallet.consumed_sessions) + sessions;
  return {
    serviceName: input.serviceName || wallet.service_name,
    patientName: input.patientName || wallet.customer_name || "Client",
    serviceDate: input.serviceDate,
    sessionsUsed: sessions,
    totalSessions: Number(wallet.total_sessions),
    consumedSessions: consumed,
    remaining: Math.max(0, Number(wallet.total_sessions) - consumed),
    therapistName: input.therapistName ?? null,
    notes: input.notes ?? null,
  };
}

/** Write historical session rows (one per supplied date) into treatment_logs. */
export async function logTreatmentSessions(args: {
  patientName: string;
  treatment: string;
  therapist?: string | null;
  room?: string | null;
  dates: string[];
}) {
  const rows = args.dates
    .filter(Boolean)
    .map((d) => ({
      patient_name: args.patientName,
      treatment: args.treatment,
      therapist: args.therapist || null,
      room: args.room || null,
      started_at: dateToStamp(d),
      ended_at: dateToStamp(d),
      duration_sec: 0,
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("treatment_logs").insert(rows);
  if (error) throw error;
}
