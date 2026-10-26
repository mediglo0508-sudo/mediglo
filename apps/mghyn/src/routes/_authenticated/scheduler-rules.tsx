import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_GAP_DAYS } from "@/lib/cos-engine";
import { toast } from "sonner";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scheduler-rules")({
  head: () => ({
    meta: [
      { title: "Scheduler Rules — MGHYN Clinic ERP" },
      { name: "description", content: "Per-service gap rules that drive package auto-booking." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Scheduler Rules — MGHYN Clinic ERP" },
      { property: "og:description", content: "Per-service gap rules that drive package auto-booking." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/scheduler-rules" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/scheduler-rules" }],
  }),
  component: SchedulerRulesPage,
});

const GLOBAL_ID = "GLOBAL_DEFAULT";

interface Service {
  id: string;
  name: string;
  category: string | null;
}
interface Rule {
  service_id: string;
  service_name: string;
  custom_gap_days: number;
  default_gap_days: number | null;
}

function SchedulerRulesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [globalDefault, setGlobalDefault] = useState<string>(String(DEFAULT_GAP_DAYS));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: services } = useQuery({
    queryKey: ["gap-services"],
    queryFn: async () =>
      ((await supabase.from("services_master").select("id, name, category").order("category")).data ?? []) as Service[],
  });
  const { data: rules } = useQuery({
    queryKey: ["gap-rules"],
    queryFn: async () =>
      ((await supabase.from("cos_service_gap_rules").select("service_id, service_name, custom_gap_days, default_gap_days")).data ??
        []) as Rule[],
  });

  useEffect(() => {
    const g = (rules ?? []).find((r) => r.service_id === GLOBAL_ID);
    if (g) setGlobalDefault(String(g.custom_gap_days));
  }, [rules]);

  if (!hasRole("admin")) {
    return (
      <div>
        <PageHeader title="Scheduling Rules" subtitle="Custom treatment intervals." />
        <AccessDenied />
      </div>
    );
  }

  const ruleFor = (id: string) => (rules ?? []).find((r) => r.service_id === id);

  async function saveGlobal() {
    setSavingId(GLOBAL_ID);
    const val = Math.max(1, Number(globalDefault) || DEFAULT_GAP_DAYS);
    const { error } = await supabase.from("cos_service_gap_rules").upsert(
      { service_id: GLOBAL_ID, service_name: "Global Default", custom_gap_days: val, default_gap_days: val },
      { onConflict: "service_id" },
    );
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success(`Global default set to ${val} days`);
    qc.invalidateQueries({ queryKey: ["gap-rules"] });
  }

  async function saveService(s: Service) {
    const raw = edits[s.id] ?? String(ruleFor(s.id)?.custom_gap_days ?? "");
    const val = Number(raw);
    if (!val || val < 1) return toast.error("Enter a valid gap in days");
    setSavingId(s.id);
    const { error } = await supabase.from("cos_service_gap_rules").upsert(
      {
        service_id: s.id,
        service_name: s.name,
        custom_gap_days: val,
        default_gap_days: Number(globalDefault) || DEFAULT_GAP_DAYS,
      },
      { onConflict: "service_id" },
    );
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success(`${s.name}: gap set to ${val} days`);
    qc.invalidateQueries({ queryKey: ["gap-rules"] });
  }

  return (
    <div>
      <PageHeader
        title="Scheduling Rules Engine"
        subtitle="Set per-service treatment session gaps and the global default interval."
      />

      <Card className="mb-4 max-w-xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Global Default Interval</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Applied to any service without a custom rule. Cascading session scheduling uses this value by default.
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <div>
            <Label className="mb-1 block text-xs">Default gap (days)</Label>
            <Input
              type="number"
              min={1}
              value={globalDefault}
              onChange={(e) => setGlobalDefault(e.target.value)}
            />
          </div>
          <Button onClick={saveGlobal} disabled={savingId === GLOBAL_ID}>
            {savingId === GLOBAL_ID ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b p-3 text-sm font-semibold">Per-Service Interval Overrides</div>
        <div className="divide-y">
          {(services ?? []).map((s) => {
            const current = ruleFor(s.id);
            const value = edits[s.id] ?? (current ? String(current.custom_gap_days) : "");
            return (
              <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.category || "—"}
                    {current ? ` · custom ${current.custom_gap_days}d` : ` · using default ${globalDefault}d`}
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  placeholder={globalDefault}
                  value={value}
                  onChange={(e) => setEdits((p) => ({ ...p, [s.id]: e.target.value }))}
                  className="h-9"
                />
                <Button size="sm" variant="outline" onClick={() => saveService(s)} disabled={savingId === s.id}>
                  {savingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set"}
                </Button>
              </div>
            );
          })}
          {(services ?? []).length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No services configured yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
