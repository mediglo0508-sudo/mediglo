import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AREAS_OF_INTEREST } from "@/lib/constants";
import { useRealtimeSync, fireAlert } from "@/lib/realtime";
import { toast } from "sonner";
import { inr2 } from "@/lib/gst";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { printPrescription, buildPrescriptionHtml } from "@/lib/print-layout";
import { loadCompositePrescription } from "@/lib/prescription-history";
import { Plus, LogIn, Loader2, Receipt, Bell, Pencil, Trash2, FileText, Printer, Search, PackageCheck, Wallet } from "lucide-react";
import { useAllPendingWallets } from "@/lib/wallet-alerts";
import { ClientTimelineDialog, type ClientTimelineTarget } from "@/components/ClientTimelineDialog";
import { DigitalRegistrationDialog } from "@/components/DigitalRegistrationDialog";
import { UserPlus } from "lucide-react";



export const Route = createFileRoute("/_authenticated/reception")({
  head: () => ({
    meta: [
      { title: "Reception Desk — MGHYN Clinic ERP" },
      { name: "description", content: "Front-desk check-ins, walk-ins and daily patient flow." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Reception Desk — MGHYN Clinic ERP" },
      { property: "og:description", content: "Front-desk check-ins, walk-ins and daily patient flow." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/reception" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/reception" }],
  }),
  component: ReceptionPage,
});

const STATUS_LABEL: Record<string, string> = {
  reception: "Arrived", waiting: "Waiting Room", doctor: "With Doctor",
  counselor: "Counselor", treatment: "In Treatment", billing: "Ready to Bill",
};

function ReceptionPage() {
  const { canBilling, roles } = useAuth();
  const allowed = canBilling || roles.includes("marketing");
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState<string>(AREAS_OF_INTEREST[0]);
  const [saving, setSaving] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupResult, setLookupResult] = useState<{ name: string; phone: string | null; outstanding: number } | null>(null);
  const [searching, setSearching] = useState(false);

  async function searchClient() {
    if (!lookup.trim()) return;
    setSearching(true);
    const { data: rows } = await supabase
      .from("invoices")
      .select("customer_name, pending_balance")
      .is("voided_at", null)
      .ilike("customer_name", `%${lookup.trim()}%`);
    setSearching(false);
    if (!rows || rows.length === 0) {
      setLookupResult(null);
      return toast.error("No existing client / invoice history found");
    }
    const name = rows[0].customer_name ?? lookup.trim();
    const outstanding = rows.reduce((s, r) => s + Number(r.pending_balance || 0), 0);
    setLookupResult({ name, phone: null, outstanding: Math.round(outstanding * 100) / 100 });
  }

  useRealtimeSync(["patient_visits"], ["reception-visits"]);
  const { data: visits, refetch } = useQuery({
    queryKey: ["reception-visits"],
    queryFn: async () =>
      (await supabase.from("patient_visits").select("*").not("status", "in", "(done,scheduled)").order("created_at", { ascending: false })).data ?? [],
  });

  async function addWalkIn() {
    if (!name.trim()) return toast.error("Enter patient name");
    setSaving(true);
    const { error } = await supabase.from("patient_visits").insert({ customer_name: name.trim(), phone: phone || null, area_of_interest: area, status: "reception" });
    setSaving(false);
    if (error) return toast.error(error.message);
    setName(""); setPhone("");
    toast.success("Walk-in added");
    refetch();
  }

  async function checkIn(v: { id: string; customer_name: string; area_of_interest?: string | null }) {
    // Smart Routing Engine (Module 1): route by Area of Interest.
    const area = v.area_of_interest ?? "";
    let status = "waiting"; // Dr. Consultation → Doctor queue
    let dest = "Doctor Consultation";
    if (area === "Counselling") {
      status = "counselor"; // bypass Doctor → Counselor Dashboard
      dest = "Counselor Dashboard";
    } else if (area === "Direct Treatment") {
      status = "treatment"; // bypass Doctor → Treatment Queue
      dest = "Treatment Queue";
    }
    const { error } = await supabase.from("patient_visits").update({ status }).eq("id", v.id);
    if (error) return toast.error(error.message);
    fireAlert();
    toast.success(`${v.customer_name} → ${dest}`);
    refetch();
  }

  if (!allowed) return <AccessDenied />;

  async function editVisit(v: { id: string; customer_name: string; phone?: string | null }) {
    const newName = window.prompt("Edit patient name:", v.customer_name);
    if (newName === null) return;
    const newPhone = window.prompt("Edit phone:", v.phone ?? "") ?? v.phone ?? null;
    const { error } = await supabase.from("patient_visits").update({ customer_name: newName.trim() || v.customer_name, phone: newPhone }).eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Patient updated");
    refetch();
  }
  async function deleteVisit(v: { id: string; customer_name: string }) {
    if (!window.confirm(`Remove ${v.customer_name} from the board?`)) return;
    const { error } = await supabase.from("patient_visits").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    refetch();
  }

  const arriving = (visits ?? []).filter((v) => v.status === "reception");
  const inFlight = (visits ?? []).filter((v) => v.status !== "reception");

  return (
    <div>
      <PageHeader action={<Button onClick={() => setRegOpen(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold"><UserPlus className="h-4 w-4" /> Digital Patient Registration</Button>} title="Reception Desk — Walk-In / Appointments" subtitle="Stage 2 · check-in patients · live status board" />
      <div className="mb-4"><PrescriptionQuickAction /></div>
      <PendingWalletsBanner />
      <PendingFulfillmentQueue visits={visits ?? []} onGo={(id) => navigate({ to: "/pos", search: { visit: id } as never })} />

      <Card className="mb-4 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Existing Client Lookup — Outstanding Balance</h3>
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Search existing client by name…" onKeyDown={(e) => e.key === "Enter" && searchClient()} />
          <Button size="sm" onClick={searchClient} disabled={searching}>
            {searching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Search
          </Button>
        </div>
        {lookupResult && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <p className="font-medium">{lookupResult.name}</p>
              <p className={`text-sm font-semibold ${lookupResult.outstanding > 0 ? "text-destructive" : "text-emerald-600"}`}>
                Outstanding Balance: {inr2(lookupResult.outstanding)}
              </p>
            </div>
            <Button size="sm" variant={lookupResult.outstanding > 0 ? "destructive" : "outline"}
              onClick={() => navigate({ to: "/pos", search: { name: lookupResult.name } as never })}>
              <Receipt className="mr-1 h-4 w-4" /> Collect Payment
            </Button>
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Direct Walk-In Entry</h3>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Patient Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" /></div>
            <div className="space-y-1.5">
              <Label>Area of Interest</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AREAS_OF_INTEREST.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={addWalkIn} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add Patient
            </Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Arriving — Check-In ({arriving.length})</h3>
            <div className="space-y-2">
              {arriving.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{v.customer_name}</p>
                    <Badge variant="secondary" className="mt-1">{v.area_of_interest}</Badge>
                  </div>
                  <Button size="sm" onClick={() => checkIn(v)}><LogIn className="mr-1 h-4 w-4" /> Check-In</Button>
                </div>
              ))}
              {arriving.length === 0 && <p className="text-sm text-muted-foreground">No patients awaiting check-in.</p>}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Live Patient Board ({inFlight.length})</h3>
            <div className="space-y-2">
              {inFlight.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{v.customer_name} {v.room && <span className="text-muted-foreground">· {v.room}</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.assigned_staff ? `Staff: ${v.assigned_staff}` : "Unassigned"}
                      {v.bill_kind === "product" && " · Product Dispensary"}
                      {v.bill_kind === "consultation" && " · Consultation Fee"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={v.bill_kind === "product" ? "secondary" : "default"}>
                      {v.bill_kind === "product" ? "Product Bill" : STATUS_LABEL[v.status] ?? v.status}
                    </Badge>
                    {v.status === "billing" && (
                      <Button size="sm" variant="outline" onClick={() => navigate({ to: "/pos", search: { visit: v.id } as never })}>
                        <Receipt className="mr-1 h-4 w-4" /> {v.bill_kind === "product" ? "Product Bill" : "Final Bill"}
                      </Button>
                    )}
                    {canBilling && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => editVisit(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteVisit(v)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {inFlight.length === 0 && <p className="text-sm text-muted-foreground">No active patients in the clinic.</p>}
            </div>
          </Card>
        </div>
      </div>
      <DigitalRegistrationDialog open={regOpen} onOpenChange={setRegOpen} defaultCheckIn={true} />
    </div>
  );
}

/* Reception quick-action: search a patient, load their latest prescription, preview & print. */
function PrescriptionQuickAction() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: matches } = useQuery({
    queryKey: ["recep-rx-search", q],
    enabled: open && q.trim().length > 0 && !selected,
    queryFn: async () =>
      (await supabase.from("customers").select("id,name,age,gender").ilike("name", `%${q.trim()}%`).limit(8)).data ?? [],
  });

  const { data: rx } = useQuery({
    queryKey: ["recep-rx-load", selected],
    enabled: open && !!selected,
    queryFn: async () => {
      const [{ data: cust }, { data: rec }, composite] = await Promise.all([
        supabase.from("customers").select("age,gender").ilike("name", selected!).limit(1).maybeSingle(),
        supabase.from("patient_visits").select("prescription,counselor_notes,area_of_interest,created_at")
          .ilike("customer_name", selected!).not("prescription", "is", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        loadCompositePrescription(selected!),
      ]);
      // Prescription history is source-of-truth; fall back to legacy patient_visits.
      const doctorNotes = composite?.doctor_notes || (rec?.prescription as string | null) || "";
      const counselorNotes = composite?.counselor_notes || (rec?.counselor_notes as string | null) || "";
      const productsText = (composite?.products ?? [])
        .map((p) => `${p.name}${p.qty ? ` × ${p.qty}` : ""}`).join(", ");
      const notes = [
        doctorNotes && `Doctor: ${doctorNotes}`,
        counselorNotes && `Counselor: ${counselorNotes}`,
        productsText && `Prescribed Products (fulfil at Reception): ${productsText}`,
      ].filter(Boolean).join("\n\n");
      return {
        patient_name: selected!,
        age: (cust?.age as string | number | null) ?? null,
        gender: (cust?.gender as string | null) ?? null,
        consultation_date: rec?.created_at ? String(rec.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
        notes,
        suggested_services: (composite?.services ?? []).map((s) => s.name).join(", "),
      };
    },
  });


  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" /> Show / Print Prescription
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSelected(null); setQ(""); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Show / Print Prescription</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search patient by name…" value={selected ?? q}
              onChange={(e) => { setSelected(null); setQ(e.target.value); }} />
            {!selected && (matches ?? []).length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                {(matches ?? []).map((c) => (
                  <button key={c.id} type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => { setSelected(c.name); setQ(""); }}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{[c.age ? `${c.age}y` : "", c.gender ?? ""].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && rx && (
            <>
              <div className="flex justify-end">
                <Button onClick={() => printPrescription(rx)}><Printer className="mr-2 h-4 w-4" /> Print Now</Button>
              </div>
              <iframe title="rx-preview" srcDoc={buildPrescriptionHtml(rx)} className="h-[520px] w-full rounded-md border-0 bg-white" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


/* Reception "Pending Fulfillment" — clients currently in the clinic with unbilled product lines. */
interface VisitLite {
  id: string;
  customer_name: string;
  bill_items?: unknown;
  status: string;
}
function PendingFulfillmentQueue({ visits, onGo }: { visits: VisitLite[]; onGo: (id: string) => void }) {
  const rows = visits
    .map((v) => {
      const items = Array.isArray(v.bill_items) ? (v.bill_items as { kind?: string; name?: string; qty?: number }[]) : [];
      const products = items.filter((i) => i.kind === "product");
      return { v, products };
    })
    .filter((r) => r.products.length > 0);
  if (rows.length === 0) return null;
  return (
    <Card className="mb-4 border-cos-due/40 bg-cos-due/5 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <PackageCheck className="h-4 w-4 text-cos-due" /> Pending Product Fulfillment ({rows.length})
      </h3>
      <div className="space-y-2">
        {rows.map(({ v, products }) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{v.customer_name}</p>
                <Badge variant="destructive">Pending Products · {products.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {products.map((p) => `${p.name}${p.qty ? ` × ${p.qty}` : ""}`).join(" · ")}
              </p>
            </div>
            <Button size="sm" onClick={() => onGo(v.id)}>
              <Receipt className="mr-1 h-4 w-4" /> Bill & Fulfill
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* Global wallet alert banner — clients with unredeemed prepaid sessions. */
function PendingWalletsBanner() {
  const { data: wallets } = useAllPendingWallets();
  const [target, setTarget] = useState<ClientTimelineTarget | null>(null);
  if (!wallets || wallets.length === 0) return null;
  const shown = wallets.slice(0, 8);
  return (
    <>
      <Card className="mb-4 border-emerald-500/40 bg-emerald-500/5 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Wallet className="h-4 w-4" /> Active Service Wallets — Pending Sessions ({wallets.length})
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w) => (
            <button
              key={w.id}
              onClick={() => setTarget({ name: w.customer_name ?? "Client", phone: w.customer_phone })}
              className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{w.customer_name ?? "Client"}</p>
                <p className="truncate text-xs text-muted-foreground">{w.service_name}</p>
              </div>
              <Badge variant="secondary" className="ml-2 shrink-0">{w.remaining} left</Badge>
            </button>
          ))}
          `r`n    </div>
        {wallets.length > shown.length && (
          <p className="mt-2 text-xs text-muted-foreground">+ {wallets.length - shown.length} more clients with pending sessions.</p>
        )}
        <p className="mt-2 text-[11px] italic text-muted-foreground">Click a client for last visit, days elapsed, pending sessions and dues.</p>
      </Card>
      <ClientTimelineDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

