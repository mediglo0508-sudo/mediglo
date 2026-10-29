// ============================================================================
// Follow-Up queue reader.
// The queue itself is materialised SERVER-SIDE by public.materialise_follow_ups()
// into public.cos_follow_ups, because marketing roles deliberately have no read
// access to invoices / service_wallets. The browser only reads the result.
//
// Business rules (implemented in the SQL function, unchanged):
//   • outstanding balance on live invoices  → "collection"
//   • unused sessions in an active wallet   → "sessions"
//   • neither → never queued; the 14-day gap only adds a reason/priority.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const FOLLOWUP_GAP_DAYS = 14;

export type FollowUpKind = "collection" | "sessions";

export interface AutoFollowUp {
  key: string;
  id: string;
  kind: FollowUpKind;
  name: string;
  phone: string | null;
  lastTreatment: string | null;
  daysOverdue: number | null;
  pending: number;
  sessionsLeft: number;
  reasons: string[];
  status: string;
  assignedTo: string | null;
}

interface Row {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  trigger_reason: string | null;
  notes: string | null;
  kind: string | null;
  status: string;
  assigned_to: string | null;
  source_key: string | null;
}

function parseNotes(notes: string | null) {
  const pending = Number(/Pending ₹\s*([\d.]+)/.exec(notes ?? "")?.[1] ?? 0);
  const sessions = Number(/(\d+)\s+unused session/.exec(notes ?? "")?.[1] ?? 0);
  const last = /last activity\s+([\d-]+)/.exec(notes ?? "")?.[1] ?? null;
  return { pending: Number.isFinite(pending) ? pending : 0, sessions, last };
}

export function useAutoFollowUpQueue(enabled = true) {
  return useQuery({
    queryKey: ["auto-followup-queue"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AutoFollowUp[]> => {
      const { data } = await supabase
        .from("cos_follow_ups")
        .select(
          "id, patient_name, patient_phone, trigger_reason, notes, kind, status, assigned_to, source_key",
        )
        .not("source_key", "is", null)
        .neq("status", "closed")
        .order("updated_at", { ascending: false });

      const rows = (data ?? []) as Row[];

      const out = rows.map((r) => {
        const { pending, sessions, last } = parseNotes(r.notes);
        const reasons = (r.trigger_reason ?? "")
          .split(" · ")
          .map((s) => s.trim())
          .filter(Boolean);
        const gapText = reasons.find((s) => s.startsWith("No visit in"));
        const gap = gapText ? Number(/(\d+)/.exec(gapText)?.[1] ?? 0) : null;

        return {
          key: r.source_key ?? r.id,
          id: r.id,
          kind: (r.kind === "sessions" ? "sessions" : "collection") as FollowUpKind,
          name: r.patient_name,
          phone: r.patient_phone,
          lastTreatment: last,
          daysOverdue: gap,
          pending: Math.round(pending * 100) / 100,
          sessionsLeft: sessions,
          reasons,
          status: r.status,
          assignedTo: r.assigned_to,
        } satisfies AutoFollowUp;
      });

      return out.sort(
        (x, y) =>
          y.pending - x.pending ||
          y.sessionsLeft - x.sessionsLeft ||
          (y.daysOverdue ?? 0) - (x.daysOverdue ?? 0),
      );
    },
  });
}
