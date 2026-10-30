import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useServiceCatalog, useProductCatalog } from "@/lib/catalog";
import { inr2 } from "@/lib/gst";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface RecItem {
  id: string;
  type: "service" | "product";
  serviceId?: string;
  productId?: string;
  name: string;
  quantity: number;
  doctorSuggestedPrice: number;
  notes: string;
}

interface QueuePatient {
  encounterId: string;
  customerId: string | null;
  name: string;
  phone: string;
}

export function DoctorTreatmentRecommendation() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<QueuePatient | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [items, setItems] = useState<RecItem[]>([]);
  const [counselorId, setCounselorId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useServiceCatalog();
  const { data: products = [] } = useProductCatalog();

  const { data: clientReg } = useQuery({
    queryKey: ["client-reg-doctor", selected?.name, selected?.phone],
    enabled: !!selected,
    queryFn: async () => {
      const cleanPhone = (selected?.phone || "").replace(/\D/g, "");
      if (cleanPhone) {
        const { data } = await (supabase as any)
          .from("client_registrations")
          .select("*")
          .eq("mobile_no", cleanPhone)
          .maybeSingle();
        if (data) return data;
      }
      if (selected?.name) {
        const firstName = selected.name.split(" ")[0];
        const { data } = await (supabase as any)
          .from("client_registrations")
          .select("*")
          .ilike("first_name", firstName)
          .maybeSingle();
        return data;
      }
      return null;
    },
  });

  const { data: patients = [], refetch } = useQuery({
    queryKey: ["doctor-room-queue"],
    queryFn: async (): Promise<QueuePatient[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("encounters")
        .select("id, customer_id, customer_name, status, created_at")
        .in("status", ["checked_in", "in_progress"])
        .gte("created_at", `${today}T00:00:00Z`)
        .order("created_at");
      const rows = data ?? [];
      const ids = rows.map((r) => r.customer_id).filter(Boolean) as string[];
      const phones = new Map<string, string>();
      if (ids.length) {
        const { data: cs } = await supabase.from("customers").select("id, phone").in("id", ids);
        (cs ?? []).forEach((c) => phones.set(c.id, c.phone ?? ""));
      }
      return rows.map((r) => ({
        encounterId: r.id,
        customerId: r.customer_id,
        name: r.customer_name ?? "Unknown",
        phone: r.customer_id ? (phones.get(r.customer_id) ?? "") : "",
      }));
    },
    refetchInterval: 30_000,
  });

  const { data: counselors = [] } = useQuery({
    queryKey: ["doctor-room-counselors"],
    queryFn: async () => {
      const { data: rs } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["counselor", "counselor_1", "counselor_2"]);
      const ids = Array.from(new Set((rs ?? []).map((r) => r.user_id)));
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return ids.map((id) => ({
        id,
        name: (ps ?? []).find((p) => p.id === id)?.full_name ?? "Counselor",
      }));
    },
  });

  const addItem = (type: "service" | "product") =>
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, name: "", quantity: 1, doctorSuggestedPrice: 0, notes: "" },
    ]);

  const updateItem = (id: string, patch: Partial<RecItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const total = useMemo(
    () => items.reduce((s, it) => s + it.doctorSuggestedPrice * it.quantity, 0),
    [items],
  );

  const pick = (p: QueuePatient) => {
    setSelected(p);
    setDiagnosis("");
    setClinicalNotes("");
    setItems([]);
    setCounselorId("");
  };

  const sendToCounselor = async () => {
    if (!selected) return toast.error("Select a patient first");
    if (!items.length) return toast.error("Add at least one service or medicine");
    if (items.some((i) => !i.name)) return toast.error("Every row needs an item selected");
    if (!counselorId) return toast.error("Choose a counselor");
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("treatment_recommendations")
        .insert({
          encounter_id: selected.encounterId,
          customer_id: selected.customerId,
          customer_name: selected.name,
          doctor_id: user?.id as string,
          diagnosis: diagnosis || null,
          clinical_notes: clinicalNotes || null,
          items_json: items.map((it) => ({
            id: it.id,
            type: it.type,
            service_id: it.type === "service" ? (it.serviceId ?? null) : null,
            product_id: it.type === "product" ? (it.productId ?? null) : null,
            name: it.name,
            quantity: it.quantity,
            doctor_suggested_price: it.doctorSuggestedPrice,
            notes: it.notes,
          })),
          status: "sent_to_counselor",
          sent_to_counselor_at: new Date().toISOString(),
          sent_to_counselor_id: counselorId,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Recommendation sent to the counselor");
      await refetch();
      window.location.href = `/counselor-room?encounter=${selected.encounterId}&recommendation=${data.id}`;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s patients
        </h2>
        <div className="space-y-2">
          {patients.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No checked-in patients</p>
          ) : (
            patients.map((p) => (
              <button
                key={p.encounterId}
                type="button"
                onClick={() => pick(p)}
                className={`w-full rounded-lg border p-3 text-left transition hover:bg-accent ${
                  selected?.encounterId === p.encounterId ? "border-primary bg-accent" : ""
                }`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.phone || "—"}</div>
              </button>
            ))
          )}
        </div>
      </Card>

      {selected ? (
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 border-b pb-3">
            <div className="text-lg font-semibold">{selected.name}</div>
            {clientReg && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                {clientReg.has_allergies === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 border border-rose-300 text-rose-800 flex items-center gap-1">
                    🚨 ALLERGY: {clientReg.allergy_details || "Reported"}
                  </span>
                )}
                {String(clientReg.medical_conditions || "").includes("Keloids") && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 border border-amber-300 text-amber-900">
                    ⚠️ KELOID PRONE
                  </span>
                )}
                {String(clientReg.medical_conditions || "").includes("Diabetes") && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 border border-amber-200 text-amber-800">
                    Diabetes
                  </span>
                )}
                {String(clientReg.medical_conditions || "").includes("Hypertension") && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 border border-amber-200 text-amber-800">
                    Hypertension
                  </span>
                )}
                {String(clientReg.medical_conditions || "").includes("Implant") && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 border border-rose-300 text-rose-800">
                    ⚠️ BODY IMPLANT / PACEMAKER
                  </span>
                )}
              </div>
            )}
            <div className="text-xs text-muted-foreground">{selected.phone || "—"}</div>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label>Diagnosis</Label>
              <Input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Acne, Hairfall, Pigmentation"
              />
            </div>
            <div>
              <Label>Send to counselor</Label>
              <Select value={counselorId} onValueChange={setCounselorId}>
                <SelectTrigger><SelectValue placeholder="Select counselor..." /></SelectTrigger>
                <SelectContent>
                  {counselors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-5">
            <Label>Clinical notes &amp; instructions</Label>
            <Textarea
              rows={4}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Condition, treatment plan, special instructions..."
            />
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Treatment recommendation</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => addItem("service")}>
                <Plus className="mr-1 h-4 w-4" /> Service
              </Button>
              <Button size="sm" variant="secondary" onClick={() => addItem("product")}>
                <Plus className="mr-1 h-4 w-4" /> Medicine
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Add services and medicines above
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="rounded-lg border bg-muted/40 p-3">
                  <div className="grid items-end gap-3 md:grid-cols-6">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={it.type}
                        onValueChange={(v) =>
                          updateItem(it.id, {
                            type: v as "service" | "product",
                            name: "",
                            serviceId: undefined,
                            productId: undefined,
                            doctorSuggestedPrice: 0,
                          })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="service">Service</SelectItem>
                          <SelectItem value="product">Medicine / Product</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2">
                      <Label className="text-xs">{it.type === "service" ? "Service" : "Medicine / Product"}</Label>
                      <Select
                        value={(it.type === "service" ? it.serviceId : it.productId) ?? ""}
                        onValueChange={(v) => {
                          if (it.type === "service") {
                            const s = services.find((x) => x.id === v);
                            updateItem(it.id, {
                              serviceId: v,
                              name: s?.name ?? "",
                              doctorSuggestedPrice: Number(s?.default_price ?? 0),
                            });
                          } else {
                            const p = products.find((x) => x.id === v);
                            updateItem(it.id, {
                              productId: v,
                              name: p?.name ?? "",
                              doctorSuggestedPrice: Number(p?.sale_price ?? 0),
                            });
                          }
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {(it.type === "service"
                            ? services.map((s) => ({ id: s.id, name: s.name }))
                            : products.map((p) => ({ id: p.id, name: p.name }))
                          ).map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">{it.type === "service" ? "Sessions" : "Qty"}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => updateItem(it.id, { quantity: parseInt(e.target.value) || 1 })}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Rate (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={it.doctorSuggestedPrice}
                        onChange={(e) =>
                          updateItem(it.id, { doctorSuggestedPrice: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <Input
                    className="mt-2"
                    value={it.notes}
                    onChange={(e) => updateItem(it.id, { notes: e.target.value })}
                    placeholder="e.g. 6 sessions, one per month"
                  />
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="mt-5 rounded-lg border bg-muted/40 p-4 text-right">
                <div className="text-xs text-muted-foreground">Estimated total</div>
                <div className="text-2xl font-bold">{inr2(total)}</div>
              </div>
              <Button className="mt-4 w-full" disabled={saving} onClick={sendToCounselor}>
                {saving ? "Sending..." : (<>Go to Counselor <ArrowRight className="ml-2 h-4 w-4" /></>)}
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="flex items-center justify-center p-12 text-sm text-muted-foreground lg:col-span-2">
          Select a patient to enter the treatment recommendation
        </Card>
      )}
    </div>
  );
}
