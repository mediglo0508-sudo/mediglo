import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr2, round2 } from "@/lib/gst";
import { invalidateInventory } from "@/lib/inventory-stock";
import { useRealtimeSync } from "@/lib/realtime";
import { toast } from "sonner";
import { Loader2, ShoppingBag, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — MGHYN Clinic ERP" },
      { name: "description", content: "Vendor purchase entries and stock inward records." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Purchases — MGHYN Clinic ERP" },
      { property: "og:description", content: "Vendor purchase entries and stock inward records." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/purchases" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/purchases" }],
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const { isFinance } = useAuth();
  const qc = useQueryClient();
  const [vendor, setVendor] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [product, setProduct] = useState("");
  const [rate, setRate] = useState("");
  const [gstPct, setGstPct] = useState("5");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hsn, setHsn] = useState("");
  const [billNo, setBillNo] = useState("");
  const [payStatus, setPayStatus] = useState("Pending");
  const [saving, setSaving] = useState(false);

  useRealtimeSync(["purchases", "inventory"], ["purchases-list", "inventory-purchases"]);
  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => (await supabase.from("vendors").select("*").order("name")).data ?? [],
  });
  const { data: inventoryItems } = useQuery({
    queryKey: ["inventory-purchases"],
    queryFn: async () =>
      (await supabase.from("inventory").select("id, name, stock, rate, company").eq("active", true).order("name")).data ?? [],
  });
  const { data: purchases, refetch } = useQuery({
    queryKey: ["purchases-list"],
    queryFn: async () => (await supabase.from("purchases").select("*").order("purchase_date", { ascending: false }).limit(50)).data ?? [],
  });

  // Auto-suggest vendor after typing first 2 letters
  const matches = useMemo(() => {
    const q = vendor.trim().toLowerCase();
    if (q.length < 2) return [];
    return (vendors ?? []).filter((v) => v.name.toLowerCase().startsWith(q)).slice(0, 5);
  }, [vendor, vendors]);

  // Auto-suggest product after typing first 2 letters
  const productMatches = useMemo(() => {
    const q = product.trim().toLowerCase();
    if (q.length < 2) return [];
    const exact = (inventoryItems ?? []).some((i) => i.name.toLowerCase() === q);
    if (exact) return [];
    return (inventoryItems ?? []).filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6);
  }, [product, inventoryItems]);

  function pickVendor(v: { name: string; gstin: string | null; address: string | null; phone: string | null }) {
    setVendor(v.name); setGstin(v.gstin ?? ""); setAddress(v.address ?? ""); setVendorPhone(v.phone ?? "");
  }

  function pickProduct(item: { name: string; rate: number }) {
    setProduct(item.name);
    if (!rate && item.rate > 0) setRate(String(item.rate));
  }

  async function save() {
    if (!vendor.trim()) return toast.error("Enter company/vendor name");
    if (!product.trim()) return toast.error("Enter product name");
    const numericQty = Number(qty || 1);
    if (numericQty <= 0) return toast.error("Quantity must be greater than 0");

    setSaving(true);
    try {
      // 1. Upsert vendor profile (auto-save core)
      let vendorId: string | null = null;
      const existing = (vendors ?? []).find((v) => v.name.toLowerCase() === vendor.trim().toLowerCase());
      if (existing) {
        vendorId = existing.id;
        await supabase.from("vendors").update({ gstin: gstin || null, address: address || null, phone: vendorPhone || null }).eq("id", existing.id);
      } else {
        const { data } = await supabase.from("vendors").insert({ name: vendor.trim(), gstin: gstin || null, address: address || null, phone: vendorPhone || null }).select("id").single();
        vendorId = data?.id ?? null;
      }

      // 2. Insert purchase bill row
      const { error } = await supabase.from("purchases").insert({
        vendor_id: vendorId, company_name: vendor.trim(), product_name: product.trim(),
        purchase_rate: Number(rate || 0), gst_pct: Number(gstPct || 0), quantity: numericQty,
        purchase_date: date, payment_status: payStatus, bill_no: billNo || null, hsn_code: hsn || null,
      });
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }

      // 3. Automated stock-in addition + audited inventory_ledger entry
      let invId: string | null =
        (inventoryItems ?? []).find((i) => i.name.trim().toLowerCase() === product.trim().toLowerCase())?.id ?? null;
      if (!invId) {
        const { data: createdInv } = await supabase
          .from("inventory")
          .insert({
            name: product.trim(),
            company: vendor.trim(),
            rate: Number(rate || 0),
            stock: 0,
            category: "Retail",
            active: true,
          })
          .select("id")
          .single();
        invId = createdInv?.id ?? null;
      }

      if (invId) {
        const note = `Purchase Bill ${billNo || "Direct"} · ${vendor.trim()}`;
        const { error: restockErr } = await supabase.rpc("restock_inventory", {
          p_items: [{ inventory_id: invId, qty: numericQty }],
          p_movement_type: "Purchase Inward",
          p_source: "Smart Purchase",
          p_note: note,
        });
        if (restockErr) {
          console.warn("[purchases] restock_inventory warning:", restockErr.message);
        }
        invalidateInventory(qc);
      }

      toast.success("Purchase saved · stock & ledger updated");
      setProduct(""); setRate(""); setQty("1"); setBillNo("");
      refetch();
    } finally {
      setSaving(false);
    }
  }

  if (!isFinance) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Smart Purchase & Vendors" subtitle="Vendor auto-fill · automated stock-in addition · purchase ledger" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="h-4 w-4" /> New Purchase Entry</h3>
          <div className="space-y-3">
            <div className="relative space-y-1.5">
              <Label>Company / Vendor Name</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Type 2 letters to auto-fill" />
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow">
                  {matches.map((m) => (
                    <button key={m.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => pickVendor(m)}>{m.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>GSTIN <span className="text-muted-foreground">(optional)</span></Label><Input value={gstin} onChange={(e) => setGstin(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="relative space-y-1.5">
              <Label>Product Name</Label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Search or enter product name" />
              {productMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow">
                  {productMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => pickProduct(m)}
                    >
                      <span>{m.name}</span>
                      <span className="text-xs text-muted-foreground">Stock: {m.stock} · {inr2(Number(m.rate))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5"><Label>Rate ₹</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>GST %</Label><Input type="number" value={gstPct} onChange={(e) => setGstPct(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Qty</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>HSN/SAC <span className="text-muted-foreground">(optional)</span></Label><Input value={hsn} onChange={(e) => setHsn(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Bill No <span className="text-muted-foreground">(optional)</span></Label><Input value={billNo} onChange={(e) => setBillNo(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Payment Status</Label>
                <Select value={payStatus} onValueChange={setPayStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Purchase & Restock
            </Button>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Recent Purchases</h3>
          <div className="space-y-2">
            {(purchases ?? []).map((p) => {
              const total = round2(Number(p.purchase_rate) * Number(p.quantity) * (1 + Number(p.gst_pct) / 100));
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.product_name} <span className="text-muted-foreground">· {p.company_name}</span></p>
                    <p className="text-xs text-muted-foreground">{p.purchase_date} · {p.quantity} × {inr2(Number(p.purchase_rate))} · GST {p.gst_pct}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{inr2(total)}</span>
                    <Badge variant={p.payment_status === "Paid" ? "default" : "secondary"}>{p.payment_status}</Badge>
                  </div>
                </div>
              );
            })}
            {(purchases ?? []).length === 0 && <p className="text-sm text-muted-foreground">No purchases logged yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
