import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRealtimeSync, fireAlert } from "@/lib/realtime";
import { commitStockMovement } from "@/lib/inventory-stock";
import { toast } from "sonner";
import { Boxes, HandMetal, PlayCircle, StopCircle, Send, Trash2, CheckCircle2, Plus, Minus, FileText, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/duties")({
  head: () => ({
    meta: [
      { title: "Duty Roster — MGHYN Clinic ERP" },
      { name: "description", content: "Assign staff duties and track daily treatment allocations." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Duty Roster — MGHYN Clinic ERP" },
      { property: "og:description", content: "Assign staff duties and track daily treatment allocations." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/duties" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/duties" }],
  }),
  component: DutiesPage,
});

interface ConsLine { id: string; item_id: string; item_name: string; qty: number; unit: string }

function fmtDur(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

function DutiesPage() {
  const { roles, profile } = useAuth();
  const allowed = roles.some((r) => ["admin", "therapist", "doctor", "counselor", "reception"].includes(r));
  useRealtimeSync(
    ["patient_visits", "clinic_rooms", "inventory", "inventory_batches"],
    ["duty-visits", "duty-rooms", "duty-inventory"],
  );
  const { data: visits, refetch } = useQuery({
    queryKey: ["duty-visits"],
    queryFn: async () => {
      const rows = (await supabase.from("patient_visits").select("*").in("status", ["counselor", "treatment"]).order("updated_at", { ascending: false })).data ?? [];
      return rows.filter((v) => v.status === "treatment" || v.assigned_staff);
    },
  });
  const { data: rooms } = useQuery({
    queryKey: ["duty-rooms"],
    queryFn: async () => (await supabase.from("clinic_rooms").select("*").order("id")).data ?? [],
  });
  // Master Inventory across all tabs (Rental / Injectable / In-house) — therapists now have read access.
  const { data: inventory } = useQuery({
    queryKey: ["duty-inventory"],
    queryFn: async () => {
      const base = ((await supabase.from("inventory").select("id, name, stock").eq("active", true).order("name")).data ?? [])
        .map((r) => ({ id: r.id, name: r.name, stock_qty: Number(r.stock), cat: "Inventory" }));
      const items = ((await supabase.from("inventory_items").select("*").limit(1000)).data ?? [])
        .map((r: Record<string, unknown>) => ({
          id: String(r.id),
          name: String(r.name ?? r.item_name ?? "Item"),
          stock_qty: Number(r.stock ?? r.quantity ?? r.qty ?? 0),
          cat: String(r.category ?? r.type ?? r.inventory_type ?? "In-House"),
        }));
      // merge, de-dupe by name
      const seen = new Set<string>();
      return [...base, ...items].filter((x) => { const k = x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    },
  });

  const knownIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (!visits) return;
    const ids = new Set(visits.map((v) => v.id));
    if (seeded.current) {
      for (const v of visits) {
        if (!knownIds.current.has(v.id)) {
          fireAlert();
          toast.info(`Patient ${v.customer_name} is ready for ${v.area_of_interest ?? "treatment"}`);
        }
      }
    }
    knownIds.current = ids;
    seeded.current = true;
  }, [visits]);

  // Stable identities so the memoized DutyCard only re-renders when data really changes.
  const roomList = useMemo(() => rooms ?? [], [rooms]);
  const invList = useMemo(() => inventory ?? [], [inventory]);
  const me = profile?.full_name ?? "";
  const handleDone = useCallback(() => { void refetch(); }, [refetch]);

  if (!allowed) return <AccessDenied />;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="My Duties" subtitle="Stage 4 & 5 · floor panel · self-assign, run treatment timer & log consumption" />
      <div className="space-y-4">
        {(visits ?? []).map((v) => (
          <DutyCard key={v.id} visit={v} rooms={roomList} inventory={invList} me={me} onDone={handleDone} />
        ))}
        {(visits ?? []).length === 0 && <p className="text-sm text-muted-foreground">No assigned duties right now.</p>}
      </div>
    </div>
  );
}

interface DutyVisit {
  id: string; customer_name: string; area_of_interest: string | null; status: string;
  assigned_staff: string | null; room: string | null;
  treatment_started_at?: string | null; treatment_ended_at?: string | null;
}

const DutyCard = memo(function DutyCard({ visit, rooms, inventory, me, onDone }: {
  visit: DutyVisit;
  rooms: { id: number; room_name: string; status: string }[];
  inventory: { id: string; name: string; stock_qty: number; cat: string }[];
  me: string;
  onDone: () => void;
}) {
  const [room, setRoom] = useState(visit.room ?? "");
  const [lines, setLines] = useState<ConsLine[]>([]);
  const [showRx, setShowRx] = useState(false);
  const [now, setNow] = useState(Date.now());
  const qc = useQueryClient();

  const startedAt = visit.treatment_started_at ? new Date(visit.treatment_started_at).getTime() : null;
  const running = !!startedAt && !visit.treatment_ended_at;

  // Live ticking clock — the source of truth is treatment_started_at stored in the DB,
  // so the elapsed time survives reloads, tab close and minimise automatically.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const assigned = !!visit.assigned_staff;

  async function takeDuty() {
    const { error } = await supabase.from("patient_visits").update({ assigned_staff: me || "Self" }).eq("id", visit.id);
    if (error) return toast.error(error.message);
    toast.success("Duty self-assigned · Active Duty");
    onDone();
  }

  async function treatmentIn() {
    if (!room) return toast.error("Select a room first");
    const startIso = new Date().toISOString();
    await supabase.from("patient_visits").update({
      status: "treatment", room, treatment_started_at: startIso, treatment_ended_at: null, busy_till: null,
    }).eq("id", visit.id);
    await supabase.from("clinic_rooms").update({
      status: "OCCUPIED", current_patient_name: visit.customer_name,
      current_treatment: visit.area_of_interest ?? "Treatment", last_updated: startIso,
    }).eq("room_name", room);
    fireAlert();
    toast.success(`${room} occupied · timer started`);
    onDone();
  }

  async function treatmentOut() {
    const endIso = new Date().toISOString();
    const durSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    await supabase.from("patient_visits").update({
      treatment_ended_at: endIso, treatment_duration_sec: durSec,
    }).eq("id", visit.id);
    // durable history linked to patient + therapist
    await supabase.from("treatment_logs").insert({
      visit_id: visit.id, patient_name: visit.customer_name, therapist: visit.assigned_staff ?? me,
      treatment: visit.area_of_interest ?? "Treatment", room: room || visit.room,
      started_at: visit.treatment_started_at ?? endIso, ended_at: endIso, duration_sec: durSec,
    });
    toast.success(`Treatment out · total ${fmtDur(durSec)}`);
    onDone();
  }

  function addLine(itemName: string) {
    const it = inventory.find((x) => x.name === itemName);
    if (!it) return;
    setLines((l) => [...l, { id: crypto.randomUUID(), item_id: it.id, item_name: it.name, qty: 1, unit: "pcs" }]);
  }
  function bump(id: string, d: number) {
    setLines((ls) => ls.map((x) => x.id === id ? { ...x, qty: Math.max(1, x.qty + d) } : x));
  }

  async function sendApproval() {
    const valid = lines.filter((l) => l.qty > 0);
    if (!valid.length) return toast.error("Add at least one item");
    const rows = valid.map((l) => ({
      visit_id: visit.id, patient_name: visit.customer_name, item_id: l.item_id,
      item_name: l.item_name, qty_used: l.qty, unit: l.unit, status: "pending", staff: visit.assigned_staff,
    }));
    const { error } = await supabase.from("consumption_logs").insert(rows);
    if (error) return toast.error(error.message);
    // Map floor consumption straight onto the Master Inventory: optimistic UI
    // first, then FIFO batch deduction + append-only ledger entry per movement.
    try {
      await commitStockMovement(
        qc,
        valid.map((l) => ({ inventory_id: l.item_id, qty: l.qty })),
        "Service Consumed",
        "Floor Duty",
        `${visit.customer_name} · ${visit.area_of_interest ?? "Treatment"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stock deduction failed");
    }
    fireAlert();
    toast.success("Sent for approval · stock provisionally deducted");
    setLines([]);
    onDone();
  }

  const badge = running ? `In${room || visit.room ? ` · ${room || visit.room}` : ""}` : assigned ? "Active Duty" : "Assigned";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">{visit.customer_name}</p>
          <p className="text-sm text-muted-foreground">{visit.area_of_interest}</p>
        </div>
        <Badge variant={running ? "default" : "secondary"}>{badge}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Staff: {visit.assigned_staff ?? "—"}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!assigned && (
          <Button variant="outline" size="sm" onClick={takeDuty}>
            <HandMetal className="mr-1 h-4 w-4" /> Take Duty / Self-Assign
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setShowRx(true)}>
          <FileText className="mr-1 h-4 w-4" /> Show Prescription
        </Button>
      </div>

      {/* Active-duty controls: room + Treatment In/Out + live timer */}
      {assigned && (
        <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
          {running ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold"><Timer className="h-4 w-4 text-primary" /> Live Treatment Time</span>
              <span className="font-mono text-lg font-bold text-primary">{fmtDur((now - (startedAt ?? now)) / 1000)}</span>
            </div>
          ) : (
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select room" /></SelectTrigger>
              <SelectContent>
                {rooms.map((r) => <SelectItem key={r.id} value={r.room_name} disabled={r.status === "OCCUPIED" && r.room_name !== room}>{r.room_name} {r.status === "OCCUPIED" ? "(busy)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {running ? (
            <Button className="h-11 w-full" variant="destructive" onClick={treatmentOut}><StopCircle className="mr-1 h-4 w-4" /> Treatment Out</Button>
          ) : (
            <Button className="h-11 w-full" onClick={treatmentIn}><PlayCircle className="mr-1 h-4 w-4" /> Treatment In</Button>
          )}
        </div>
      )}

      {/* Stock consumption */}
      <div className="mt-4 rounded-lg bg-muted/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-semibold"><Boxes className="h-4 w-4" /> Stock Consumption</span>
          <div className="w-44">
            <Autocomplete
              className="h-9 text-xs"
              placeholder="+ Add item"
              searchPlaceholder="Search Rental / Injectable / In-House…"
              options={inventory.map((it) => ({ value: it.name, label: it.name, sublabel: `${it.cat} · stk ${it.stock_qty}` }))}
              onSelect={(o) => addLine(o.value)}
            />
          </div>
        </div>
        {lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">No items logged.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1">{l.item_name}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => bump(l.id, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                  <span className="w-7 text-center font-semibold">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => bump(l.id, 1)}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
                <Select value={l.unit} onValueChange={(v) => setLines((ls) => ls.map((x) => x.id === l.id ? { ...x, unit: v } : x))}>
                  <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>{["pcs", "ml", "boxes", "units"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" className="w-full" onClick={sendApproval}><Send className="mr-1 h-4 w-4" /> Send for Approval</Button>
          </div>
        )}
      </div>

      {visit.treatment_ended_at && (
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={async () => {
          await supabase.from("patient_visits").update({ status: "billing", busy_till: null }).eq("id", visit.id);
          await supabase.from("clinic_rooms").update({ status: "FREE", current_patient_id: null, current_patient_name: null, current_treatment: null, assigned_staff_id: null, busy_till: null, last_updated: new Date().toISOString() }).eq("room_name", visit.room ?? "");
          toast.success("Finished · sent to Reception for final billing");
          onDone();
        }}>
          <CheckCircle2 className="mr-1 h-4 w-4" /> Finish & Send to Billing
        </Button>
      )}

      <ShowPrescriptionDialog open={showRx} onOpenChange={setShowRx} visit={visit} />
    </Card>
  );
});

/* Treatment-only prescription view — all financial figures are hidden for therapists. */
function ShowPrescriptionDialog({ open, onOpenChange, visit }: { open: boolean; onOpenChange: (v: boolean) => void; visit: DutyVisit }) {
  const { data } = useQuery({
    queryKey: ["duty-rx", visit.id],
    enabled: open,
    queryFn: async () => {
      const [{ data: rec }, { data: cust }] = await Promise.all([
        supabase.from("patient_visits").select("prescription,counselor_notes,area_of_interest").eq("id", visit.id).maybeSingle(),
        supabase.from("customers").select("age,gender").ilike("name", visit.customer_name).limit(1).maybeSingle(),
      ]);
      return { rec, cust };
    },
  });
  const rec = data?.rec as Record<string, unknown> | undefined;
  const cust = data?.cust as Record<string, unknown> | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Prescription — {visit.customer_name}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {[cust?.age ? `${cust.age}y` : "", (cust?.gender as string) ?? ""].filter(Boolean).join(" · ") || "—"}
          </p>
          <Section title="Area of Interest / Treatment Plan" body={(rec?.area_of_interest as string) ?? visit.area_of_interest ?? ""} />
          <Section title="Doctor Notes / Instructions" body={(rec?.prescription as string) ?? ""} />
          <Section title="Suggested Services & Products" body={(rec?.counselor_notes as string) ?? ""} />
          <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
            Financial details (amounts, rates, discounts, billing) are hidden for clinical staff.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{body?.trim() || "—"}</p>
    </div>
  );
}
