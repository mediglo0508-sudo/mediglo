import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useServices, useProducts } from "@/hooks/useQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Send } from "lucide-react";
import { cn, formatINR, todayIST, istDateBoundaryToUtcISO } from "@/lib/utils";
import type { PrescriptionItem } from "@/types/domain";

interface QueueEncounter {
  id: string;
  customer_id: string;
  status: string;
  customers: { name: string; phone: string } | null;
}

export default function DoctorRoomPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: services } = useServices();
  const { data: products } = useProducts();

  const [selected, setSelected] = useState<QueueEncounter | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [counselorId, setCounselorId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: queue } = useQuery({
    queryKey: ["doctor_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encounters")
        .select("id, customer_id, status, customers(name, phone)")
        .in("status", ["checked_in", "in_progress"])
        .gte("created_at", istDateBoundaryToUtcISO(todayIST()))
        .order("created_at");
      if (error) throw error;
      return data as unknown as QueueEncounter[];
    },
    refetchInterval: 15_000,
  });

  // CRITICAL fix: a non-admin doctor's RLS on user_roles only lets them read
  // their OWN role row, so a direct `.from("user_roles").eq("role","counselor")`
  // query (the original code) silently returned zero rows for every real
  // doctor - the "Select counselor" dropdown was always empty, and Send to
  // Counselor is hard-blocked without a selection. list_staff_by_role() is a
  // SECURITY DEFINER RPC scoped to exactly "id + name for this one role",
  // which fixes the dropdown without widening user_roles SELECT to every
  // staff member's full role list.
  const { data: counselors } = useQuery({
    queryKey: ["counselors_list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_staff_by_role", { p_role: "counselor" });
      if (error) throw error;
      return data as { user_id: string; full_name: string }[];
    },
  });

  function selectEncounter(e: QueueEncounter) {
    setSelected(e);
    setDiagnosis("");
    setClinicalNotes("");
    setItems([]);
    setCounselorId("");
  }

  function addItem(type: "service" | "product") {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, name: "", quantity: 1, doctor_suggested_price: 0, doctor_notes: "" },
    ]);
  }

  function updateItem(id: string, patch: Partial<PrescriptionItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const total = items.reduce((s, i) => s + i.quantity * i.doctor_suggested_price, 0);

  async function handleSend() {
    if (!selected) return;
    if (items.length === 0) {
      toast.error("Add at least one service or product");
      return;
    }
    if (!counselorId) {
      toast.error("Select a counselor to send this to");
      return;
    }
    setSaving(true);
    try {
      // Atomic: create_prescription() writes the header, the items, and the
      // encounter status flip inside ONE transaction (see
      // 0011_production_hardening.sql). Previously these were three separate
      // calls with no rollback between them - a bad item (e.g. a negative
      // quantity, which nothing here used to stop from being typed) could
      // fail on the second call and leave a permanently orphaned, zero-item
      // prescription sitting in the counselor's queue with no way to fix or
      // remove it.
      const { error } = await supabase.rpc("create_prescription", {
        p_encounter_id: selected.id,
        p_customer_id: selected.customer_id,
        p_diagnosis: diagnosis,
        p_clinical_notes: clinicalNotes,
        p_counselor_id: counselorId,
        p_items: items.map((i) => ({
          type: i.type,
          service_id: i.type === "service" ? i.service_id ?? null : null,
          product_id: i.type === "product" ? i.product_id ?? null : null,
          name: i.name,
          quantity: i.quantity,
          doctor_suggested_price: i.doctor_suggested_price,
          doctor_notes: i.doctor_notes,
        })),
      });
      if (error) throw error;

      toast.success("Sent to counselor");
      setSelected(null);
      setItems([]);
      queryClient.invalidateQueries({ queryKey: ["doctor_queue"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send prescription");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Doctor Room</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <div className="mb-3 text-sm font-semibold">Today's Patients</div>
            <div className="space-y-2">
              {(queue ?? []).length === 0 && <p className="text-sm text-muted-foreground">No checked-in patients.</p>}
              {(queue ?? []).map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEncounter(e)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm transition",
                    selected?.id === e.id ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
                  )}
                >
                  <div className="font-medium">{e.customers?.name ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">{e.customers?.phone}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            {!selected ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Select a patient to write a treatment recommendation.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-bold">{selected.customers?.name}</h3>
                  <p className="text-sm text-muted-foreground">{selected.customers?.phone}</p>
                </div>

                <div>
                  <Label>Diagnosis</Label>
                  <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="mt-1" placeholder="e.g. Acne, Hairfall, Pigmentation" />
                </div>

                <div>
                  <Label>Clinical notes</Label>
                  <Textarea value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} className="mt-1" rows={3} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Treatment recommendation</div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addItem("service")}>
                        <Plus className="mr-1 h-3 w-3" /> Service
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => addItem("product")}>
                        <Plus className="mr-1 h-3 w-3" /> Product
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {items.map((item) => (
                      <div key={item.id} className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-5">
                            <Select
                              value={item.type === "service" ? item.service_id ?? "" : item.product_id ?? ""}
                              onValueChange={(val) => {
                                const list = item.type === "service" ? services : products;
                                const found = list?.find((s: any) => s.id === val);
                                updateItem(item.id, {
                                  ...(item.type === "service" ? { service_id: val } : { product_id: val }),
                                  name: found?.name ?? "",
                                  doctor_suggested_price: (found as any)?.default_price ?? (found as any)?.sale_price ?? 0,
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={`Select ${item.type}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {(item.type === "service" ? services : products)?.map((s: any) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                              placeholder="Qty"
                            />
                          </div>
                          <div className="col-span-3">
                            <Input
                              type="number"
                              value={item.doctor_suggested_price}
                              onChange={(e) => updateItem(item.id, { doctor_suggested_price: Number(e.target.value) || 0 })}
                              placeholder="Rate"
                            />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <Input
                          className="mt-2"
                          value={item.doctor_notes}
                          onChange={(e) => updateItem(item.id, { doctor_notes: e.target.value })}
                          placeholder="Notes, e.g. 6 sessions, 1 per month"
                        />
                      </div>
                    ))}
                  </div>

                  {items.length > 0 && (
                    <div className="mt-3 rounded-md bg-accent p-3 text-right text-lg font-bold text-accent-foreground">
                      Estimated total: {formatINR(total)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 border-t border-border pt-4">
                  <Select value={counselorId} onValueChange={setCounselorId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select counselor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(counselors ?? []).map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSend} disabled={saving || items.length === 0}>
                    <Send className="mr-1 h-4 w-4" /> {saving ? "Sending..." : "Send to Counselor"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
