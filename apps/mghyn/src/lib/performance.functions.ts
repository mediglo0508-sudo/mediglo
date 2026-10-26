import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Unified performance dashboard payload. All numbers computed live from tables.
export interface TherapistRow {
  staff_id: string | null;
  name: string;
  clients: number;
  sessions: number;
  minutes: number;
  avg_minutes: number;
}

export interface MarketingRow {
  staff_id: string | null;
  name: string;
  followups_done: number;
  booked: number;
  arrived: number;
  conversion_pct: number;
  revenue: number;
}

export interface PerformancePayload {
  role: "admin" | "marketing_head" | "marketing" | "therapist" | "doctor" | "counselor" | "accountant" | "other";
  windowDays: number;
  invoices: { total_gross: number; total_paid: number; total_pending: number; count: number };
  therapists: TherapistRow[];
  marketing: MarketingRow[];
  visits: { total: number; completed: number; in_progress: number };
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

const ARRIVED = ["arrived", "checked in", "checked-in", "checkin", "check-in", "in progress", "in_progress", "checked out", "checked-out", "complete", "completed", "done", "out"];
const DONE = ["done", "completed", "complete", "closed", "converted"];

export const getPerformanceMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { windowDays?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<PerformancePayload> => {
    const windowDays = Math.max(1, Math.min(365, data.windowDays ?? 30));
    const fromDate = new Date(Date.now() - windowDays * 86400_000);
    const from = fromDate.toISOString().slice(0, 10);
    const fromTs = fromDate.toISOString();
    const { supabase, userId } = context;

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = new Set(((roleRows ?? []) as { role: string }[]).map((r) => r.role));
    const isAdmin = roles.has("admin") || roles.has("director") || roles.has("accountant");
    const role: PerformancePayload["role"] = roles.has("admin")
      ? "admin"
      : roles.has("accountant")
        ? "accountant"
        : roles.has("marketing_head")
          ? "marketing_head"
          : roles.has("marketing")
            ? "marketing"
            : roles.has("therapist")
              ? "therapist"
              : roles.has("doctor")
                ? "doctor"
                : roles.has("counselor")
                  ? "counselor"
                  : "other";

    // ---- Staff roster (names come straight from the staff / user_roles tables) ----
    const [{ data: staffRows }, { data: allRoleRows }] = await Promise.all([
      supabase.from("staff").select("id, name, user_id, role_title, active, status"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, Set<string>>();
    for (const r of (allRoleRows ?? []) as { user_id: string; role: string }[]) {
      const set = rolesByUser.get(r.user_id) ?? new Set<string>();
      set.add(r.role);
      rolesByUser.set(r.user_id, set);
    }
    type Member = { id: string | null; name: string; keys: Set<string> };
    const roster = (want: string[]): Member[] => {
      const out: Member[] = [];
      for (const s of (staffRows ?? []) as { id: string; name: string; user_id: string | null; role_title: string | null; active: boolean }[]) {
        if (s.active === false) continue;
        const userRoles = s.user_id ? rolesByUser.get(s.user_id) : undefined;
        const title = norm(s.role_title);
        const hit = want.some((w) => userRoles?.has(w) || title.includes(w.replace("_", " ")) || title.includes(w));
        if (!hit) continue;
        const keys = new Set<string>([norm(s.name)]);
        if (s.user_id) keys.add(norm(s.user_id));
        out.push({ id: s.id, name: s.name, keys });
      }
      return out;
    };

    // ---- Invoices summary ----
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, gross_total, paid_amount, pending_balance, customer_id, invoice_date")
      .is("voided_at", null)
      .gte("invoice_date", from);
    const invoiceRows = (invs ?? []) as {
      gross_total: number | null; paid_amount: number | null; pending_balance: number | null; customer_id: string | null;
    }[];
    const invoices = invoiceRows.reduce(
      (acc, r) => {
        acc.total_gross += Number(r.gross_total ?? 0);
        acc.total_paid += Number(r.paid_amount ?? 0);
        acc.total_pending += Number(r.pending_balance ?? 0);
        acc.count += 1;
        return acc;
      },
      { total_gross: 0, total_paid: 0, total_pending: 0, count: 0 },
    );
    const paidByCustomer = new Map<string, number>();
    for (const r of invoiceRows) {
      if (!r.customer_id) continue;
      paidByCustomer.set(r.customer_id, (paidByCustomer.get(r.customer_id) ?? 0) + Number(r.paid_amount ?? 0));
    }

    // ---- THERAPIST MODULE ----
    const therapistMembers = roster(["therapist"]);
    const { data: logs } = await supabase
      .from("treatment_logs")
      .select("therapist, duration_sec, patient_name, started_at")
      .gte("started_at", fromTs);

    const tStats = new Map<string, { clients: Set<string>; sessions: number; seconds: number }>();
    const bump = (key: string, patient: string, seconds: number) => {
      const cur = tStats.get(key) ?? { clients: new Set<string>(), sessions: 0, seconds: 0 };
      cur.sessions++;
      cur.seconds += seconds;
      if (patient) cur.clients.add(patient);
      tStats.set(key, cur);
    };
    for (const l of (logs ?? []) as { therapist: string | null; duration_sec: number | null; patient_name: string | null }[]) {
      bump(norm(l.therapist) || "unknown", norm(l.patient_name), Number(l.duration_sec ?? 0));
    }

    const therapists: TherapistRow[] = therapistMembers.map((m) => {
      const clients = new Set<string>();
      let sessions = 0;
      let seconds = 0;
      for (const k of m.keys) {
        const s = tStats.get(k);
        if (!s) continue;
        sessions += s.sessions;
        seconds += s.seconds;
        for (const c of s.clients) clients.add(c);
        tStats.delete(k);
      }
      const minutes = Math.round(seconds / 60);
      return {
        staff_id: m.id,
        name: m.name,
        clients: clients.size,
        sessions,
        minutes,
        avg_minutes: sessions ? Math.round(minutes / sessions) : 0,
      };
    });
    // Any logged therapist name not on the roster still shows up (no data is hidden).
    for (const [key, s] of tStats) {
      if (key === "unknown") continue;
      const minutes = Math.round(s.seconds / 60);
      therapists.push({
        staff_id: null,
        name: key,
        clients: s.clients.size,
        sessions: s.sessions,
        minutes,
        avg_minutes: s.sessions ? Math.round(minutes / s.sessions) : 0,
      });
    }
    therapists.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

    // ---- MARKETING MODULE ----
    const marketingMembers = roster(["marketing", "marketing_head"]);
    const [{ data: appts }, { data: fups }] = await Promise.all([
      supabase.from("cos_appointments").select("booked_by, status, checked_out_at, patient_id, appointment_date").gte("appointment_date", from),
      supabase.from("cos_follow_ups").select("assigned_to, status, updated_at").gte("updated_at", fromTs),
    ]);

    type MStat = { booked: number; arrived: number; patients: Set<string>; followups: number };
    const mStats = new Map<string, MStat>();
    const mGet = (k: string) => {
      const cur = mStats.get(k) ?? { booked: 0, arrived: 0, patients: new Set<string>(), followups: 0 };
      mStats.set(k, cur);
      return cur;
    };
    for (const a of (appts ?? []) as { booked_by: string | null; status: string | null; checked_out_at: string | null; patient_id: string | null }[]) {
      const key = norm(a.booked_by) || "unattributed";
      const st = mGet(key);
      st.booked++;
      const s = norm(a.status);
      const arrived = !!a.checked_out_at || ARRIVED.some((x) => s.includes(x));
      if (arrived) {
        st.arrived++;
        if (a.patient_id) st.patients.add(a.patient_id);
      }
    }
    for (const f of (fups ?? []) as { assigned_to: string | null; status: string | null }[]) {
      if (!DONE.some((d) => norm(f.status).includes(d))) continue;
      mGet(norm(f.assigned_to) || "unattributed").followups++;
    }

    const marketing: MarketingRow[] = marketingMembers.map((m) => {
      let booked = 0, arrived = 0, followups = 0, revenue = 0;
      for (const k of m.keys) {
        const s = mStats.get(k);
        if (!s) continue;
        booked += s.booked;
        arrived += s.arrived;
        followups += s.followups;
        for (const p of s.patients) revenue += paidByCustomer.get(p) ?? 0;
        mStats.delete(k);
      }
      return {
        staff_id: m.id,
        name: m.name,
        followups_done: followups,
        booked,
        arrived,
        conversion_pct: booked ? Math.round((arrived / booked) * 1000) / 10 : 0,
        revenue: Math.round(revenue * 100) / 100,
      };
    });
    for (const [key, s] of mStats) {
      if (key === "unattributed" || (!s.booked && !s.followups)) continue;
      let revenue = 0;
      for (const p of s.patients) revenue += paidByCustomer.get(p) ?? 0;
      marketing.push({
        staff_id: null,
        name: key,
        followups_done: s.followups,
        booked: s.booked,
        arrived: s.arrived,
        conversion_pct: s.booked ? Math.round((s.arrived / s.booked) * 1000) / 10 : 0,
        revenue: Math.round(revenue * 100) / 100,
      });
    }
    marketing.sort((a, b) => b.revenue - a.revenue || b.booked - a.booked || a.name.localeCompare(b.name));

    // ---- Visits summary ----
    const { data: pv } = await supabase.from("patient_visits").select("status, created_at").gte("created_at", from);
    const visits = { total: 0, completed: 0, in_progress: 0 };
    for (const v of (pv ?? []) as { status: string | null }[]) {
      visits.total++;
      const s = norm(v.status);
      if (s === "completed") visits.completed++;
      else if (s === "in_progress" || s === "in progress") visits.in_progress++;
    }

    // Non-privileged staff only see their own row.
    const selfName = norm((staffRows ?? []).find((s) => s.user_id === userId)?.name);
    if (!isAdmin && role !== "marketing_head" && selfName) {
      return {
        role,
        windowDays,
        invoices,
        visits,
        therapists: therapists.filter((t) => norm(t.name) === selfName),
        marketing: marketing.filter((m) => norm(m.name) === selfName),
      };
    }

    return { role, windowDays, invoices, therapists, marketing, visits };
  });
