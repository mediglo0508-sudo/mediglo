import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { MasterTable, type Column } from "@/components/MasterTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRealtimeSync } from "@/lib/realtime";
import { inr2 } from "@/lib/gst";
import { Syringe, Package, Boxes, ClipboardList, ArrowDownUp, AlertTriangle, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Master Inventory & Dual-Stream Ledger — MediGlo Harmony ERP" },
      { name: "description", content: "Product stock, Services Master, FIFO batches, Dual-Stream Ledger (Retail vs Clinical), and Expiry Alerts." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InventoryPage,
});

const productColumns: Column[] = [
  { key: "name", label: "Item Name" },
  { key: "sku", label: "SKU", width: "120px" },
  { key: "stock", label: "Stock", type: "number", width: "90px" },
  { key: "rate", label: "Cost / Rate (₹)", type: "number", width: "120px" },
  { key: "expiry_date", label: "Expiry", width: "110px" },
  { key: "batch_no", label: "Batch No.", width: "120px" },
];

const serviceColumns: Column[] = [
  { key: "category", label: "Category", width: "180px" },
  { key: "name", label: "Service / Treatment Name" },
  { key: "sac_code", label: "SAC", width: "95px" },
  { key: "gst_rate", label: "GST %", type: "number", width: "80px" },
  { key: "default_price", label: "Sale Price (₹)", type: "number", width: "120px" },
  { key: "cost_estimate", label: "Prod. Cost (₹)", type: "number", width: "120px" },
  { key: "duration_minutes", label: "Duration (m)", type: "number", width: "100px" },
];

function InventoryPage() {
  useRealtimeSync(
    ["inventory", "inventory_batches", "inventory_ledger", "service_consumption", "services_master"],
    ["inventory_Retail", "inventory_Injectable", "inventory_In-house", "services_master", "dual_stream_ledger", "inventory_alerts"],
  );

  const { data: alerts } = useQuery({
    queryKey: ["inventory_alerts"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory").select("*").eq("active", true).order("stock", { ascending: true });
      const items = data ?? [];
      const lowStock = items.filter((i) => Number(i.stock) <= 10);
      const now = Date.now();
      const day90 = 90 * 24 * 3600 * 1000;
      const nearExpiry = items.filter((i) => {
        if (!i.expiry_date) return false;
        const exp = new Date(i.expiry_date).getTime();
        return !Number.isNaN(exp) && exp - now <= day90;
      });
      return { lowStock, nearExpiry, totalItems: items.length };
    },
  });

  const { data: dualLedger } = useQuery({
    queryKey: ["dual_stream_ledger"],
    queryFn: async () => {
      const [{ data: ledg }, { data: cons }] = await Promise.all([
        supabase.from("inventory_ledger").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("service_consumption").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      const rows = ledg ?? [];
      const streamA = rows.filter((r: any) =>
        String(r.reason ?? r.movement_type ?? "").toLowerCase().includes("sale") ||
        String(r.reason ?? r.movement_type ?? "").toLowerCase().includes("pos") ||
        String(r.reason ?? r.movement_type ?? "").toLowerCase().includes("dispens")
      );
      const streamB = rows.filter((r: any) =>
        String(r.reason ?? r.movement_type ?? "").toLowerCase().includes("consum") ||
        String(r.reason ?? r.movement_type ?? "").toLowerCase().includes("duty") ||
        String(r.reason ?? r.movement_type ?? "").toLowerCase().includes("treatment")
      );
      return { all: rows, streamA, streamB, serviceConsumptions: cons ?? [] };
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Master Inventory, Services & Dual-Stream Stock Ledger"
        subtitle="Manage Retail, Injectable & In-house stock, Services Master (235+ treatments), Dual-Stream Ledger (Stream A Retail vs Stream B Clinical), and Expiry Alerts."
      />

      {/* Alert Summary Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center justify-between p-3.5">
          <div>
            <p className="text-xs text-muted-foreground">Active Inventory SKUs</p>
            <p className="text-xl font-bold">{alerts?.totalItems ?? 0}</p>
          </div>
          <Boxes className="h-6 w-6 text-primary" />
        </Card>
        <Card className="flex items-center justify-between border-amber-500/30 bg-amber-500/5 p-3.5">
          <div>
            <p className="text-xs font-medium text-amber-800">Low Stock Alerts (≤ 10 units)</p>
            <p className="text-xl font-bold text-amber-900">{alerts?.lowStock.length ?? 0} Items</p>
          </div>
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </Card>
        <Card className="flex items-center justify-between border-rose-500/30 bg-rose-500/5 p-3.5">
          <div>
            <p className="text-xs font-medium text-rose-800">Near-Expiry Batches (30/60/90d)</p>
            <p className="text-xl font-bold text-rose-900">{alerts?.nearExpiry.length ?? 0} Batches</p>
          </div>
          <CalendarClock className="h-6 w-6 text-rose-600" />
        </Card>
      </div>

      <Tabs defaultValue="Retail">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="Retail"><Package className="mr-1.5 h-4 w-4" /> Retail Products</TabsTrigger>
          <TabsTrigger value="Injectable"><Syringe className="mr-1.5 h-4 w-4" /> Injectables</TabsTrigger>
          <TabsTrigger value="In-house"><Boxes className="mr-1.5 h-4 w-4" /> In-House Consumables</TabsTrigger>
          <TabsTrigger value="Services"><ClipboardList className="mr-1.5 h-4 w-4" /> Services Master (235+)</TabsTrigger>
          <TabsTrigger value="DualLedger"><ArrowDownUp className="mr-1.5 h-4 w-4" /> Dual-Stream Ledger (A vs B)</TabsTrigger>
        </TabsList>

        {(["Retail", "Injectable", "In-house"] as const).map((cat) => (
          <TabsContent key={cat} value={cat}>
            <MasterTable
              table="inventory"
              queryKey={`inventory_${cat}`}
              orderBy="name"
              searchKeys={["name", "batch_no", "sku"]}
              filterEq={{ key: "category", value: cat }}
              columns={productColumns}
              newRow={() => ({ category: cat, name: "New Item", sku: `SKU-${Date.now().toString().slice(-4)}`, stock: 0, rate: 0, expiry_date: null, batch_no: null })}
            />
          </TabsContent>
        ))}

        <TabsContent value="Services">
          <MasterTable
            table="services_master"
            queryKey="services_master"
            orderBy="category"
            searchKeys={["name", "category", "sac_code"]}
            columns={serviceColumns}
            newRow={() => ({
              category: "Medi Facial",
              name: "New Clinic Service",
              sac_code: "999312",
              gst_rate: 5,
              default_price: 5000,
              cost_estimate: 750,
              duration_minutes: 45,
            })}
          />
        </TabsContent>

        <TabsContent value="DualLedger">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Stream A */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Stream A — Retail / Pharmacy Sales</h3>
                  <p className="text-xs text-muted-foreground">Items sold directly to patients via POS or Pharmacy counter</p>
                </div>
                <Badge variant="secondary">{dualLedger?.streamA.length ?? 0} Movements</Badge>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y text-xs">
                {(dualLedger?.streamA ?? []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold">{r.item_name || r.note || "Retail Sale"}</p>
                      <p className="text-[11px] text-muted-foreground">{r.reason || r.movement_type} · {r.created_at?.slice(0, 10)}</p>
                    </div>
                    <Badge variant="outline">{r.qty_change ?? r.quantity ?? -1} units</Badge>
                  </div>
                ))}
                {(dualLedger?.streamA ?? []).length === 0 && (
                  <p className="py-6 text-center text-muted-foreground">Retail POS movements appear here automatically upon billing.</p>
                )}
              </div>
            </Card>

            {/* Stream B */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Stream B — Internal Clinical Consumption</h3>
                  <p className="text-xs text-muted-foreground">Injectables & Consumables used by Therapists/Doctors during treatments</p>
                </div>
                <Badge className="bg-primary text-primary-foreground">
                  {dualLedger?.serviceConsumptions.length ?? 0} Costed Sessions
                </Badge>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y text-xs">
                {(dualLedger?.serviceConsumptions ?? []).slice(0, 50).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold text-foreground">{c.service_name || "Treatment Session"}</p>
                      <p className="text-[11px] text-muted-foreground">{c.item_name} · Qty: {c.qty_used} × ₹{inr2(Number(c.unit_cost))}</p>
                    </div>
                    <span className="font-mono font-bold text-rose-700">-₹{inr2(Number(c.total_cost))}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
