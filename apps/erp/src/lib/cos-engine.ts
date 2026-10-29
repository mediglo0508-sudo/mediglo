// ============================================================================
// COS Automation Engine
// Hands-free business execution pipeline: cascading session scheduling,
// double-booking interception, inventory deduction hooks, financial alerts,
// and future-ready external dispatch adapters.
//
// Pure functional layer — no React/router state is touched here. All functions
// operate against Lovable Cloud (Supabase) via the shared browser client.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// System constants
// ---------------------------------------------------------------------------
/** Absolute fallback gap when no service-specific rule is configured. */
export const DEFAULT_GAP_DAYS = 20;
/** Weekly off-day(s): 0 = Sunday. Sessions landing here get a safety cushion. */
export const WEEKLY_OFF_DAYS = [0];

// ---------------------------------------------------------------------------
// Branch resolver — dynamically returns the primary branch UUID so callers
// never leak a raw string like "MAIN" into a uuid column.
// ---------------------------------------------------------------------------
let _cachedPrimaryBranchId: string | null = null;
export async function getPrimaryBranchId(): Promise<string> {
  if (_cachedPrimaryBranchId) return _cachedPrimaryBranchId;
  const { data, error } = await supabase
    .from("cos_branches")
    .select("id")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) throw new Error("No branch configured. Ask Admin to seed a branch in cos_branches.");
  _cachedPrimaryBranchId = data.id;
  return data.id;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseDate(iso: string): Date {
  // Anchor at UTC noon to avoid TZ rollover when adding day offsets.
  return new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
}
function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

/**
 * δ — safety cushion adjustment factor. If the target date falls on a weekly
 * off-day, push it forward until it clears the off-day. Returns the number of
 * cushion days applied (0 when no adjustment was needed).
 */
function offDayCushion(target: Date): { adjusted: Date; delta: number } {
  let delta = 0;
  let adjusted = target;
  while (WEEKLY_OFF_DAYS.includes(adjusted.getUTCDay())) {
    adjusted = addDays(adjusted, 1);
    delta += 1;
  }
  return { adjusted, delta };
}

// ---------------------------------------------------------------------------
// 1. Mathematical Cascading Session Scheduler Engine
// ---------------------------------------------------------------------------
export interface GeneratedSession {
  package_id: string;
  patient_id: string;
  session_number: number;
  scheduled_date: string;
  gap_days_applied: number;
  status: string;
}

/**
 * Resolve the configured interval from `cos_service_gap_rules`.
 * Prefers custom_gap_days, then default_gap_days, then the system constant.
 */
export async function resolveGapDays(serviceId: string | null): Promise<number> {
  if (!serviceId) return DEFAULT_GAP_DAYS;
  const { data } = await supabase
    .from("cos_service_gap_rules")
    .select("default_gap_days, custom_gap_days")
    .eq("service_id", serviceId)
    .maybeSingle();
  if (!data) return DEFAULT_GAP_DAYS;
  return Number(data.custom_gap_days ?? data.default_gap_days ?? DEFAULT_GAP_DAYS);
}

/**
 * generateAutomatedSessions — triggered immediately on Package Confirmation.
 *
 * Cascades future session dates sequentially using:
 *   S_i = S_{i-1} + Δt_interval + δ
 * where Δt_interval is the custom/default gap and δ is the off-day cushion.
 *
 * The first session is anchored on `startDate` (also cushion-adjusted).
 * Reads total_sessions & patient_id from the package, writes rows into
 * `cos_scheduled_sessions`, and returns the generated schedule.
 */
export async function generateAutomatedSessions(
  packageId: string,
  startDate: string,
  serviceId: string | null,
): Promise<GeneratedSession[]> {
  const { data: pkg, error: pkgErr } = await supabase
    .from("cos_treatment_packages")
    .select("patient_id, total_sessions")
    .eq("id", packageId)
    .single();
  if (pkgErr || !pkg) throw new Error(pkgErr?.message ?? "Package not found");
  if (!pkg.patient_id) throw new Error("Package has no linked patient; cannot schedule sessions.");
  const patientId: string = pkg.patient_id;

  const totalSessions = Math.max(0, Number(pkg.total_sessions ?? 0));
  if (totalSessions === 0) return [];

  const gap = await resolveGapDays(serviceId);
  const rows: GeneratedSession[] = [];

  // Session 1 anchor.
  let prev = parseDate(startDate);
  const first = offDayCushion(prev);
  prev = first.adjusted;
  rows.push({
    package_id: packageId,
    patient_id: patientId,
    session_number: 1,
    scheduled_date: toISODate(prev),
    gap_days_applied: first.delta,
    status: "Pending",
  });

  // Sessions 2..N cascade off the previous date.
  for (let i = 2; i <= totalSessions; i++) {
    const raw = addDays(prev, gap);
    const { adjusted, delta } = offDayCushion(raw);
    prev = adjusted;
    rows.push({
      package_id: packageId,
      patient_id: patientId,
      session_number: i,
      scheduled_date: toISODate(prev),
      gap_days_applied: gap + delta,
      status: "Pending",
    });
  }

  const { error: insErr } = await supabase.from("cos_scheduled_sessions").insert(rows);
  if (insErr) throw new Error(insErr.message);
  return rows;
}

/**
 * handleSessionReschedule — reactive cascading update.
 *
 * When a single session is moved, compute the variance Δd = newDate - originalDate
 * and shift ALL subsequent pending sessions in the same package forward by Δd.
 */
export async function handleSessionReschedule(
  currentSessionId: string,
  newDate: string,
): Promise<{ shifted: number }> {
  const { data: current, error } = await supabase
    .from("cos_scheduled_sessions")
    .select("id, package_id, session_number, scheduled_date")
    .eq("id", currentSessionId)
    .single();
  if (error || !current) throw new Error(error?.message ?? "Session not found");
  if (!current.package_id || !current.scheduled_date) throw new Error("Session is missing package or date.");

  const originalDate = parseDate(current.scheduled_date);
  const target = parseDate(newDate);
  const deltaMs = target.getTime() - originalDate.getTime();
  const deltaDays = Math.round(deltaMs / 86_400_000);

  // Update the rescheduled session itself.
  const { error: updErr } = await supabase
    .from("cos_scheduled_sessions")
    .update({ scheduled_date: toISODate(target) })
    .eq("id", currentSessionId);
  if (updErr) throw new Error(updErr.message);

  if (deltaDays === 0) return { shifted: 0 };

  // Fetch subsequent pending sessions in this package.
  const { data: subsequent } = await supabase
    .from("cos_scheduled_sessions")
    .select("id, scheduled_date, status, session_number")
    .eq("package_id", current.package_id)
    .gt("session_number", current.session_number)
    .neq("status", "Completed")
    .neq("status", "Cancelled");

  let shifted = 0;
  for (const s of subsequent ?? []) {
    if (!s.scheduled_date) continue;
    const nextDate = addDays(parseDate(s.scheduled_date), deltaDays);
    const { error: e } = await supabase
      .from("cos_scheduled_sessions")
      .update({ scheduled_date: toISODate(nextDate) })
      .eq("id", s.id);
    if (!e) shifted += 1;
  }
  return { shifted };
}

// ---------------------------------------------------------------------------
// 2. Double Booking & Room Resource Conflict Interceptor
// ---------------------------------------------------------------------------
export interface AppointmentSlot {
  appointment_date: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  doctor_id?: string | null;
  room_id?: string | null;
  excludeId?: string | null; // skip this appointment (edit flow)
}

function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}
/** Half-open interval overlap: [a,b) ∩ [c,d) ≠ ∅ */
function intervalsOverlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

/**
 * validateAppointmentLock — strict conflict gate.
 *
 * Conflict ⇔ same date ∧ time intervals intersect ∧ (same doctor ∨ same room).
 * Throws an explicit error naming the double-booked resource. Call before save.
 */
export async function validateAppointmentLock(slot: AppointmentSlot): Promise<true> {
  const reqStart = timeToMinutes(slot.start_time);
  const reqEnd = timeToMinutes(slot.end_time);

  const { data: existing } = await supabase
    .from("cos_appointments")
    .select("id, start_time, end_time, doctor_id, room_id")
    .eq("appointment_date", slot.appointment_date)
    .neq("status", "cancelled");

  for (const ex of existing ?? []) {
    if (slot.excludeId && ex.id === slot.excludeId) continue;
    if (!ex.start_time || !ex.end_time) continue;
    const exStart = timeToMinutes(ex.start_time);
    const exEnd = timeToMinutes(ex.end_time);
    if (!intervalsOverlap(reqStart, reqEnd, exStart, exEnd)) continue;

    const sameDoctor = !!slot.doctor_id && ex.doctor_id === slot.doctor_id;
    const sameRoom = !!slot.room_id && ex.room_id === slot.room_id;
    if (sameDoctor) {
      throw new Error(
        `Double-booking blocked: the selected Doctor already has an appointment during ${slot.start_time}–${slot.end_time} on ${slot.appointment_date}.`,
      );
    }
    if (sameRoom) {
      throw new Error(
        `Double-booking blocked: the selected Room is already occupied during ${slot.start_time}–${slot.end_time} on ${slot.appointment_date}.`,
      );
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// 3. Automated Real-Time Inventory Dilation & Deduction Hook
// ---------------------------------------------------------------------------
export interface ConsumedItem {
  item_id: string;
  qty_used: number;
}

/** Buffer threshold below which a Low_Stock alert is raised. */
export const LOW_STOCK_BUFFER = 5;

/**
 * deductInventoryOnSessionComplete — ledger deduction pipeline.
 *
 * Trigger when a session shifts to 'Completed'. Deducts consumed items from
 * `inventory`, then evaluates stock levels:
 *   - stock <= buffer  → Low_Stock notification for Admin
 *   - stock == 0       → Out of Stock flag + urgent dashboard banner payload
 */
export async function deductInventoryOnSessionComplete(
  sessionId: string,
  consumed: ConsumedItem[],
): Promise<{ deducted: number; alerts: string[] }> {
  const alerts: string[] = [];
  let deducted = 0;

  for (const c of consumed) {
    if (!c.item_id || c.qty_used <= 0) continue;
    const { data: item } = await supabase
      .from("inventory")
      .select("id, name, stock")
      .eq("id", c.item_id)
      .single();
    if (!item) continue;

    const nextStock = Math.max(0, Number(item.stock ?? 0) - Number(c.qty_used));
    const { error } = await supabase.from("inventory").update({ stock: nextStock }).eq("id", item.id);
    if (error) continue;
    deducted += 1;

    if (nextStock === 0) {
      alerts.push(`${item.name}: OUT OF STOCK`);
      await pushNotification({
        target_role: "Admin",
        notification_type: "Out_Of_Stock",
        title: "Urgent: Out of Stock",
        message: `${item.name} is fully depleted after session ${sessionId}. Reorder immediately.`,
        action_url: "/inventory",
      });
    } else if (nextStock <= LOW_STOCK_BUFFER) {
      alerts.push(`${item.name}: LOW (${nextStock} left)`);
      await pushNotification({
        target_role: "Admin",
        notification_type: "Low_Stock",
        title: "Low Stock Alert",
        message: `${item.name} is running low (${nextStock} units left, buffer ${LOW_STOCK_BUFFER}).`,
        action_url: "/inventory",
      });
    }
  }
  return { deducted, alerts };
}

// ---------------------------------------------------------------------------
// 4. Pending Payment Alert Interceptor & Notification Broadcaster
// ---------------------------------------------------------------------------
export interface FinancialCheckResult {
  hasOutstanding: boolean;
  outstanding: number;
  warning: string | null;
}

/**
 * checkPatientFinancialsBeforeBooking — runs on appointment creation / check-in.
 *
 * If any active package for the patient has outstanding_balance > 0, broadcasts
 * a warning notification to Reception & Counsellor and returns the aggregate
 * balance so the caller can raise a toast and attach a warning badge.
 */
export async function checkPatientFinancialsBeforeBooking(
  patientId: string,
): Promise<FinancialCheckResult> {
  const { data: pkgs } = await supabase
    .from("cos_treatment_packages")
    .select("outstanding_balance, package_name")
    .eq("patient_id", patientId);

  const outstanding = (pkgs ?? []).reduce(
    (sum, p) => sum + Math.max(0, Number(p.outstanding_balance ?? 0)),
    0,
  );

  if (outstanding <= 0) {
    return { hasOutstanding: false, outstanding: 0, warning: null };
  }

  const warning = `Outstanding balance of ₹${outstanding.toLocaleString("en-IN")} pending for this patient.`;
  await Promise.all([
    pushNotification({
      target_role: "Reception",
      notification_type: "Pending_Payment",
      title: "Pending Payment",
      message: warning,
      action_url: "/pos",
    }),
    pushNotification({
      target_role: "Counsellor",
      notification_type: "Pending_Payment",
      title: "Pending Payment",
      message: warning,
      action_url: "/pos",
    }),
  ]);

  return { hasOutstanding: true, outstanding, warning };
}

// ---------------------------------------------------------------------------
// Notification hub helper
// ---------------------------------------------------------------------------
export interface NotificationInput {
  target_role: string;
  notification_type: string;
  title: string;
  message: string;
  action_url?: string | null;
}
export async function pushNotification(n: NotificationInput): Promise<void> {
  const { error } = await supabase.from("cos_notifications_hub").insert({
    target_role: n.target_role,
    notification_type: n.notification_type,
    title: n.title,
    message: n.message,
    action_url: n.action_url ?? null,
    is_read: false,
  });
  if (error) console.warn("[cos-engine] notification failed:", error.message);
}

// ---------------------------------------------------------------------------
// 5. Future-Ready Webhook Adapters
// ---------------------------------------------------------------------------
// Abstract modular dispatch hooks. They log a standardized payload to the
// notifications hub as a "dispatch queue" and expose clean interface slots for
// future third-party API wiring (WhatsApp Business, SMS gateways, AI engines).
export type DispatchChannel = "whatsapp" | "sms" | "ai";
export interface DispatchPayload {
  channel: DispatchChannel;
  to: string;
  body: string;
  meta?: Record<string, unknown>;
}

async function enqueueDispatch(payload: DispatchPayload): Promise<void> {
  // Standardized queue log — replace body with a real provider call later.
  await pushNotification({
    target_role: "System",
    notification_type: `dispatch_${payload.channel}`,
    title: `Outbound ${payload.channel.toUpperCase()} queued`,
    message: JSON.stringify({ to: payload.to, body: payload.body, meta: payload.meta ?? {} }),
    action_url: null,
  });
  console.info(`[dispatch:${payload.channel}] →`, payload.to, payload.body);
}

/** Queue an outbound WhatsApp message (interface slot for future API). */
export async function sendExternalWhatsApp(to: string, body: string, meta?: Record<string, unknown>) {
  return enqueueDispatch({ channel: "whatsapp", to, body, meta });
}
/** Queue an outbound SMS (interface slot for future API). */
export async function sendExternalSMS(to: string, body: string, meta?: Record<string, unknown>) {
  return enqueueDispatch({ channel: "sms", to, body, meta });
}
/** Queue an AI-engine trigger (interface slot for future API). */
export async function triggerAIEngine(to: string, body: string, meta?: Record<string, unknown>) {
  return enqueueDispatch({ channel: "ai", to, body, meta });
}
