import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DoctorRecommendationPanel } from "@/components/DoctorRecommendationPanel";
import { CounselorQuotationPanel, type QuotationSnapshot } from "@/components/CounselorQuotationPanel";
import { markEncounter, setQuotationStatus } from "@/lib/clinical-workflow.functions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeTax, inr2, round2 } from "@/lib/gst";
import { DEAL_PAYMENT_MODES, STAFF_ROSTER } from "@/lib/constants";
import { PaymentModeSelect } from "@/components/PaymentModeSelect";
import { useRealtimeSync, fireAlert } from "@/lib/realtime";
import { toast } from "sonner";
import { printPrescription } from "@/lib/print-layout";
import { recordPrescriptionSnapshot } from "@/lib/prescription-history";
import { Autocomplete } from "@/components/ui/autocomplete";
import { PhotoCapture } from "@/components/PhotoCapture";
import { useServiceCatalog, useProductCatalog, serviceOptions, productOptions } from "@/lib/catalog";
import { Stethoscope, Save, Wand2, CalendarClock, PlayCircle, Printer, LogOut, XCircle, DoorOpen, Package } from "lucide-react";


export const Route = createFileRoute("/_authenticated/consultation")({
  head: () => ({
    meta: [
      { title: "Consultation — MGHYN Clinic ERP" },
      { name: "description", content: "Record consultations, diagnoses and prescriptions for patients." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Consultation — MGHYN Clinic ERP" },
      { property: "og:description", content: "Record consultations, diagnoses and prescriptions for patients." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/consultation" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/consultation" }],
  }),
  component: ConsultationPage,
});

const DOCTOR_CONSULT_FEE = 1000;

/** Cast helper so new patient_visits columns (bill_kind, bill_items, seen_doctor, scheduled_time) update cleanly. */
function updateVisit(id: string, patch: Record<string, unknown>) {
  return supabase.from("patient_visits").update(patch as never).eq("id", id);
}

function ConsultationPage() {
  const { roles } = useAuth();
  const isDoctor = roles.some((r) => ["admin", "doctor", "counselor"].includes(r));
  const isCounselor = roles.some((r) => ["admin", "counselor"].includes(r));

  useRealtimeSync(["patient_visits", "clinic_rooms"], ["consult-visits", "consult-rooms"]);
  const { data: visits, refetch } = useQuery({
    queryKey: ["consult-visits"],
    queryFn: async () =>
      (await supabase.from("patient_visits").select("*").in("status", ["waiting", "doctor", "counselor"]).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: staff } = useQuery({
    queryKey: ["staff-roster"],
    queryFn: async () => {
      const rows = (await supabase.from("staff").select("name").eq("active", true).order("name")).data ?? [];
      const names = rows.map((r) => r.name);
      return names.length ? names : [...STAFF_ROSTER];
    },
  });

  const doctorQueue = (visits ?? []).filter((v) => v.status === "waiting" || v.status === "doctor");
  const counselorQueue = (visits ?? []).filter((v) => v.status === "counselor");
  const c1 = counselorQueue.filter((v) => (v as { counselor_slot?: string }).counselor_slot === "Counselor 1");
  const c2 = counselorQueue.filter((v) => (v as { counselor_slot?: string }).counselor_slot === "Counselor 2");
  const unrouted = counselorQueue.filter((v) => {
    const slot = (v as { counselor_slot?: string }).counselor_slot;
    return slot !== "Counselor 1" && slot !== "Counselor 2";
  });

  if (!isDoctor && !isCounselor) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Doctor Consultation & Counselor Closure" subtitle="Stage 3 · prescription routing · package conversion · staff assignment" />
      <div className="grid gap-4 lg:grid-cols-2">
        {isDoctor && (
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Stethoscope className="h-4 w-4" /> Doctor Queue ({doctorQueue.length})</h3>
            <div className="space-y-3">
              {doctorQueue.map((v) => <DoctorCard key={v.id} visit={v} onDone={refetch} />)}
              {doctorQueue.length === 0 && <p className="text-sm text-muted-foreground">No patients waiting for consultation.</p>}
            </div>
          </Card>
        )}
        {isCounselor && (
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4" /> Counselor 1 Room ({c1.length})</h3>
              <div className="space-y-3">
                {c1.map((v) => <CounselorCard key={v.id} visit={v} staff={staff ?? []} onDone={refetch} />)}
                {c1.length === 0 && <p className="text-sm text-muted-foreground">No patients routed to Counselor 1 yet.</p>}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4" /> Counselor 2 Room ({c2.length})</h3>
              <div className="space-y-3">
                {c2.map((v) => <CounselorCard key={v.id} visit={v} staff={staff ?? []} onDone={refetch} />)}
                {c2.length === 0 && <p className="text-sm text-muted-foreground">No patients routed to Counselor 2 yet.</p>}
              </div>
            </Card>
            {unrouted.length > 0 && (
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4" /> Unrouted — Self-Assign ({unrouted.length})</h3>
                <div className="space-y-3">
                  {unrouted.map((v) => (
                    <div key={v.id} className="rounded-lg border p-3">
                      <p className="mb-2 font-medium">{v.customer_name}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => selfAssign(v.id, "Counselor 1")}>Self-Assign to Counselor 1</Button>
                        <Button size="sm" variant="outline" onClick={() => selfAssign(v.id, "Counselor 2")}>Self-Assign to Counselor 2</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );

  async function selfAssign(id: string, slot: string) {
    const { error } = await updateVisit(id, { counselor_slot: slot });
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(`Self-assigned to ${slot}`);
    refetch();
  }
}

interface BillLine {
  id: string;
  kind: "service" | "product";
  name: string;
  rate: number;
  sessions: number; // services
  qty: number; // products
}

export function billLineTotal(l: BillLine) {
  return l.kind === "service" ? round2(l.rate * (l.sessions || 0)) : round2(l.rate * (l.qty || 0));
}

/** Convert picker lines into the jsonb bill_items stored on the visit (consumed by POS prefill). */
function toBillItems(lines: BillLine[]) {
  return lines.map((l) => ({
    kind: l.kind,
    name: l.name,
    rate: l.rate,
    qty: l.kind === "service" ? (l.sessions || 0) : (l.qty || 0),
    line_total: billLineTotal(l),
  }));
}

/* ----------------------------- Live Room Allotment ----------------------------- */

function AllotRoom({ patientName, treatment, currentRoom, onAllot, onRelease }: {
  patientName: string;
  treatment: string;
  currentRoom: string | null;
  onAllot: (room: string) => void;
  onRelease: () => void;
}) {
  useRealtimeSync(["clinic_rooms"], ["allot-rooms"]);
  const { data: rooms, refetch } = useQuery({
    queryKey: ["allot-rooms"],
    queryFn: async () => (await supabase.from("clinic_rooms").select("*").order("id")).data ?? [],
  });
  const [open, setOpen] = useState(false);

  async function allot(roomName: string) {
    const { error } = await supabase.from("clinic_rooms").update({
      status: "OCCUPIED", current_patient_name: patientName, current_treatment: treatment || "Consultation",
      busy_till: null, last_updated: new Date().toISOString(),
    }).eq("room_name", roomName);
    if (error) return toast.error(error.message);
    fireAlert();
    onAllot(roomName);
    setOpen(false);
    refetch();
    toast.success(`${roomName} → Busy (live on Room Grid)`);
  }

  async function release() {
    if (!currentRoom) return;
    await supabase.from("clinic_rooms").update({
      status: "FREE", current_patient_name: null, current_treatment: null, current_patient_id: null,
      assigned_staff_id: null, busy_till: null, last_updated: new Date().toISOString(),
    }).eq("room_name", currentRoom);
    onRelease();
    refetch();
    toast.success(`${currentRoom} released → Free`);
  }

  if (currentRoom) {
    return (
      <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-500/10 px-2 py-1 text-xs">
        <span className="flex items-center gap-1 font-medium"><DoorOpen className="h-3.5 w-3.5" /> Allotted: {currentRoom}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={release}>Release</Button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen((o) => !o)}>
        <DoorOpen className="mr-1 h-4 w-4" /> Allot Room
      </Button>
      {open && (
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border p-2">
          {(rooms ?? []).map((r) => {
            const free = r.status === "FREE";
            return (
              <Button key={r.id} size="sm" variant={free ? "secondary" : "ghost"} disabled={!free}
                className="h-8 justify-between text-xs" onClick={() => allot(r.room_name)}>
                <span className="truncate">{r.room_name}</span>
                <span className={free ? "text-emerald-600" : "text-destructive"}>{free ? "Free" : "Busy"}</span>
              </Button>
            );
          })}
          {(rooms ?? []).length === 0 && <p className="col-span-2 text-xs text-muted-foreground">No rooms configured.</p>}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Clinical Pickers ----------------------------- */

function ClinicalPickers({ onAdd, onChange }: { onAdd?: (line: string) => void; onChange?: (lines: BillLine[], total: number) => void }) {
  const { data: services } = useServiceCatalog();
  const { data: products } = useProductCatalog();
  const [lines, setLines] = useState<BillLine[]>([]);

  const total = round2(lines.reduce((s, l) => s + billLineTotal(l), 0));

  useEffect(() => { onChange?.(lines, total); }, [lines, total]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(id: string, patch: Partial<BillLine>) {
    setLines((ls) => ls.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function remove(id: string) {
    setLines((ls) => ls.filter((x) => x.id !== id));
  }
  function addService(id: string) {
    const s = (services ?? []).find((x) => x.id === id);
    if (!s) return;
    // Price auto-fetched from the service master — no manual entry needed.
    setLines((ls) => [...ls, { id: crypto.randomUUID(), kind: "service", name: s.name, rate: Number(s.default_price ?? 0), sessions: 1, qty: 0 }]);
  }
  function addProduct(id: string) {
    const p = (products ?? []).find((x) => x.id === id);
    if (!p) return;
    setLines((ls) => [...ls, { id: crypto.randomUUID(), kind: "product", name: p.name, rate: Number(p.sale_price ?? 0), sessions: 0, qty: 1 }]);
  }
  function pushToNotes() {
    for (const l of lines) {
      const detail = l.kind === "service"
        ? `Service: ${l.name} — ${inr2(l.rate)} × ${l.sessions} session(s) = ${inr2(billLineTotal(l))}`
        : `Product: ${l.name} — ${inr2(l.rate)} × ${l.qty} qty = ${inr2(billLineTotal(l))}`;
      onAdd?.(detail);
    }
    onAdd?.(`Billing Total: ${inr2(total)}`);
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Add Service</Label>
          <Autocomplete
            options={serviceOptions(services ?? [])}
            placeholder="Search services…"
            searchPlaceholder="Type e.g. glow, LHR…"
            emptyText="No service match."
            onSelect={(o) => addService(o.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Add Product / Medicine</Label>
          <Autocomplete
            options={productOptions(products ?? [])}
            placeholder="Search pharmacy…"
            searchPlaceholder="Type product / medicine…"
            emptyText="No product match."
            onSelect={(o) => addProduct(o.value)}
          />
        </div>
      </div>

      {lines.length > 0 && (
        <div className="rounded-lg border p-2">
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">
                  <Badge variant="secondary" className="mr-1">{l.kind === "service" ? "Svc" : "Prod"}</Badge>{l.name}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">₹</span>
                  <Input type="number" className="h-8 w-20" value={l.rate} onChange={(e) => update(l.id, { rate: Number(e.target.value) })} />
                </div>
                {l.kind === "service" ? (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Sess</span>
                    <Input type="number" className="h-8 w-14" value={l.sessions} onChange={(e) => update(l.id, { sessions: Number(e.target.value) })} />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Qty</span>
                    <Input type="number" className="h-8 w-14" value={l.qty} onChange={(e) => update(l.id, { qty: Number(e.target.value) })} />
                  </div>
                )}
                <span className="w-20 text-right font-medium">{inr2(billLineTotal(l))}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(l.id)}>×</Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="text-xs text-muted-foreground">Live Total = (Rate × Sessions) + (Price × Qty)</span>
            <span className="text-sm font-bold">{inr2(total)}</span>
          </div>
          {onAdd && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={pushToNotes}>Add Itemised Lines to Notes</Button>}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Doctor Card ----------------------------- */

function DoctorCard({ visit, onDone }: { visit: { id: string; customer_name: string; prescription: string | null; room: string | null }; onDone: () => void }) {
  const [rx, setRx] = useState(visit.prescription ?? "");
  const [lines, setLines] = useState<BillLine[]>([]);
  const [room, setRoom] = useState<string | null>(visit.room ?? null);
  const [saving, setSaving] = useState(false);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const saveRecommendationRef = useRef<(() => Promise<void>) | null>(null);
  const encounterFn = useServerFn(markEncounter);

  useQuery({
    queryKey: ["encounter-checkin", visit.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("encounters")
        .select("checked_in_at")
        .eq("visit_id", visit.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setCheckedInAt((data?.checked_in_at as string | null) ?? null);
      return data ?? null;
    },
  });

  async function checkIn() {
    setCheckingIn(true);
    try {
      await encounterFn({ data: { visit_id: visit.id, customer_name: visit.customer_name, stage: "checked_in" } });
      setCheckedInAt(new Date().toISOString());
      toast.success("Patient checked in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check in the patient");
    } finally {
      setCheckingIn(false);
    }
  }

  async function stampEncounter(stage: "in_progress" | "completed") {
    try {
      await encounterFn({ data: { visit_id: visit.id, customer_name: visit.customer_name, stage } });
    } catch {
      // Encounter timing is an audit convenience — never block the clinical flow.
    }
  }


  function append(line: string) {
    setRx((cur) => (cur.trim() ? `${cur.trim()}\n${line}` : line));
  }

  async function releaseRoomIfAny() {
    if (room) {
      await supabase.from("clinic_rooms").update({
        status: "FREE", current_patient_name: null, current_treatment: null, current_patient_id: null,
        assigned_staff_id: null, busy_till: null, last_updated: new Date().toISOString(),
      }).eq("room_name", room);
    }
  }

  // "Check Out" — consultation only → Reception billing with auto ₹1000 doctor fee.
  async function checkOut() {
    setSaving(true);
    await releaseRoomIfAny();
    await stampEncounter("completed");
    await recordPrescriptionSnapshot({
      visit_id: visit.id, patient_name: visit.customer_name, recorded_role: "doctor",
      doctor_notes: rx,
      services: [{ kind: "service", name: "Doctor Consultation Fee", rate: DOCTOR_CONSULT_FEE, qty: 1, line_total: DOCTOR_CONSULT_FEE }],
    });
    const { error } = await updateVisit(visit.id, {
      prescription: rx, seen_doctor: true, status: "billing", bill_kind: "consultation", room: null,
      bill_items: [{ kind: "service", name: "Doctor Consultation Fee", rate: DOCTOR_CONSULT_FEE, qty: 1, line_total: DOCTOR_CONSULT_FEE }],
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success("Checked out · ₹1000 Doctor Consultation Fee sent to Reception billing");
    onDone();
  }

  // "Go to Counselor N" — route directly to a specific counselor's dashboard queue.
  async function goToCounselor(slot: string) {
    setSaving(true);
    await stampEncounter("in_progress");
    try {
      await saveRecommendationRef.current?.();
    } catch (e) {
      setSaving(false);
      return toast.error(e instanceof Error ? e.message : "Could not save the recommendation");
    }
    await recordPrescriptionSnapshot({
      visit_id: visit.id, patient_name: visit.customer_name, recorded_role: "doctor",
      doctor_notes: rx,
      services: lines.filter((l) => l.kind === "service").map((l) => ({ kind: "service" as const, name: l.name, rate: l.rate, sessions: l.sessions, line_total: billLineTotal(l) })),
      products: lines.filter((l) => l.kind === "product").map((l) => ({ kind: "product" as const, name: l.name, rate: l.rate, qty: l.qty, line_total: billLineTotal(l) })),
    });
    const { error } = await updateVisit(visit.id, { prescription: rx, seen_doctor: true, status: "counselor", counselor_slot: slot });
    setSaving(false);
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(`Prescription saved · routed to ${slot}`);
    onDone();
  }


  async function print() {
    // Fetch the patient's full record so the printed Rx matches the Template Studio layout 1:1.
    const [{ data: cust }, { data: rec }] = await Promise.all([
      supabase.from("customers").select("age,gender,phone").ilike("name", visit.customer_name).limit(1).maybeSingle(),
      supabase.from("patient_visits").select("prescription,counselor_notes").eq("id", visit.id).maybeSingle(),
    ]);
    printPrescription({
      patient_name: visit.customer_name,
      age: (cust?.age as string | number | null) ?? null,
      gender: (cust?.gender as string | null) ?? null,
      consultation_date: new Date().toISOString().slice(0, 10),
      notes: rx || (rec?.prescription as string | null) || "",
      suggested_services: (rec?.counselor_notes as string | null) ?? "",
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium">{visit.customer_name}</p>
        {checkedInAt ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            Checked in {new Date(checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={checkIn} disabled={checkingIn}>Check in</Button>
        )}
      </div>

      <Textarea rows={3} value={rx} onChange={(e) => setRx(e.target.value)} placeholder="Clinical prescription / advice…" />
      <ClinicalPickers onAdd={append} onChange={(l) => setLines(l)} />
      <DoctorRecommendationPanel
        visitId={visit.id}
        customerName={visit.customer_name}
        bindSave={(fn) => { saveRecommendationRef.current = fn; }}
      />
      <div className="mt-2">
        <PhotoCapture patientName={visit.customer_name} />
      </div>
      <AllotRoom patientName={visit.customer_name} treatment="Doctor Consultation" currentRoom={room}
        onAllot={async (r) => { setRoom(r); await updateVisit(visit.id, { room: r }); }}
        onRelease={async () => { setRoom(null); await updateVisit(visit.id, { room: null }); }} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={checkOut} disabled={saving}><LogOut className="mr-1 h-4 w-4" /> Check Out (₹1000)</Button>
        <Button size="sm" onClick={() => goToCounselor("Counselor 1")} disabled={saving}><Save className="mr-1 h-4 w-4" /> Go to Counselor 1</Button>
        <Button size="sm" onClick={() => goToCounselor("Counselor 2")} disabled={saving}><Save className="mr-1 h-4 w-4" /> Go to Counselor 2</Button>
        <Button size="sm" variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> Print Prescription</Button>
      </div>
      {lines.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Itemised picks are carried to the Counselor / billing.</p>}
    </div>
  );
}

/* ----------------------------- Counselor Card ----------------------------- */

function CounselorCard({ visit, staff, onDone }: { visit: { id: string; customer_name: string; prescription: string | null; seen_doctor?: boolean; room: string | null }; staff: string[]; onDone: () => void }) {
  const [lines, setLines] = useState<BillLine[]>([]);
  const [total, setTotal] = useState(0);
  const [disc, setDisc] = useState("");
  const [pay, setPay] = useState<string>(DEAL_PAYMENT_MODES[0]);
  const [assigned, setAssigned] = useState("");
  const [room, setRoom] = useState<string | null>(visit.room ?? null);
  const [notes, setNotes] = useState(visit.prescription ?? "");
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [quote, setQuote] = useState<QuotationSnapshot | null>(null);
  const quoteStatusFn = useServerFn(setQuotationStatus);

  // The quotation worksheet is the priced source of truth; the quick pickers
  // above stay available and win when the counselor uses them instead.
  const quoteItems = quote?.items ?? [];
  const usingQuote = lines.length === 0 && quoteItems.length > 0;
  const effectiveItems = () => (usingQuote ? quoteItems : toBillItems(lines));
  const effectiveTotal = usingQuote ? (quote?.net_total ?? 0) : total;

  const gross = usingQuote
    ? round2(effectiveTotal)
    : Math.max(0, total * (1 - Number(disc || 0) / 100));
  const tax = computeTax(gross, "inclusive");
  const hasProducts = usingQuote ? quoteItems.some((i) => i.kind === "product") : lines.some((l) => l.kind === "product");
  const onlyProducts = usingQuote
    ? quoteItems.length > 0 && quoteItems.every((i) => i.kind === "product")
    : lines.length > 0 && lines.every((l) => l.kind === "product");

  /** Mark the quotation converted once the visit moves on to treatment or billing. */
  async function closeQuotation() {
    if (!usingQuote || !quote?.quotation_id) return;
    try {
      await quoteStatusFn({ data: { quotation_id: quote.quotation_id, status: "converted_to_invoice" } });
    } catch {
      // Never block the hand-off on the status stamp.
    }
  }

  async function releaseRoomIfAny() {
    if (room) {
      await supabase.from("clinic_rooms").update({
        status: "FREE", current_patient_name: null, current_treatment: null, current_patient_id: null,
        assigned_staff_id: null, busy_till: null, last_updated: new Date().toISOString(),
      }).eq("room_name", room);
    }
  }

  async function snapshot(role: string) {
    const items = effectiveItems();
    await recordPrescriptionSnapshot({
      visit_id: visit.id, patient_name: visit.customer_name, recorded_role: role,
      counselor_notes: notes,
      services: items.filter((l) => l.kind === "service").map((l) => ({ kind: "service" as const, name: l.name, rate: l.rate, sessions: l.qty, line_total: l.line_total })),
      products: items.filter((l) => l.kind === "product").map((l) => ({ kind: "product" as const, name: l.name, rate: l.rate, qty: l.qty, line_total: l.line_total })),
    });
  }

  async function treatmentIn() {
    await snapshot("counselor");
    await closeQuotation();
    const { error } = await updateVisit(visit.id, {
      counselor_notes: notes, prescription: notes, package_price: round2(gross), discount_pct: usingQuote ? 0 : Number(disc || 0),
      payment_mode: pay, assigned_staff: assigned || null, status: "treatment",
      bill_kind: onlyProducts ? "product" : "package", bill_items: effectiveItems(),
    });
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(assigned ? `${assigned} assigned · Treatment In` : "Sent to floor — any free therapist can Self-Assign");
    onDone();
  }

  async function scheduleLater() {
    await snapshot("counselor");
    await closeQuotation();
    const { error } = await updateVisit(visit.id, {
      counselor_notes: notes, prescription: notes, package_price: round2(gross), discount_pct: usingQuote ? 0 : Number(disc || 0),
      payment_mode: pay, assigned_staff: assigned || null, status: "scheduled",
      scheduled_for: schedDate || null, scheduled_time: schedTime || null,
      bill_kind: onlyProducts ? "product" : "package", bill_items: effectiveItems(),
    });
    await releaseRoomIfAny();
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(schedDate ? `Scheduled for ${schedDate}${schedTime ? " " + schedTime : ""}` : "Saved (no date) — schedule open");
    onDone();
  }

  async function productOnly() {
    await releaseRoomIfAny();
    await snapshot("counselor");
    await closeQuotation();
    const { error } = await updateVisit(visit.id, {
      counselor_notes: notes, prescription: notes, status: "billing", bill_kind: "product", room: null,
      bill_items: effectiveItems().filter((l) => l.kind === "product"),
    });
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success("Products sent to Reception Duty Floor for product billing");
    onDone();
  }


  // "Not Confirmed" — doctor seen → ₹1000 doctor bill only; direct counselor → save, no bill.
  async function notConfirmed() {
    await releaseRoomIfAny();
    if (visit.seen_doctor) {
      const { error } = await updateVisit(visit.id, {
        counselor_notes: notes, prescription: notes, status: "billing", bill_kind: "consultation", room: null,
        bill_items: [{ kind: "service", name: "Doctor Consultation Fee", rate: DOCTOR_CONSULT_FEE, qty: 1, line_total: DOCTOR_CONSULT_FEE }],
      });
      if (error) return toast.error(error.message);
      fireAlert();
      toast.success("Not confirmed · only ₹1000 Doctor bill sent to Reception");
    } else {
      const { error } = await updateVisit(visit.id, {
        counselor_notes: notes, prescription: notes, status: "done", bill_kind: null, room: null,
      });
      if (error) return toast.error(error.message);
      toast.success("Not confirmed · client & prescription saved, no bill generated");
    }
    onDone();
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1 font-medium">{visit.customer_name} {visit.seen_doctor && <Badge variant="outline" className="ml-1">Seen by Doctor</Badge>}</div>
      {visit.prescription && <p className="mb-2 text-xs text-muted-foreground">Rx: {visit.prescription}</p>}
      <ClinicalPickers onChange={(l, t) => { setLines(l); setTotal(t); }} />
      <CounselorQuotationPanel visitId={visit.id} customerName={visit.customer_name} onSnapshot={setQuote} />
      <Textarea rows={2} className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Session documentation / suggestions…" />
      <div className="mt-2">
        <PhotoCapture patientName={visit.customer_name} label="Session Documentation Photos" />
      </div>

      {usingQuote && (
        <p className="mt-2 rounded-md bg-emerald-500/10 p-2 text-xs">
          Billing will use the quotation above ({inr2(effectiveTotal)}). Add lines in the quick pickers to override it.
        </p>
      )}

      {total > 0 && (
        <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr2(total)}</span></div>
          <div className="flex justify-between"><span>Taxable base</span><span>{inr2(tax.base)}</span></div>
          <div className="flex justify-between"><span>GST 5% (incl.)</span><span>{inr2(tax.tax)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total Amount</span><span>{inr2(tax.gross)}</span></div>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label className="text-xs">Disc %</Label><Input type="number" value={disc} onChange={(e) => setDisc(e.target.value)} /></div>
        <div className="space-y-1">
          <Label className="text-xs">Payment Mode</Label>
          <PaymentModeSelect value={pay} onValueChange={setPay} base={DEAL_PAYMENT_MODES} triggerClassName="h-9 flex-1" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Assign Staff <span className="text-muted-foreground">(optional)</span></Label>
          <Select value={assigned} onValueChange={setAssigned}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Leave empty → floor self-assign" /></SelectTrigger>
            <SelectContent>{staff.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <AllotRoom patientName={visit.customer_name} treatment="Counselling" currentRoom={room}
        onAllot={async (r) => { setRoom(r); await updateVisit(visit.id, { room: r }); }}
        onRelease={async () => { setRoom(null); await updateVisit(visit.id, { room: null }); }} />

      {showSchedule && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border p-2">
          <div className="space-y-1"><Label className="text-xs">Date (optional)</Label><Input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Time (optional)</Label><Input lang="en-US" type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} /></div>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={treatmentIn}><PlayCircle className="mr-1 h-4 w-4" /> Treatment In</Button>
        {!showSchedule ? (
          <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)}><CalendarClock className="mr-1 h-4 w-4" /> Schedule It Later</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={scheduleLater}><Save className="mr-1 h-4 w-4" /> Save Schedule</Button>
        )}
        {hasProducts && <Button size="sm" variant="secondary" onClick={productOnly}><Package className="mr-1 h-4 w-4" /> Product Only</Button>}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={notConfirmed}><XCircle className="mr-1 h-4 w-4" /> Not Confirmed</Button>
      </div>
    </div>
  );
}
