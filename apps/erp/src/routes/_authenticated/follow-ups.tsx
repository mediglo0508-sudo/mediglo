import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { Phone, UserCheck, AlertTriangle, Loader2 } from "lucide-react";
import { useAutoFollowUpQueue, FOLLOWUP_GAP_DAYS } from "@/lib/followup-queue";
import { ClientTimelineDialog, type ClientTimelineTarget } from "@/components/ClientTimelineDialog";
import { FollowUpDialog, FOLLOWUP_STATUSES, type FollowUpRecord } from "@/components/FollowUpDialog";
import { getFollowUpDirectory } from "@/lib/followups.functions";
import { fmtDate } from "@/lib/date-format";
import { invalidateLedger } from "@/lib/ledger-cache";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  head: () => ({
    meta: [
      { title: "Follow-Ups — MGHYN Clinic ERP" },
      { name: "description", content: "CRM follow-up queue with assignment, due dates and outcomes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Follow-Ups — MGHYN Clinic ERP" },
      { property: "og:description", content: "CRM follow-up queue with assignment, due dates and outcomes." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/follow-ups" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/follow-ups" }],
  }),
  component: FollowUpsPage,
});

const UNASSIGNED = "__unassigned__";
const ALL = "__all__";

interface FollowUp extends FollowUpRecord {
  gap_stage: number | null;
  doctor_notes: string | null;
  counselor_notes: string | null;
  created_at: string;
}

function FollowUpsPage() {
  const { roles, user } = useAuth();
  const qc = useQueryClient();
  const [triggerTarget, setTriggerTarget] = useState<ClientTimelineTarget | null>(null);
  const [openFollowUp, setOpenFollowUp] = useState<FollowUp | null>(null);

  const allowed = roles.some((r) =>
    ["admin", "marketing_admin", "marketing_head", "marketing", "caller", "reception"].includes(r),
  );
  // Admin-like users may read AND assign every row (RLS mirrors this exactly).
  const isAdminLike = roles.some((r) => ["admin", "marketing_admin", "marketing_head"].includes(r));

  const { data: rows } = useQuery({
    queryKey: ["follow-ups"],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from("cos_follow_ups")
        .select("*")
        .order("next_followup_at", { ascending: true, nullsFirst: false });
      return (data ?? []) as FollowUp[];
    },
  });

  const directoryFn = useServerFn(getFollowUpDirectory);
  const { data: directory } = useQuery({
    queryKey: ["follow-up-directory"],
    enabled: allowed,
    staleTime: 300_000,
    queryFn: () => directoryFn({ data: undefined }),
  });

  const nameOf = useMemo(() => {
    const map = new Map((directory?.people ?? []).map((p) => [p.userId, p.name]));
    return (uid: string | null) =>
      !uid ? "Unassigned" : map.get(uid) ?? (uid === user?.id ? "You" : "Staff member");
  }, [directory, user?.id]);

  const team = directory?.team ?? [];

  const [fStatus, setFStatus] = useState(ALL);
  const [fAssignee, setFAssignee] = useState(ALL);
  const [fKind, setFKind] = useState(ALL);

  const statusOptions = useMemo(() => {
    const set = new Set<string>(FOLLOWUP_STATUSES);
    (rows ?? []).forEach((r) => set.add(r.status));
    return [...set];
  }, [rows]);

  const kindOptions = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => r.kind && set.add(r.kind));
    return [...set];
  }, [rows]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter((r) => {
        if (fStatus !== ALL && r.status !== fStatus) return false;
        if (fKind !== ALL && r.kind !== fKind) return false;
        if (fAssignee === UNASSIGNED && r.assigned_to) return false;
        if (fAssignee !== ALL && fAssignee !== UNASSIGNED && r.assigned_to !== fAssignee) return false;
        return true;
      }),
    [rows, fStatus, fKind, fAssignee],
  );

  const mine = useMemo(
    () => (rows ?? []).filter((r) => r.assigned_to && r.assigned_to === user?.id),
    [rows, user?.id],
  );
  const unassigned = useMemo(() => (rows ?? []).filter((r) => !r.assigned_to), [rows]);

  async function assignTo(id: string, uid: string | null) {
    const { error } = await supabase.from("cos_follow_ups").update({ assigned_to: uid }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(uid ? "Follow-up assigned" : "Assignment cleared");
    await qc.invalidateQueries({ queryKey: ["follow-ups"] });
    return true;
  }

  async function selfAssign(row: FollowUp) {
    if (!user) return;
    if (await assignTo(row.id, user.id)) {
      setOpenFollowUp({ ...row, assigned_to: user.id });
    }
  }

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Follow-Up Desk" subtitle="Cancelled & unpaid consult follow-ups." />
        <AccessDenied />
      </div>
    );
  }

  const gapChip = (dateIso: string | null) => {
    if (!dateIso) return null;
    const days = Math.floor((Date.parse(dateIso) - Date.now()) / 86400000);
    if (days <= 0) return { label: "Due now", cls: "bg-cos-due text-white" };
    if (days <= 2) return { label: `${days}d`, cls: "bg-cos-warn text-black" };
    if (days <= 4) return { label: `${days}d`, cls: "bg-cos-doctor text-white" };
    return { label: `${days}d`, cls: "bg-muted text-foreground" };
  };

  function Row({ r, showAssign, showSelfAssign }: { r: FollowUp; showAssign: boolean; showSelfAssign: boolean }) {
    const chip = gapChip(r.next_followup_at);
    return (
      <Card className="p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <button
            type="button"
            onClick={() => setOpenFollowUp(r)}
            className="min-w-0 rounded-md text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-semibold">{r.patient_name}</h4>
              <Badge variant="secondary">{r.kind}</Badge>
              {r.bucket && <Badge variant="outline">{r.bucket}</Badge>}
              {chip && (
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}>{chip.label}</span>
              )}
              <Badge>{r.status.replace("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{r.trigger_reason}</p>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {r.patient_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {r.patient_phone}
                </span>
              )}
              <span>Next: {r.next_followup_at ? fmtDate(r.next_followup_at) : "—"}</span>
              <span>Assignee: {nameOf(r.assigned_to)}</span>
            </p>
          </button>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {showAssign && (
              <Select
                value={r.assigned_to ?? UNASSIGNED}
                onValueChange={(v) => assignTo(r.id, v === UNASSIGNED ? null : v)}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Assign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {team.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name} · {m.roles.filter((x) => x.startsWith("marketing") || x === "caller").join(", ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {showSelfAssign && !r.assigned_to && (
              <Button size="sm" variant="outline" onClick={() => selfAssign(r)}>
                <UserCheck className="mr-1 h-3.5 w-3.5" /> Self assign
              </Button>
            )}
            <Button size="sm" onClick={() => setOpenFollowUp(r)}>
              Open
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setTriggerTarget({ name: r.patient_name, phone: r.patient_phone })}
            >
              360° view
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Follow-Up Desk"
        subtitle="Auto-queued: clients with an outstanding balance, or with unused package sessions remaining."
      />
      <AutoQueue />

      {isAdminLike ? (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold">All Follow-Ups ({filtered.length})</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fAssignee} onValueChange={setFAssignee}>
              <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All assignees</SelectItem>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fKind} onValueChange={setFKind}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {kindOptions.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {filtered.map((r) => (
              <Row key={r.id} r={r} showAssign showSelfAssign={false} />
            ))}
            {filtered.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                No follow-ups match these filters.
              </Card>
            )}
          </div>
        </>
      ) : (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold">My Follow-Ups ({mine.length})</h3>
          <div className="grid gap-3">
            {mine.map((r) => (
              <Row key={r.id} r={r} showAssign={false} showSelfAssign={false} />
            ))}
            {mine.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Nothing assigned to you yet — pick one from the unassigned pool below.
              </Card>
            )}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold">Unassigned ({unassigned.length})</h3>
          <div className="grid gap-3">
            {unassigned.map((r) => (
              <Row key={r.id} r={r} showAssign={false} showSelfAssign />
            ))}
            {unassigned.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Every follow-up has an owner.
              </Card>
            )}
          </div>
        </>
      )}

      <FollowUpDialog followUp={openFollowUp} onClose={() => setOpenFollowUp(null)} />
      <ClientTimelineDialog
        target={triggerTarget}
        onClose={() => {
          setTriggerTarget(null);
          invalidateLedger(qc);
          qc.invalidateQueries({ queryKey: ["auto-followup-queue"] });
          qc.invalidateQueries({ queryKey: ["client-timeline"] });
        }}
      />
    </div>
  );
}


/* ---------------------------------------------------------------------------
 * AutoQueue — strict queue: outstanding money OR unused wallet sessions.
 * Split into two tabs so collection work never mixes with service delivery.
 * ------------------------------------------------------------------------ */
function AutoQueue() {
  const { data: rows, isLoading } = useAutoFollowUpQueue();
  const [target, setTarget] = useState<ClientTimelineTarget | null>(null);
  const [tab, setTab] = useState<"collection" | "sessions">("collection");
  const qc = useQueryClient();

  const collection = useMemo(() => (rows ?? []).filter((r) => r.kind === "collection"), [rows]);
  const sessions = useMemo(() => (rows ?? []).filter((r) => r.kind === "sessions"), [rows]);

  if (isLoading) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Building follow-up queue…
      </Card>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No clients are pending. Everyone is settled with no unused sessions remaining.
      </Card>
    );
  }

  const active = tab === "collection" ? collection : sessions;

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
          <AlertTriangle className="h-4 w-4" /> Auto Follow-Up Queue ({rows.length})
        </h3>

        <div className="mb-3 inline-flex rounded-lg border bg-background p-0.5 text-xs font-medium">
          <button
            onClick={() => setTab("collection")}
            className={`rounded-md px-3 py-1.5 transition-colors ${tab === "collection" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Pending Collection ({collection.length})
          </button>
          <button
            onClick={() => setTab("sessions")}
            className={`rounded-md px-3 py-1.5 transition-colors ${tab === "sessions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Package / Service Due ({sessions.length})
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {active.map((r) => (
            <button
              key={r.key}
              onClick={() => setTarget({ name: r.name, phone: r.phone })}
              className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {r.phone ?? "—"}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-bold ${r.pending > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  ₹{r.pending.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="outline">
                  Last treatment: {r.lastTreatment ? fmtDate(r.lastTreatment) : "—"}
                </Badge>
                {r.sessionsLeft > 0 && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    {r.sessionsLeft} session{r.sessionsLeft === 1 ? "" : "s"} left
                  </Badge>
                )}
                {r.daysOverdue !== null && (
                  <Badge variant={r.daysOverdue > FOLLOWUP_GAP_DAYS ? "destructive" : "secondary"}>
                    {r.daysOverdue}d since visit
                  </Badge>
                )}
                {r.reasons.map((x) => (
                  <Badge key={x} variant="secondary">{x}</Badge>
                ))}
              </div>
            </button>
          ))}
          {active.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
              Nothing pending in this bucket.
            </p>
          )}
        </div>
      </Card>
      <ClientTimelineDialog
        target={target}
        onClose={() => {
          setTarget(null);
          // Dues may have been cleared from the drawer — refresh money-derived views.
          invalidateLedger(qc);
          qc.invalidateQueries({ queryKey: ["auto-followup-queue"] });
          qc.invalidateQueries({ queryKey: ["client-timeline"] });
        }}
      />
    </>
  );
}

