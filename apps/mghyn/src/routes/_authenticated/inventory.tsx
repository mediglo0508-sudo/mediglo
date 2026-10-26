import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { MasterTable, type Column } from "@/components/MasterTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRealtimeSync } from "@/lib/realtime";
import { Syringe, Package, Boxes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — MGHYN Clinic ERP" },
      { name: "description", content: "Product stock, FIFO batches and inventory ledger movements." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Inventory — MGHYN Clinic ERP" },
      { property: "og:description", content: "Product stock, FIFO batches and inventory ledger movements." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/inventory" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/inventory" }],
  }),
  component: InventoryPage,
});


// Unified master inventory — ONE table, segregated by `category`.
const columns: Column[] = [
  { key: "name", label: "Item Name" },
  { key: "stock", label: "Stock", type: "number", width: "90px" },
  { key: "rate", label: "Rate (₹)", type: "number", width: "110px" },
  { key: "expiry_date", label: "Expiry", width: "100px" },
  { key: "batch_no", label: "Batch No.", width: "130px" },
];

function InventoryPage() {
  // Live stock: any POS sale or floor consumption pushes straight into this table.
  useRealtimeSync(
    ["inventory", "inventory_batches", "inventory_ledger"],
    ["inventory_Retail", "inventory_Injectable", "inventory_In-house"],
  );
  return (

    <div>
      <PageHeader
        title="Master Inventory"
        subtitle="One unified inventory table. Filter by category: Retail · Injectable · In-house."
      />
      <Tabs defaultValue="Retail">
        <TabsList className="mb-4">
          <TabsTrigger value="Retail"><Package className="mr-2 h-4 w-4" /> Retail</TabsTrigger>
          <TabsTrigger value="Injectable"><Syringe className="mr-2 h-4 w-4" /> Injectable</TabsTrigger>
          <TabsTrigger value="In-house"><Boxes className="mr-2 h-4 w-4" /> In-house</TabsTrigger>
        </TabsList>

        {(["Retail", "Injectable", "In-house"] as const).map((cat) => (
          <TabsContent key={cat} value={cat}>
            <MasterTable
              table="inventory"
              queryKey={`inventory_${cat}`}
              orderBy="name"
              searchKeys={["name", "batch_no"]}
              filterEq={{ key: "category", value: cat }}
              columns={columns}
              newRow={() => ({ category: cat, name: "New Item", stock: 0, rate: 0, expiry_date: null, batch_no: null })}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
