// ============================================================================
// Structured treatment recommendation the doctor hands to the counselor.
// Sits inside the existing Doctor room card; the free-text prescription stays.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServiceCatalog, useProductCatalog, serviceOptions, productOptions } from "@/lib/catalog";
import { inr2, round2 } from "@/lib/gst";
import { getVisitWorkflow, saveRecommendation } from "@/lib/clinical-workflow.functions";
import type { RecommendationItemInput, Urgency } from "@/lib/clinical-workflow.functions";
import { ClipboardList, Save } from "lucide-react";
import { toast } from "sonner";

interface Row extends RecommendationItemInput {
  key: string;
  sessions: number;
  quantity: number;
  suggested_price: number;
  urgency: Urgency;
}

const URGENCIES: Urgency[] = ["low", "normal", "high", "urgent"];

function rowTotal(r: Row) {
  return round2(r.suggested_price * (r.item_type === "service" ? r.sessions : r.quantity));
}

export function DoctorRecommendationPanel({
  visitId,
  customerName,
  bindSave,
}: {
  visitId: string;
  customerName: string;
  /** Lets the parent card save the recommendation before routing to a counselor. */
  bindSave?: (fn: () => Promise<void>) => void;
}) {
  const { data: services } = useServiceCatalog();
  const { data: products } = useProductCatalog();
  const loadFn = useServerFn(getVisitWorkflow);
  const saveFn = useServerFn(saveRecommendation);

  const [rows, setRows] = useState<Row[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [instructions, setInstructions] = useState("");
  const hydrated = useRef(false);

  const { data: existing } = useQuery({
    queryKey: ["visit-workflow", visitId],
    queryFn: () => loadFn({ data: { visit_id: visitId } }),
  });

  useEffect(() => {
    if (!existing || hydrated.current) return;
    hydrated.current = true;
    setDiagnosis(existing.prescription?.diagnosis ?? "");
    setInstructions(existing.prescription?.instructions ?? "");
    setRows(
      (existing.items ?? []).map((i) => ({
        key: crypto.randomUUID(),
        item_type: i.item_type === "product" ? "product" : "service",
        service_id: i.service_id,
        inventory_id: i.inventory_id,
        name: i.name,
        sessions: Number(i.sessions ?? 1),
        quantity: Number(i.quantity ?? 1),
        suggested_price: Number(i.suggested_price ?? 0),
        urgency: (i.urgency as Urgency) ?? "normal",
        notes: i.notes,
      })),
    );
  }, [existing]);

  const total = round2(rows.reduce((s, r) => s + rowTotal(r), 0));

  const save = useMutation({
    mutationFn: (finalize: boolean) =>
      saveFn({
        data: {
          visit_id: visitId,
          customer_name: customerName,
          diagnosis: diagnosis || null,
          instructions: instructions || null,
          finalize,
          items: rows.map(({ key: _key, ...r }) => r),
        },
      }),
  });

  useEffect(() => {
    bindSave?.(async () => {
      if (!rows.length && !diagnosis.trim() && !instructions.trim()) return;
      await save.mutateAsync(true);
    });
  }, [bindSave, rows, diagnosis, instructions]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addService(id: string) {
    const s = (services ?? []).find((x) => x.id === id);
    if (!s) return;
    setRows((rs) => [
      ...rs,
      {
        key: crypto.randomUUID(),
        item_type: "service",
        service_id: s.id,
        name: s.name,
        sessions: 1,
        quantity: 1,
        suggested_price: Number(s.default_price ?? 0),
        urgency: "normal",
      },
    ]);
  }

  function addProduct(id: string) {
    const p = (products ?? []).find((x) => x.id === id);
    if (!p) return;
    setRows((rs) => [
      ...rs,
      {
        key: crypto.randomUUID(),
        item_type: "product",
        inventory_id: p.id,
        name: p.name,
        sessions: 1,
        quantity: 1,
        suggested_price: Number(p.sale_price ?? 0),
        urgency: "normal",
      },
    ]);
  }

  async function persist(finalize: boolean) {
    try {
      await save.mutateAsync(finalize);
      toast.success(finalize ? "Recommendation sent to the counselor" : "Recommendation saved as draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the recommendation");
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <ClipboardList className="h-3.5 w-3.5" /> Treatment Recommendation
        {existing?.prescription?.status === "finalized" && <Badge variant="secondary">Sent</Badge>}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Diagnosis</Label>
          <Textarea rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Provisional diagnosis…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instructions</Label>
          <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Care instructions for the patient…" />
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Recommend Treatment</Label>
          <Autocomplete
            options={serviceOptions(services ?? [])}
            placeholder="Search treatments…"
            searchPlaceholder="Type e.g. glow, LHR…"
            emptyText="No treatment match."
            onSelect={(o) => addService(o.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Recommend Product</Label>
          <Autocomplete
            options={productOptions(products ?? [])}
            placeholder="Search products…"
            searchPlaceholder="Type product / medicine…"
            emptyText="No product match."
            onSelect={(o) => addProduct(o.value)}
          />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-2 space-y-2 rounded-lg border bg-background p-2">
          {rows.map((r) => (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">
                  <Badge variant="secondary" className="mr-1">{r.item_type === "service" ? "Svc" : "Prod"}</Badge>
                  {r.name}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    className="h-8 w-20"
                    value={r.suggested_price}
                    onChange={(e) => update(r.key, { suggested_price: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">{r.item_type === "service" ? "Sess" : "Qty"}</span>
                  <Input
                    type="number"
                    className="h-8 w-14"
                    value={r.item_type === "service" ? r.sessions : r.quantity}
                    onChange={(e) =>
                      update(r.key, r.item_type === "service"
                        ? { sessions: Math.max(1, Number(e.target.value)) }
                        : { quantity: Math.max(1, Number(e.target.value)) })
                    }
                  />
                </div>
                <span className="w-20 text-right font-medium">{inr2(rowTotal(r))}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  ×
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-1">
                <Select value={r.urgency} onValueChange={(v) => update(r.key, { urgency: v as Urgency })}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {URGENCIES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 flex-1 text-xs"
                  placeholder="Note for the counselor (optional)"
                  value={r.notes ?? ""}
                  onChange={(e) => update(r.key, { notes: e.target.value })}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2 text-xs">
            <span className="text-muted-foreground">Doctor's indicative value</span>
            <span className="text-sm font-bold">{inr2(total)}</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => persist(false)} disabled={save.isPending}>
          <Save className="mr-1 h-4 w-4" /> Save Draft
        </Button>
        <Button size="sm" onClick={() => persist(true)} disabled={save.isPending}>
          Send Recommendation
        </Button>
      </div>
    </div>
  );
}
