// ============================================================================
// SmartCalendar — Google Calendar-style pixel timeline
//   • Concurrent appointments render side-by-side in lanes (no hiding).
//   • Flexible timing: any start/end time via <input type="time">.
//   • Native drag to reposition + bottom-edge resize.
//   • Card face shows Patient · Service · Notes at a glance.
//   • Hard conflict only for Doctor Consultations (server trigger enforces).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/realtime";
import { checkPatientFinancialsBeforeBooking, getPrimaryBranchId } from "@/lib/cos-engine";
import { fmtDate, fmtTime12 } from "@/lib/date-format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { AppointmentDetailsModal } from "@/components/appointments/AppointmentDetailsModal";
import { AppointmentEditModal } from "@/components/appointments/AppointmentEditModal";
import {
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Check, ChevronsUpDown, UserPlus,
  LogIn, XCircle, Info, Pencil, CalendarClock, Trash2,
} from "lucide-react";

const DAY_START_MIN = 8 * 60;     // 08:00
const DAY_END_MIN = 20 * 60;      // 20:00
const PX_PER_MIN = 1.1;           // 12h * 60m * 1.1 ≈ 792px column height
const SNAP_MIN = 5;
const MIN_DURATION = 15;
const HOUR_ROWS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 }, (_, i) => DAY_START_MIN / 60 + i);

type ViewMode = "day" | "week" | "month";

interface Appt {
  id: string;
  patient_id: string;
  doctor_id: string;
  counsellor_id: string | null;
  room_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  patient_concern: string | null;
  discussion_notes: string | null;
  followup_details: string | null;
  offer_applied_id: string | null;
  consultation_route: string | null;
  service_id: string | null;
  therapist_id?: string | null;
  important_note?: string | null;
  color_tag?: string | null;
  color_hex?: string | null;
}

/** Google-Calendar style palette for colour-tagging an appointment. */
const COLOR_PRESETS: { tag: string; hex: string }[] = [
  { tag: "tomato", hex: "#D50000" },
  { tag: "flamingo", hex: "#E67C73" },
  { tag: "tangerine", hex: "#F4511E" },
  { tag: "banana", hex: "#F6BF26" },
  { tag: "sage", hex: "#33B679" },
  { tag: "basil", hex: "#0B8043" },
  { tag: "peacock", hex: "#039BE5" },
  { tag: "blueberry", hex: "#3F51B5" },
  { tag: "lavender", hex: "#7986CB" },
  { tag: "grape", hex: "#8E24AA" },
  { tag: "graphite", hex: "#616161" },
];

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function hhmm(t: string) { return t.slice(0, 5); }
/** Display-only 12-hour label (inputs still use 24h HH:MM values). */
function t12(t: string) { return fmtTime12(t); }
function toMin(t: string) { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); }
function fromMin(m: number) { const h = Math.floor(m / 60); const mm = m % 60; return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`; }
function snap(m: number) { return Math.round(m / SNAP_MIN) * SNAP_MIN; }

/** 12-hour AM/PM time dropdown. Value stays "HH:MM" (24h) for the DB. */
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 5) {
    opts.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  const v = hhmm(value);
  if (v && !opts.includes(v)) opts.push(v);
  opts.sort();
  return (
    <Select value={v} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {opts.map((o) => <SelectItem key={o} value={o}>{fmtTime12(o)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
function isConsultation(a: Pick<Appt, "consultation_route" | "patient_concern">): boolean {
  const r = (a.consultation_route ?? "").toLowerCase();
  const c = (a.patient_concern ?? "").toLowerCase();
  return r.includes("consult") || r === "doctor" || c.includes("consult");
}

type Look = { bg: string; text: string; label: string };
function statusLook(status: string | null | undefined): Look {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return { bg: "bg-cal-cancelled", text: "text-cal-cancelled-text", label: "Cancelled" };
  if (s.includes("resched")) return { bg: "bg-cal-rescheduled", text: "text-cal-rescheduled-text", label: "Rescheduled" };
  if (s.includes("out") || s.includes("complete")) return { bg: "bg-muted-foreground", text: "text-white", label: "Checked-Out" };
  if (s.includes("check")) return { bg: "bg-cal-checkedin", text: "text-cal-checkedin-text", label: "Checked-In" };
  return { bg: "bg-cal-scheduled", text: "text-cal-scheduled-text", label: "Scheduled" };
}

// ---------------------------------------------------------------------------
// Lane layout — Google-Calendar-style greedy packing
// ---------------------------------------------------------------------------
interface LaidOut { appt: Appt; startMin: number; endMin: number; lane: number; laneCount: number }
function layoutLanes(appts: Appt[]): LaidOut[] {
  const items = appts
    .map((a) => ({ appt: a, startMin: toMin(a.start_time), endMin: Math.max(toMin(a.end_time), toMin(a.start_time) + MIN_DURATION) }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: LaidOut[] = [];
  // Sweep-line grouping: any two items that transitively overlap share a laneCount.
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const lanes: number[] = []; // lanes[i] = endMin of last item in that lane
    const assign: number[] = [];
    for (const it of cluster) {
      let lane = lanes.findIndex((e) => e <= it.startMin);
      if (lane === -1) { lane = lanes.length; lanes.push(it.endMin); }
      else lanes[lane] = it.endMin;
      assign.push(lane);
    }
    const laneCount = lanes.length;
    cluster.forEach((it, i) => out.push({ ...it, lane: assign[i], laneCount }));
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const it of items) {
    if (it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SmartCalendar() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [booking, setBooking] = useState<{ date: string; startMin: number; endMin: number } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Appt | null>(null);
  const [editTarget, setEditTarget] = useState<Appt | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appt | null>(null);
  // Client + booking editor opened from the details modal.
  const [clientEditId, setClientEditId] = useState<string | null>(null);

  useRealtimeSync(["cos_appointments"], ["cos-appointments", "cos-cal-dues"]);

  const range = useMemo(() => {
    if (view === "day") return { from: iso(anchor), to: iso(anchor), days: [new Date(anchor)] };
    if (view === "week") {
      const s = startOfWeek(anchor);
      const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
      return { from: iso(days[0]), to: iso(days[6]), days };
    }
    const s = startOfMonth(anchor);
    const gridStart = startOfWeek(s);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return { from: iso(days[0]), to: iso(days[41]), days };
  }, [view, anchor]);

  const { data: appts } = useQuery({
    queryKey: ["cos-appointments", range.from, range.to],
    queryFn: async () =>
      ((await supabase.from("cos_appointments").select("*")
        .gte("appointment_date", range.from).lte("appointment_date", range.to)
        .order("start_time")).data ?? []) as Appt[],
  });

  const { data: dueSet } = useQuery({
    queryKey: ["cos-cal-dues"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("customer_id, pending_balance").gt("pending_balance", 0);
      const s = new Set<string>();
      for (const r of data ?? []) if (r.customer_id) s.add(r.customer_id);
      return s;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["cal-patients"],
    queryFn: async () =>
      ((await supabase.from("customers").select("id, name, phone").order("name")).data ?? []) as PatientLite[],
  });
  const patientName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients ?? []) m.set(p.id, p.name);
    return m;
  }, [patients]);

  const { data: services } = useQuery({
    queryKey: ["cal-services-map"],
    queryFn: async () =>
      ((await supabase.from("services_master").select("id, name")).data ?? []) as { id: string; name: string }[],
  });
  const serviceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services ?? []) m.set(s.id, s.name);
    return m;
  }, [services]);

  const { data: returningSet } = useQuery({
    queryKey: ["cos-returning-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("cos_appointments").select("patient_id");
      const counts = new Map<string, number>();
      for (const r of (data ?? []) as { patient_id: string }[]) {
        counts.set(r.patient_id, (counts.get(r.patient_id) ?? 0) + 1);
      }
      const s = new Set<string>();
      counts.forEach((n, id) => { if (n > 1) s.add(id); });
      return s;
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of appts ?? []) {
      const arr = m.get(a.appointment_date) ?? [];
      arr.push(a);
      m.set(a.appointment_date, arr);
    }
    return m;
  }, [appts]);

  function shift(dir: number) {
    if (view === "day") setAnchor((d) => addDays(d, dir));
    else if (view === "week") setAnchor((d) => addDays(d, dir * 7));
    else setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }

  const heading =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "day"
        ? `${anchor.toLocaleDateString(undefined, { weekday: "long" })} · ${fmtDate(anchor)}`
        : `${fmtDate(range.days[0])} – ${fmtDate(range.days[6])}`;

  async function checkIn(a: Appt) {
    const name = patientName.get(a.patient_id) ?? "Patient";
    let route: "doctor" | "counselor" = "doctor";
    try {
      const meta = a.discussion_notes ? JSON.parse(a.discussion_notes) : null;
      if (meta?.route === "counselor") route = "counselor";
    } catch { /* legacy */ }
    const { error } = await supabase.from("cos_appointments").update({ status: "Checked-In" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("patient_visits").insert({
      customer_name: name,
      status: route === "counselor" ? "counselor" : "waiting",
      area_of_interest: route === "counselor" ? "Counselling" : "Dr. Consultation",
    });
    try {
      const { data: dues } = await supabase.from("invoices")
        .select("pending_balance").eq("customer_id", a.patient_id).gt("pending_balance", 0);
      const due = (dues ?? []).reduce((s, r) => s + Number(r.pending_balance || 0), 0);
      if (due > 0) toast.warning(`⚠ ${name} has an outstanding balance of ₹${due.toFixed(2)}.`, { duration: 8000 });
    } catch { /* non-fatal */ }
    toast.success(`${name} checked in`);
    qc.invalidateQueries({ queryKey: ["cos-appointments"] });
    qc.invalidateQueries({ queryKey: ["reception-visits"] });
  }
  async function cancelAppt(a: Appt) {
    const { error } = await supabase.from("cos_appointments").update({ status: "Cancelled" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Appointment cancelled");
    qc.invalidateQueries({ queryKey: ["cos-appointments"] });
  }
  function deleteAppt(a: Appt) { setDeleteTarget(a); }

  async function confirmDelete() {
    const a = deleteTarget;
    if (!a) return;
    const { error } = await supabase.from("cos_appointments").delete().eq("id", a.id);
    setDeleteTarget(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Appointment deleted");
    qc.invalidateQueries({ queryKey: ["cos-appointments"] });
  }

  async function checkOut(a: Appt) {
    const { error } = await supabase.from("cos_appointments")
      .update({ status: "Checked-Out", checked_out_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Patient checked out");
    qc.invalidateQueries({ queryKey: ["cos-appointments"] });
  }

  /**
   * moveAppt — used by drag & resize.
   * The DB trigger `cos_appt_concurrency_guard` already permits parallel
   * non-consultation bookings, so no frontend gate is applied here for
   * treatments. Doctor consultations are enforced by the trigger.
   */
  /** Colour-tag an appointment; null clears it back to the status colour. */
  async function setColor(a: Appt, choice: { tag: string; hex: string } | null) {
    const { error } = await supabase.from("cos_appointments").update({
      color_tag: choice?.tag ?? null,
      color_hex: choice?.hex ?? null,
      color_assigned_at: choice ? new Date().toISOString() : null,
    }).eq("id", a.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cos-appointments"] });
  }

  async function moveAppt(a: Appt, patch: { appointment_date?: string; start_time?: string; end_time?: string }) {
    const { error } = await supabase.from("cos_appointments").update(patch).eq("id", a.id);
    if (error) { toast.error(error.message); qc.invalidateQueries({ queryKey: ["cos-appointments"] }); return; }
    qc.invalidateQueries({ queryKey: ["cos-appointments"] });
  }

  return (
    <>
      <Card className="p-3 sm:p-4">
        <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(new Date())}>Today</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h3 className="truncate text-center text-sm font-semibold text-foreground sm:text-base">{heading}</h3>
          <div className="flex overflow-hidden rounded-lg border">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors sm:px-3 ${
                  view === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                }`}>{v}</button>
            ))}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <Legend swatch="bg-cal-scheduled" label="Scheduled" />
          <Legend swatch="bg-cal-checkedin" label="Checked-In" />
          <Legend swatch="bg-cal-rescheduled" label="Rescheduled" />
          <Legend swatch="bg-cal-cancelled" label="Cancelled" />
          <Legend swatch="bg-cal-returning" label="Returning" />
          <Legend ring label="Balance due" />
          <span className="ml-auto italic">Drag to move · pull bottom edge to resize · click empty area to book</span>
        </div>

        {view === "month" ? (
          <MonthGrid days={range.days} monthIndex={anchor.getMonth()} byDay={byDay}
            dueSet={dueSet ?? new Set()} returningSet={returningSet ?? new Set()}
            patientName={patientName}
            onPick={(date) => { setView("day"); setAnchor(new Date(`${date}T12:00:00`)); }} />
        ) : (
          <PixelTimeline
            days={range.days}
            byDay={byDay}
            dueSet={dueSet ?? new Set()}
            returningSet={returningSet ?? new Set()}
            patientName={patientName}
            serviceName={serviceName}
            onEmptyClick={(date, startMin) => setBooking({ date, startMin, endMin: startMin + 30 })}
            onCheckIn={checkIn}
            onCancel={cancelAppt}
            onCheckOut={checkOut}
            onMove={moveAppt}
            onDetails={setDetailsTarget}
            onEdit={setEditTarget}
            onReschedule={setRescheduleTarget}
            onDelete={deleteAppt}
            onColor={setColor}
          />
        )}
      </Card>

      <QuickBookDialog slot={booking} onClose={() => setBooking(null)}
        onBooked={() => { qc.invalidateQueries({ queryKey: ["cos-appointments"] }); setBooking(null); }} />

      <RescheduleDialog appt={rescheduleTarget} onClose={() => setRescheduleTarget(null)}
        patientName={rescheduleTarget ? patientName.get(rescheduleTarget.patient_id) ?? "Patient" : ""}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["cos-appointments"] }); setRescheduleTarget(null); }} />

      <EditApptDialog appt={editTarget} onClose={() => setEditTarget(null)}
        patientName={editTarget ? patientName.get(editTarget.patient_id) ?? "Patient" : ""}
        onSaved={() => {
          // Refresh every surface that renders appointment date/time.
          qc.invalidateQueries({
            predicate: (q) => {
              const k = String(q.queryKey?.[0] ?? "");
              return k.startsWith("cos-appointments") || k.startsWith("appointments")
                || k.startsWith("reception") || k.startsWith("client-timeline") || k.startsWith("dashboard");
            },
          });
          setEditTarget(null);
        }} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete this appointment?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget && `${patientName.get(deleteTarget.patient_id) ?? "Patient"} · ${fmtDate(deleteTarget.appointment_date)} ${fmtTime12(deleteTarget.start_time)}`}
            . This permanently removes the record. Use Cancel instead if you want to keep the history.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppointmentDetailsModal
        appointmentId={detailsTarget?.id ?? null}
        isOpen={!!detailsTarget}
        onClose={() => setDetailsTarget(null)}
        onEdit={() => { setClientEditId(detailsTarget?.id ?? null); setDetailsTarget(null); }}
      />

      <AppointmentEditModal
        appointmentId={clientEditId}
        isOpen={!!clientEditId}
        onClose={() => setClientEditId(null)}
        onSave={() => {
          qc.invalidateQueries({
            predicate: (q) => {
              const k = String(q.queryKey?.[0] ?? "");
              return k.startsWith("cos-appointments") || k.startsWith("appointment")
                || k.startsWith("cal-") || k.startsWith("reception") || k.startsWith("client-timeline");
            },
          });
          setClientEditId(null);
        }}
      />
    </>
  );
}

function Legend({ swatch, ring, label }: { swatch?: string; ring?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch && <span className={`h-3 w-3 rounded ${swatch}`} />}
      {ring && <span className="h-3 w-3 rounded bg-cal-checkedin ring-2 ring-cal-due" />}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PixelTimeline — Google Calendar-style day/week grid
// ---------------------------------------------------------------------------
interface TimelineProps {
  days: Date[];
  byDay: Map<string, Appt[]>;
  dueSet: Set<string>;
  returningSet: Set<string>;
  patientName: Map<string, string>;
  serviceName: Map<string, string>;
  onEmptyClick: (date: string, startMin: number) => void;
  onCheckIn: (a: Appt) => void;
  onCancel: (a: Appt) => void;
  onCheckOut: (a: Appt) => void;
  onMove: (a: Appt, patch: { appointment_date?: string; start_time?: string; end_time?: string }) => void;
  onDetails: (a: Appt) => void;
  onEdit: (a: Appt) => void;
  onReschedule: (a: Appt) => void;
  onDelete: (a: Appt) => void;
  onColor: (a: Appt, choice: { tag: string; hex: string } | null) => void;
}
function PixelTimeline(p: TimelineProps) {
  const colHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
  const todayIso = iso(new Date());

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Day headers */}
        <div className="sticky top-0 z-10 grid bg-background"
             style={{ gridTemplateColumns: `56px repeat(${p.days.length}, minmax(0,1fr))` }}>
          <div />
          {p.days.map((d) => {
            const di = iso(d);
            return (
              <div key={di}
                className={`border-b px-1 py-1.5 text-center text-xs font-medium ${
                  di === todayIso ? "text-primary" : "text-muted-foreground"
                }`}>
                <div>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-sm font-bold text-foreground">{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${p.days.length}, minmax(0,1fr))` }}>
          {/* Hour rail */}
          <div className="relative border-r" style={{ height: colHeight }}>
            {HOUR_ROWS.map((h) => (
              <div key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground"
                   style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}>
                {fmtTime12(`${String(h).padStart(2, "0")}:00`)}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {p.days.map((d) => (
            <DayColumn key={iso(d)} date={iso(d)} height={colHeight} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({ date, height, p }: { date: string; height: number; p: TimelineProps }) {
  const ref = useRef<HTMLDivElement>(null);
  const appts = p.byDay.get(date) ?? [];
  const laid = useMemo(() => layoutLanes(appts), [appts]);

  function onBgClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-appt]")) return;
    const rect = ref.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = snap(DAY_START_MIN + y / PX_PER_MIN);
    p.onEmptyClick(date, Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - 30, min)));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/appt-id");
    const grabOffsetMin = Number(e.dataTransfer.getData("text/grab-offset") || "0");
    if (!id) return;
    const rect = ref.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawStart = DAY_START_MIN + y / PX_PER_MIN - grabOffsetMin;
    const newStart = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - MIN_DURATION, snap(rawStart)));
    const src = (p.byDay.get(date) ?? []).find((a) => a.id === id)
      ?? Array.from(p.byDay.values()).flat().find((a) => a.id === id);
    if (!src) return;
    const dur = Math.max(MIN_DURATION, toMin(src.end_time) - toMin(src.start_time));
    p.onMove(src, {
      appointment_date: date,
      start_time: fromMin(newStart),
      end_time: fromMin(Math.min(DAY_END_MIN, newStart + dur)),
    });
  }

  return (
    <div
      ref={ref}
      onClick={onBgClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="relative border-l border-t bg-background hover:bg-muted/10"
      style={{ height }}
    >
      {/* Hourly gridlines */}
      {HOUR_ROWS.map((h) => (
        <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/40"
             style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }} />
      ))}
      {laid.map((it) => (
        <ApptCard
          key={it.appt.id}
          item={it}
          due={p.dueSet.has(it.appt.patient_id)}
          returning={p.returningSet.has(it.appt.patient_id)}
          name={p.patientName.get(it.appt.patient_id) ?? "Patient"}
          service={it.appt.service_id ? p.serviceName.get(it.appt.service_id) ?? null : null}
          onCheckIn={p.onCheckIn}
          onCancel={p.onCancel}
          onCheckOut={p.onCheckOut}
          onResize={(min) => p.onMove(it.appt, { end_time: fromMin(min) })}
          onDetails={p.onDetails}
          onEdit={p.onEdit}
          onReschedule={p.onReschedule}
          onDelete={p.onDelete}
          onColor={p.onColor}
        />
      ))}
    </div>
  );
}

function ApptCard({
  item, due, returning, name, service,
  onCheckIn, onCancel, onCheckOut, onResize, onDetails, onEdit, onReschedule, onDelete, onColor,
}: {
  item: LaidOut; due: boolean; returning: boolean; name: string; service: string | null;
  onCheckIn: (a: Appt) => void; onCancel: (a: Appt) => void; onCheckOut: (a: Appt) => void;
  onResize: (endMin: number) => void; onDetails: (a: Appt) => void;
  onEdit: (a: Appt) => void; onReschedule: (a: Appt) => void; onDelete: (a: Appt) => void;
  onColor: (a: Appt, choice: { tag: string; hex: string } | null) => void;
}) {
  const a = item.appt;
  const look = statusLook(a.status);
  const cancelled = look.label === "Cancelled";
  const top = (item.startMin - DAY_START_MIN) * PX_PER_MIN;
  const height = Math.max(28, (item.endMin - item.startMin) * PX_PER_MIN);
  const widthPct = 100 / item.laneCount;
  const leftPct = item.lane * widthPct;
  const svcLabel = service ?? a.patient_concern ?? "";

  // Extract notes: from discussion_notes JSON (meta.notes) or raw string
  let notes = "";
  if (a.discussion_notes) {
    try {
      const meta = JSON.parse(a.discussion_notes);
      notes = meta?.notes ?? "";
    } catch { notes = a.discussion_notes; }
  }
  if (!notes) notes = a.followup_details ?? "";

  const [resizing, setResizing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveEnd, setLiveEnd] = useState(item.endMin);

  useEffect(() => setLiveEnd(item.endMin), [item.endMin]);

  function onResizeStart(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    const startY = e.clientY;
    const startEnd = item.endMin;
    function move(ev: MouseEvent) {
      const dy = ev.clientY - startY;
      const next = snap(startEnd + dy / PX_PER_MIN);
      setLiveEnd(Math.max(item.startMin + MIN_DURATION, Math.min(DAY_END_MIN, next)));
    }
    function up(ev: MouseEvent) {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizing(false);
      const dy = ev.clientY - startY;
      const next = snap(startEnd + dy / PX_PER_MIN);
      const bounded = Math.max(item.startMin + MIN_DURATION, Math.min(DAY_END_MIN, next));
      if (bounded !== item.endMin) onResize(bounded);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/appt-id", a.id);
    // Grab offset in minutes from card top
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetMin = (e.clientY - rect.top) / PX_PER_MIN;
    e.dataTransfer.setData("text/grab-offset", String(offsetMin));
    e.dataTransfer.effectAllowed = "move";
  }

  const liveHeight = resizing ? Math.max(28, (liveEnd - item.startMin) * PX_PER_MIN) : height;
  // A manually chosen colour overrides the status colour.
  const custom = a.color_hex && /^#[0-9a-fA-F]{6}$/.test(a.color_hex) ? a.color_hex : null;

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <div
          data-appt
          draggable
          onDragStart={onDragStart}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top, left: `calc(${leftPct}% + 2px)`,
            width: `calc(${widthPct}% - 4px)`,
            height: liveHeight,
            ...(custom ? { backgroundColor: custom, color: "#fff" } : {}),
          }}
          className={[
            "group cursor-grab overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md active:cursor-grabbing",
            custom ? "" : `${look.bg} ${look.text}`,
            returning ? "border-l-4 border-cal-returning" : "",
            due ? "outline outline-2 outline-cal-due" : "",
            cancelled ? "line-through opacity-70" : "",
          ].join(" ")}
        >
          <div className="text-[10px] opacity-90">
            {t12(fromMin(item.startMin))} – {t12(fromMin(resizing ? liveEnd : item.endMin))}
          </div>
          <div className="truncate font-semibold">{name}</div>
          {svcLabel && <div className="truncate text-[10px] opacity-95">{svcLabel}</div>}
          {notes && liveHeight > 56 && (
            <div className="mt-0.5 line-clamp-2 text-[10px] italic opacity-90">{notes}</div>
          )}
          {/* Resize handle */}
          <div
            onMouseDown={onResizeStart}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity hover:bg-black/20 group-hover:opacity-100"
            title="Drag to resize"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="border-b p-2">
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">
            {t12(fromMin(item.startMin))} – {t12(fromMin(item.endMin))} · {look.label}
          </p>
          {svcLabel && <p className="text-[11px] text-muted-foreground">{svcLabel}</p>}
        </div>
        {/* Colour tag */}
        <div className="border-b p-2">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Colour</p>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.tag}
                title={c.tag}
                aria-label={`Colour ${c.tag}`}
                onClick={() => onColor(a, c)}
                style={{ backgroundColor: c.hex }}
                className={`h-5 w-5 rounded-full ring-offset-1 transition-transform hover:scale-110 ${
                  custom?.toLowerCase() === c.hex.toLowerCase() ? "ring-2 ring-foreground" : ""
                }`}
              />
            ))}
            <label
              title="Custom colour"
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border text-[9px]"
            >
              +
              <input
                type="color"
                className="sr-only"
                value={custom ?? "#039BE5"}
                onChange={(e) => onColor(a, { tag: "custom", hex: e.target.value })}
              />
            </label>
            {custom && (
              <button onClick={() => onColor(a, null)} className="text-[11px] text-muted-foreground underline">
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onCheckIn(a)}>
            <LogIn className="h-3.5 w-3.5" /> Check-In
          </button>
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onCheckOut(a)}>
            <LogIn className="h-3.5 w-3.5 rotate-180" /> Check-Out
          </button>
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onEdit(a)}>
            <Pencil className="h-3.5 w-3.5" /> Edit Details
          </button>
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onReschedule(a)}>
            <CalendarClock className="h-3.5 w-3.5" /> Reschedule
          </button>
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onCancel(a)}>
            <XCircle className="h-3.5 w-3.5 text-cos-due" /> Cancel Appointment
          </button>
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent" onClick={() => onDelete(a)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
          </button>
          {/* Close the menu first so the details dialog is interactive. */}
          <button className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => { setMenuOpen(false); setTimeout(() => onDetails(a), 0); }}>
            <Info className="h-3.5 w-3.5" /> View Details
          </button>
        </div>

      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Month grid (compact — unchanged behavior, DD/MM/YYYY tooltip)
// ---------------------------------------------------------------------------
function MonthGrid({
  days, monthIndex, byDay, dueSet, returningSet, patientName, onPick,
}: {
  days: Date[]; monthIndex: number; byDay: Map<string, Appt[]>;
  dueSet: Set<string>; returningSet: Set<string>;
  patientName: Map<string, string>; onPick: (date: string) => void;
}) {
  const todayIso = iso(new Date());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const di = iso(d);
            const inMonth = d.getMonth() === monthIndex;
            const items = byDay.get(di) ?? [];
            return (
              <button key={di} onClick={() => onPick(di)} title={fmtDate(d)}
                className={`min-h-[86px] border-b border-l p-1 text-left align-top transition-colors hover:bg-muted/40 ${
                  inMonth ? "" : "bg-muted/20 text-muted-foreground"
                }`}>
                <div className={`mb-1 text-xs font-semibold ${di === todayIso ? "text-primary" : ""}`}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((a) => {
                    const look = statusLook(a.status);
                    const hex = a.color_hex && /^#[0-9a-fA-F]{6}$/.test(a.color_hex) ? a.color_hex : null;
                    return (
                    <div key={a.id}
                      style={hex ? { backgroundColor: hex, color: "#fff" } : undefined}
                      className={`truncate rounded px-1 text-[10px] ${hex ? "" : `${look.bg} ${look.text}`} ${
                        returningSet.has(a.patient_id) ? "border-l-2 border-cal-returning" : ""
                      } ${dueSet.has(a.patient_id) ? "ring-1 ring-cal-due" : ""}`}>
                      {t12(a.start_time)} {patientName.get(a.patient_id) ?? "Patient"}
                    </div>
                    );
                  })}
                  {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient combobox (with inline create)
// ---------------------------------------------------------------------------
const CLINICAL_KEYWORDS = ["doctor", "consult", "counsel"];
const NON_CLINICAL_KEYWORDS = ["admin", "director", "reception", "front", "account", "finance"];
function isClinicalStaff(roleTitle: string | null | undefined): boolean {
  const t = (roleTitle ?? "").toLowerCase();
  if (!t) return false;
  if (NON_CLINICAL_KEYWORDS.some((k) => t.includes(k))) return false;
  return CLINICAL_KEYWORDS.some((k) => t.includes(k));
}

interface PatientLite { id: string; name: string; phone: string | null }

function PatientCombobox({
  value, onChange, patients, onCreated,
}: {
  value: string; onChange: (id: string) => void;
  patients: PatientLite[]; onCreated: (p: PatientLite) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = patients.find((p) => p.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? patients.filter((p) => p.name.toLowerCase().includes(q) || (p.phone ?? "").toLowerCase().includes(q))
    : patients.slice(0, 50);

  async function createInline() {
    if (!newName.trim()) return toast.error("Enter customer name");
    setSaving(true);
    const { data, error } = await supabase.from("customers")
      .insert({ name: newName.trim(), phone: newPhone.trim() || null })
      .select("id, name, phone").single();
    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Could not create customer");
    onCreated(data as PatientLite);
    onChange(data.id);
    toast.success(`${data.name} added and selected`);
    setCreating(false); setNewName(""); setNewPhone(""); setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {selected ? (
            <span className="truncate">
              {selected.name}
              {selected.phone && <span className="ml-1 text-muted-foreground">· {selected.phone}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Search patient by name or phone…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {creating ? (
          <div className="space-y-2 p-3">
            <p className="text-sm font-semibold">Add new customer</p>
            <Input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <Input placeholder="Phone number" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setCreating(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={createInline} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save & Select
              </Button>
            </div>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput placeholder="Type name or phone…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>
                <div className="space-y-2 p-2 text-center">
                  <p className="text-sm text-muted-foreground">No customer matches "{query}".</p>
                  <Button size="sm" className="w-full" onClick={() => { setNewName(query); setCreating(true); }}>
                    <UserPlus className="mr-1 h-4 w-4" /> Add as New Customer
                  </Button>
                </div>
              </CommandEmpty>
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((p) => (
                    <CommandItem key={p.id} value={p.id} onSelect={() => { onChange(p.id); setOpen(false); }}>
                      <Check className={`mr-2 h-4 w-4 ${p.id === value ? "opacity-100" : "opacity-0"}`} />
                      <span className="truncate">{p.name}</span>
                      {p.phone && <span className="ml-2 text-xs text-muted-foreground">{p.phone}</span>}
                    </CommandItem>
                  ))}
                  <CommandItem value="__create__"
                    onSelect={() => { setNewName(query); setCreating(true); }} className="border-t">
                    <UserPlus className="mr-2 h-4 w-4 text-primary" />
                    <span className="text-primary">+ Add as New Customer{query ? ` "${query}"` : ""}</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Quick Book — flexible start/end time
// ---------------------------------------------------------------------------
function QuickBookDialog({
  slot, onClose, onBooked,
}: {
  slot: { date: string; startMin: number; endMin: number } | null;
  onClose: () => void;
  onBooked: () => void;
}) {
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [route, setRoute] = useState<"doctor" | "counselor" | "treatment">("doctor");
  const [serviceId, setServiceId] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [concern, setConcern] = useState("");
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slot) return;
    setStartTime(hhmm(fromMin(slot.startMin)));
    setEndTime(hhmm(fromMin(slot.endMin)));
  }, [slot]);

  const { data: patients } = useQuery({
    queryKey: ["cal-patients"],
    queryFn: async () =>
      ((await supabase.from("customers").select("id, name, phone").order("name")).data ?? []) as PatientLite[],
  });
  const { data: doctors } = useQuery({
    queryKey: ["cal-doctors"],
    queryFn: async () =>
      ((await supabase.from("staff").select("id, name, role_title").eq("active", true).order("name")).data ?? []) as {
        id: string; name: string; role_title: string | null;
      }[],
  });
  const clinicalStaff = useMemo(() => (doctors ?? []).filter((d) => isClinicalStaff(d.role_title)), [doctors]);
  const { data: services } = useQuery({
    queryKey: ["cal-services"],
    queryFn: async () =>
      ((await supabase.from("services_master").select("id, name").order("name")).data ?? []) as {
        id: string; name: string;
      }[],
  });

  const open = !!slot;

  function reset() {
    setPatientId(""); setConsultantId(""); setRoute("doctor"); setServiceId("");
    setLeadSource(""); setAge(""); setLocation(""); setConcern(""); setNotes("");
  }

  async function submit() {
    if (!slot) return;
    if (!patientId) return toast.error("Select a patient");
    if (route !== "treatment" && !consultantId) return toast.error(`Select a ${route}`);
    if (route === "treatment" && !serviceId) return toast.error("Select the treatment service");
    if (!age.trim() || Number.isNaN(Number(age))) return toast.error("Enter patient age");
    if (!location.trim()) return toast.error("Enter location");
    if (!concern.trim()) return toast.error("Enter patient concern");
    if (!leadSource) return toast.error("Select lead source");
    const sMin = toMin(startTime + ":00");
    const eMin = toMin(endTime + ":00");
    if (eMin - sMin < MIN_DURATION) return toast.error(`End time must be at least ${MIN_DURATION} minutes after start`);
    setSaving(true);
    try {
      const staffForLock = route === "treatment" ? (clinicalStaff[0]?.id ?? consultantId) : consultantId;
      const fin = await checkPatientFinancialsBeforeBooking(patientId).catch(() => null);
      if (fin && fin.hasOutstanding) toast.warning(`Balance due for this patient: ₹${fin.outstanding}`);

      const branchId = await getPrimaryBranchId();
      const meta = { age: Number(age), location: location.trim(), route, notes: notes.trim() };
      const { error } = await supabase.from("cos_appointments").insert({
        branch_id: branchId,
        patient_id: patientId,
        doctor_id: route === "treatment" ? staffForLock : consultantId,
        counsellor_id: route === "counselor" ? consultantId : null,
        room_id: null,
        appointment_date: slot.date,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        patient_concern: concern,
        discussion_notes: JSON.stringify(meta),
        status: "Scheduled",
        lead_source: leadSource,
        consultation_route: route,
        service_id: route === "treatment" ? serviceId : null,
      });
      if (error) throw new Error(error.message);
      toast.success("Appointment booked");
      qc.invalidateQueries({ queryKey: ["cos-appointments"] });
      reset();
      onBooked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setSaving(false);
    }
  }

  const LEAD_SOURCES = ["Facebook", "Meta", "Instagram", "Practo", "Justdial", "CNH", "Inbound (Website)", "Walk-in", "Offline"];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Quick Book
            {slot && <span className="ml-2 text-sm font-normal text-muted-foreground">{fmtDate(slot.date)}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Consultation Route</Label>
            <div className="flex overflow-hidden rounded-lg border">
              {(["doctor", "counselor", "treatment"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRoute(r)}
                  className={`flex-1 px-3 py-1.5 text-sm capitalize transition-colors ${
                    route === r ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}>{r === "treatment" ? "Treatment" : r}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Start</Label>
              <TimeSelect value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">End</Label>
              <TimeSelect value={endTime} onChange={setEndTime} />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Patient</Label>
            <PatientCombobox value={patientId} onChange={setPatientId}
              patients={patients ?? []}
              onCreated={(p) => qc.setQueryData<PatientLite[]>(["cal-patients"], (old) => [p, ...(old ?? [])])} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Age *</Label>
              <Input type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 32" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Location *</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / Area" />
            </div>
          </div>

          {route === "treatment" ? (
            <div>
              <Label className="mb-1 block text-xs">Service *</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {(services ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="mb-1 block text-xs">{route === "counselor" ? "Counselor" : "Doctor"} *</Label>
              <Select value={consultantId} onValueChange={setConsultantId}>
                <SelectTrigger>
                  <SelectValue placeholder={clinicalStaff.length ? "Select staff" : "No clinical staff on roster"} />
                </SelectTrigger>
                <SelectContent>
                  {clinicalStaff.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}{d.role_title ? ` · ${d.role_title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">Lead Source *</Label>
            <Select value={leadSource} onValueChange={setLeadSource}>
              <SelectTrigger><SelectValue placeholder="Where did they come from?" /></SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Patient Concern *</Label>
            <Textarea rows={2} value={concern} onChange={(e) => setConcern(e.target.value)}
              placeholder="Clinical concern, symptoms…" />
          </div>

          <div>
            <Label className="mb-1 block text-xs">Important Notes (shown on calendar card)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. bring reports · fasting required · allergy alert" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Book Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reschedule — move an existing appointment to a new date/time slot
// ---------------------------------------------------------------------------
function RescheduleDialog({
  appt, patientName, onClose, onSaved,
}: { appt: Appt | null; patientName: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appt) return;
    setDate(appt.appointment_date);
    setStart(hhmm(appt.start_time));
    setEnd(hhmm(appt.end_time));
  }, [appt]);

  async function save() {
    if (!appt) return;
    if (!date) return toast.error("Pick a date");
    if (toMin(end) <= toMin(start)) return toast.error("End time must be after start time");
    setSaving(true);
    const { error } = await supabase.from("cos_appointments")
      .update({
        appointment_date: date,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        status: "Rescheduled",
      })
      .eq("id", appt.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Rescheduled to ${fmtDate(date)} ${fmtTime12(start)}`);
    onSaved();
  }

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reschedule · {patientName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>New date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <TimeSelect value={start} onChange={setStart} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <TimeSelect value={end} onChange={setEnd} />
            </div>
          </div>
          {appt && (
            <p className="text-xs text-muted-foreground">
              Currently {fmtDate(appt.appointment_date)} · {t12(appt.start_time)} – {t12(appt.end_time)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save New Slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Details — full appointment record: date, time, staff, service, concern,
// status, notes and follow-up. Every stored value is hydrated into the form and
// written back in one update.
// ---------------------------------------------------------------------------
function EditApptDialog({
  appt, patientName, onClose, onSaved,
}: { appt: Appt | null; patientName: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [route, setRoute] = useState<"doctor" | "counselor" | "treatment">("doctor");
  const [consultantId, setConsultantId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [concern, setConcern] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Scheduled");
  const [followup, setFollowup] = useState("");
  const [saving, setSaving] = useState(false);
  const metaRef = useRef<Record<string, unknown> | null>(null);

  const { data: staff } = useQuery({
    queryKey: ["cal-doctors"],
    queryFn: async () =>
      ((await supabase.from("staff").select("id, name, role_title").eq("active", true).order("name")).data ?? []) as {
        id: string; name: string; role_title: string | null;
      }[],
  });
  const clinicalStaff = useMemo(() => (staff ?? []).filter((d) => isClinicalStaff(d.role_title)), [staff]);
  const { data: services } = useQuery({
    queryKey: ["cal-services"],
    queryFn: async () =>
      ((await supabase.from("services_master").select("id, name").order("name")).data ?? []) as {
        id: string; name: string;
      }[],
  });

  useEffect(() => {
    if (!appt) return;
    setDate(appt.appointment_date ?? "");
    setStartTime(hhmm(appt.start_time ?? "09:00"));
    setEndTime(hhmm(appt.end_time ?? "09:30"));
    const r = (appt.consultation_route ?? "").toLowerCase();
    const initialRoute: "doctor" | "counselor" | "treatment" =
      r === "counselor" ? "counselor" : r === "treatment" ? "treatment" : "doctor";
    setRoute(initialRoute);
    setConsultantId(
      (initialRoute === "counselor" ? appt.counsellor_id : appt.doctor_id) ?? appt.doctor_id ?? "",
    );
    setTherapistId(appt.therapist_id ?? "");
    setServiceId(appt.service_id ?? "");
    setConcern(appt.patient_concern ?? "");
    setStatus(statusLook(appt.status).label);
    setFollowup(appt.followup_details ?? "");
    metaRef.current = null;
    if (appt.discussion_notes) {
      try {
        const meta = JSON.parse(appt.discussion_notes);
        metaRef.current = meta;
        setNotes(meta?.notes ?? "");
      } catch { setNotes(appt.discussion_notes); }
    } else setNotes("");
  }, [appt]);

  async function save() {
    if (!appt) return;
    if (!date) return toast.error("Select an appointment date");
    const sMin = toMin(`${startTime}:00`);
    const eMin = toMin(`${endTime}:00`);
    if (eMin - sMin < MIN_DURATION) {
      return toast.error(`End time must be at least ${MIN_DURATION} minutes after start`);
    }
    setSaving(true);
    const discussion = metaRef.current
      ? JSON.stringify({ ...metaRef.current, route, notes })
      : (notes || null);
    const { error } = await supabase.from("cos_appointments")
      .update({
        appointment_date: date,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        doctor_id: route === "counselor" ? (appt.doctor_id ?? consultantId) : consultantId,
        counsellor_id: route === "counselor" ? consultantId : appt.counsellor_id,
        therapist_id: therapistId || null,
        service_id: route === "treatment" ? (serviceId || null) : (serviceId || null),
        consultation_route: route,
        patient_concern: concern || null,
        discussion_notes: discussion,
        followup_details: followup || null,
        status,
      })
      .eq("id", appt.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Appointment updated");
    onSaved();
  }

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Appointment · {patientName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Client: <span className="font-medium text-foreground">{patientName}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start</Label>
              <TimeSelect value={startTime} onChange={setStartTime} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End</Label>
              <TimeSelect value={endTime} onChange={setEndTime} />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Consultation Route</Label>
            <div className="flex overflow-hidden rounded-lg border">
              {(["doctor", "counselor", "treatment"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRoute(r)}
                  className={`flex-1 px-3 py-1.5 text-sm capitalize transition-colors ${
                    route === r ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}>{r === "treatment" ? "Treatment" : r}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{route === "counselor" ? "Counselor" : "Doctor"}</Label>
              <Select value={consultantId} onValueChange={setConsultantId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {clinicalStaff.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}{d.role_title ? ` · ${d.role_title}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Therapist</Label>
              <Select value={therapistId || "none"} onValueChange={(v) => setTherapistId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Not assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {(staff ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Service / Treatment</Label>
            <Select value={serviceId || "none"} onValueChange={(v) => setServiceId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="No service selected" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">No service</SelectItem>
                {(services ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Concern / Details</Label>
            <Input value={concern} onChange={(e) => setConcern(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Scheduled", "Checked-In", "Checked-Out", "Rescheduled", "Cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Follow-up note</Label>
            <Input value={followup} onChange={(e) => setFollowup(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

