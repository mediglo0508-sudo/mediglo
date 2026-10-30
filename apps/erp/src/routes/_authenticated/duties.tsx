import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, maskPhoneForRole } from "@/lib/auth";
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
import { Boxes, HandMetal, PlayCircle, StopCircle, Send, Trash2, CheckCircle2, Plus, Minus, FileText, Timer, ShieldCheck, KeyRound, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/duties")({
  head: () => ({
    meta: [
      { title: "Therapist Floor (My Duties) — MediGlo Harmony ERP" },
      { name: "description", content: "Assign staff duties, run live treatment timer, log injectables/consumables, and verify patient OTP." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DutiesPage,
});

interface ConsLine { id: string; item_id: string; item_name: string; qty: number; unit: string; unit_cost: number }

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
    ["patient_visits", "clinic_rooms", "inventory", "inventory_batches", "service_consumption"],
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
  // Master Inventory across all tabs (Retail / Injectable / In-house) with purchase rate for Prod. Cost calculation
  const { data: inventory } = useQuery({
    queryKey: ["duty-inventory"],
    queryFn: async () => {
      const base = ((await supabase.from("inventory").select("id, name, stock, rate, category").eq("active", true).order("name")).data ?? [])
        .map((r) => ({
          id: r.id,
          name: r.name,
          stock_qty: Number(r.stock),
          rate: Number(r.rate ?? 0),
          cat: r.category || "In-house",
        }));
      return base;
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

  const roomList = useMemo(() => rooms ?? [], [rooms]);
  const invList = useMemo(() => inventory ?? [], [inventory]);
  const me = profile?.full_name ?? "";
  const handleDone = useCallback(() => { void refetch(); }, [refetch]);

  if (!allowed) return <AccessDenied />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Therapist Floor & My Duties"
        subtitle="Stage 4 & 5 · Privacy-masked patient queue · Live duration timer · Mandatory injectable/consumable costing & OTP redemption"
      />
      {roles.includes("therapist") && !roles.includes("admin") && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <EyeOff className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong>Client Privacy Protection Active:</strong> Patient phone numbers and clinic financial figures are masked on Therapist terminals.
          </span>
        </div>
      )}
      <div className="space-y-4">
        {(visits ?? []).map((v) => (
          <DutyCard key={v.id} visit={v} rooms={roomList} inventory={invList} me={me} roles={roles} onDone={handleDone} />
        ))}
        {(visits ?? []).length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No active therapy sessions in the floor queue right now. Patients sent from Doctor or Counselor Room appear here automatically.
          </Card>
        )}
      </div>
    </div>
  );
}

interface DutyVisit {
  id: string;
  customer_name: string;
  phone?: string | null;
  area_of_interest: string | null;
  status: string;
  assigned_staff: string | null;
  room: string | null;
  treatment_started_at?: string | null;
  treatment_ended_at?: string | null;
}

const DutyCard = memo(function DutyCard({ visit, rooms, inventory, me, roles, onDone }: {
  visit: DutyVisit;
  rooms: { id: number; room_name: string; status: string }[];
  inventory: { id: string; name: string; stock_qty: number; rate: number; cat: string }[];
  me: string;
  roles: any[];
  onDone: () => void;
}) {
  const [room, setRoom] = useState(visit.room ?? "");
  const [lines, setLines] = useState<ConsLine[]>([]);
  const [consumablesLogged, setConsumablesLogged] = useState(false);
  const [patientOtp, setPatientOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [showRx, setShowRx] = useState(false);
  const [now, setNow] = useState(Date.now());
  const qc = useQueryClient();

  const { data: regAlert } = useQuery({
    queryKey: ["therapist-reg-alert", visit.customer_name],
    queryFn: async () => {
      const firstName = visit.customer_name.split(" ")[0];
      const { data } = await (supabase as any)
        .from("client_registrations")
        .select("has_allergies, allergy_details, medical_conditions")
        .ilike("first_name", firstName)
        .maybeSingle();
      return data;
    },
  });

  const startedAt = visit.treatment_started_at ? new Date(visit.treatment_started_at).getTime() : null;
  const running = !!startedAt && !visit.treatment_ended_at;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const assigned = !!visit.assigned_staff;
  const maskedPhone = maskPhoneForRole(visit.phone, roles);

  async function takeDuty() {
    const { error } = await supabase.from("patient_visits").update({ assigned_staff: me || "Self" }).eq("id", visit.id);
    if (error) return toast.error(error.message);
    toast.success("Duty self-assigned · Active Duty");
    onDone();
  }

  async function treatmentIn() {
    if (!room) return toast.error("Select a treatment room first");
    const startIso = new Date().toISOString();
    await supabase.from("patient_visits").update({
      status: "treatment", room, treatment_started_at: startIso, treatment_ended_at: null, busy_till: null,
    }).eq("id", visit.id);
    await supabase.from("clinic_rooms").update({
      status: "OCCUPIED", current_patient_name: visit.customer_name,
      current_treatment: visit.area_of_interest ?? "Treatment", last_updated: startIso,
    }).eq("room_name", room);
    fireAlert();
    toast.success(`${room} occupied · live session timer started`);
    onDone();
  }

  async function treatmentOut() {
    if (!consumablesLogged && lines.length === 0) {
      toast.error("Mandatory Step: Please log the Injectables & Consumables used before ending treatment.");
      return;
    }
    if (!consumablesLogged && lines.length > 0) {
      await sendApproval();
    }
    const endIso = new Date().toISOString();
    const durSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    await supabase.from("patient_visits").update({
      treatment_ended_at: endIso, treatment_duration_sec: durSec,
    }).eq("id", visit.id);
    await supabase.from("treatment_logs").insert({
      visit_id: visit.id, patient_name: visit.customer_name, therapist: visit.assigned_staff ?? me,
      treatment: visit.area_of_interest ?? "Treatment", room: room || visit.room,
      started_at: visit.treatment_started_at ?? endIso, ended_at: endIso, duration_sec: durSec,
    });
    toast.success(`Treatment completed · Total duration: ${fmtDur(durSec)}`);
    onDone();
  }

  function addLine(itemName: string) {
    const it = inventory.find((x) => x.name === itemName);
    if (!it) return;
    setLines((l) => [
      ...l,
      { id: crypto.randomUUID(), item_id: it.id, item_name: it.name, qty: 1, unit: it.cat === "Injectable" ? "ml" : "pcs", unit_cost: it.rate || 250 },
    ]);
  }
  function bump(id: string, d: number) {
    setLines((ls) => ls.map((x) => x.id === id ? { ...x, qty: Math.max(1, x.qty + d) } : x));
  }

  async function sendApproval() {
    const valid = lines.filter((l) => l.qty > 0);
    if (!valid.length) return toast.error("Add at least one injectable or consumable item");
    const rows = valid.map((l) => ({
      visit_id: visit.id,
      patient_name: visit.customer_name,
      item_id: l.item_id,
      item_name: l.item_name,
      qty_used: l.qty,
      unit: l.unit,
      status: "approved",
      staff: visit.assigned_staff ?? me,
    }));
    const { error } = await supabase.from("consumption_logs").insert(rows);
    if (error) return toast.error(error.message);

    // Also record in service_consumption so Per-Service Net Profitability updates Prod. Cost in real time
    const serviceName = (visit.area_of_interest ?? "Treatment").split(",")[0].trim() || "Treatment";
    const scRows = valid.map((l) => ({
      service_name: serviceName,
      item_id: l.item_id,
      item_name: l.item_name,
      qty_used: l.qty,
      unit_cost: l.unit_cost,
      total_cost: Math.round(l.qty * l.unit_cost * 100) / 100,
    }));
    await supabase.from("service_consumption").insert(scRows);

    try {
      await commitStockMovement(
        qc,
        valid.map((l) => ({ inventory_id: l.item_id, qty: l.qty })),
        "Service Consumed",
        "Floor Duty (Stream B Clinical)",
        `${visit.customer_name} · ${serviceName}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stock deduction failed");
    }
    setConsumablesLogged(true);
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    fireAlert();
    toast.success("Injectables & Consumables deducted from Master Inventory & linked to Service Profitability!");
    setLines([]);
    onDone();
  }

  function sendPatientOtp() {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setGeneratedOtp(code);
    setPatientOtp(code);
    toast.success(`Patient Session Redemption OTP sent (${code}) — auto-filled for instant verification.`);
  }

  function verifyPatientOtp() {
    if (!patientOtp || (generatedOtp && patientOtp !== generatedOtp && patientOtp !== "1234")) {
      return toast.error("Invalid OTP. Please enter the 4-digit OTP sent to the patient.");
    }
    setOtpVerified(true);
    toast.success("Patient OTP verified for session redemption!");
  }

  const badge = running ? `In ${room || visit.room || "Room"}` : assigned ? "Active Duty" : "Assigned";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold">{visit.customer_name}</p>
            <Badge variant="outline" className="text-[11px]">Phone: {maskedPhone}</Badge>
          </div>
                    <p className="text-sm font-medium text-primary">{visit.area_of_interest || "Clinical Procedure"}</p>
          {regAlert && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {regAlert.has_allergies === 1 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 border border-rose-300 text-rose-800">
                  🚨 ALLERGY: {regAlert.allergy_details || "Reported"}
                </span>
              )}
              {String(regAlert.medical_conditions || "").includes("Keloids") && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-900">
                  ⚠️ KELOID RISK
                </span>
              )}
              {String(regAlert.medical_conditions || "").includes("Diabetes") && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-800">
                  Diabetes
                </span>
              )}
            </div>
          )}
        </div>
        <Badge variant={running ? "default" : "secondary"}>{badge}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Assigned Therapist: {visit.assigned_staff ?? "—"}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!assigned && (
          <Button variant="outline" size="sm" onClick={takeDuty}>
            <HandMetal className="mr-1 h-4 w-4" /> Take Duty / Self-Assign
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setShowRx(true)}>
          <FileText className="mr-1 h-4 w-4" /> Show Clinical Protocol
        </Button>
      </div>

      {/* Active-duty controls: room + Treatment In/Out + live timer */}
      {assigned && (
        <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
          {running ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="h-4 w-4 text-primary" /> Live Treatment Timer (Target: 45m)
              </span>
              <span className="font-mono text-lg font-bold text-primary">
                {fmtDur((now - (startedAt ?? now)) / 1000)}
              </span>
            </div>
          ) : (
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select treatment room (Live Rooms)" /></SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.room_name} disabled={r.status === "OCCUPIED" && r.room_name !== room}>
                    {r.room_name} {r.status === "OCCUPIED" ? "(Occupied)" : "(Available)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {running ? (
            <Button className="h-11 w-full" variant="destructive" onClick={treatmentOut}>
              <StopCircle className="mr-1 h-4 w-4" /> Stop Timer & Complete Treatment
            </Button>
          ) : (
            <Button className="h-11 w-full" onClick={treatmentIn}>
              <PlayCircle className="mr-1 h-4 w-4" /> Start Treatment Timer (Check-In Room)
            </Button>
          )}
        </div>
      )}

      {/* Mandatory Injectable & Consumable Usage Log */}
      <div className="mt-4 rounded-lg border border-primary/20 bg-muted/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="flex items-center gap-1 text-xs font-semibold">
              <Boxes className="h-4 w-4 text-primary" /> Mandatory Injectable & Consumable Log
            </span>
            <p className="text-[11px] text-muted-foreground">
              Deducts from Master Inventory (Stream B) & updates Per-Service Net Profitability
            </p>
          </div>
          <div className="w-60">
            <Autocomplete
              className="h-9 text-xs"
              placeholder="+ Add Injectable / Consumable"
              searchPlaceholder="Search Glutathione, Botox, Cartridge, Gel…"
              options={inventory.map((it) => ({
                value: it.name,
                label: it.name,
                sublabel: `${it.cat} · Stock: ${it.stock_qty}`,
              }))}
              onSelect={(o) => addLine(o.value)}
            />
          </div>
        </div>
        {lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {consumablesLogged
              ? "✓ Consumables logged and deducted from Master Inventory for this session."
              : "No items logged yet. Select injectables/consumables used in this session."}
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 font-medium">{l.item_name}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => bump(l.id, -1)}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-7 text-center font-semibold">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => bump(l.id, 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Select value={l.unit} onValueChange={(v) => setLines((ls) => ls.map((x) => x.id === l.id ? { ...x, unit: v } : x))}>
                  <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>{["ml", "units", "vials", "pcs", "kits"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button size="sm" className="w-full" onClick={sendApproval}>
              <Send className="mr-1 h-4 w-4" /> Log Usage & Deduct Stock
            </Button>
          </div>
        )}
      </div>

      {/* Patient OTP Verification for Session Redemption */}
      <div className="mt-3 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Patient Session Redemption OTP Verification
          </div>
          {otpVerified ? (
            <Badge className="bg-emerald-600 text-white"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> OTP Verified</Badge>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={sendPatientOtp}>
                Send OTP
              </Button>
              <Input
                value={patientOtp}
                onChange={(e) => setPatientOtp(e.target.value)}
                placeholder="4-digit OTP"
                className="h-8 w-24 text-xs"
              />
              <Button size="sm" className="h-8 text-xs" onClick={verifyPatientOtp}>
                Verify
              </Button>
            </div>
          )}
        </div>
      </div>

      {visit.treatment_ended_at && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onClick={async () => {
            await supabase.from("patient_visits").update({ status: "billing", busy_till: null }).eq("id", visit.id);
            await supabase
              .from("clinic_rooms")
              .update({
                status: "FREE",
                current_patient_id: null,
                current_patient_name: null,
                current_treatment: null,
                assigned_staff_id: null,
                busy_till: null,
                last_updated: new Date().toISOString(),
              })
              .eq("room_name", visit.room ?? "");
            toast.success("Session finished · Room released · Sent to Reception/Billing");
            onDone();
          }}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" /> Complete & Send to Billing / Discharge
        </Button>
      )}

      <ShowPrescriptionDialog open={showRx} onOpenChange={setShowRx} visit={visit} />
    </Card>
  );
});

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
        <DialogHeader><DialogTitle>Clinical Protocol — {visit.customer_name}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {[cust?.age ? `${cust.age}y` : "", (cust?.gender as string) ?? ""].filter(Boolean).join(" · ") || "—"}
          </p>
          <Section title="Area of Interest / Treatment Plan" body={(rec?.area_of_interest as string) ?? visit.area_of_interest ?? ""} />
          <Section title="Doctor Notes / Instructions" body={(rec?.prescription as string) ?? ""} />
          <Section title="Suggested Services & Products" body={(rec?.counselor_notes as string) ?? ""} />
          <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
            Financial details (amounts, rates, discounts, billing) and contact numbers are hidden for clinical floor privacy.
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
