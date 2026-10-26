import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useProducts } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/utils";
import { ShoppingBag, Plus, Trash2, CheckCircle2, History, Building2 } from "lucide-react";

interface PurchaseLine {
  id: string;
  inventory_id?: string;
  product_name: string;
  qty: number;
  rate: number;
  gst_pct: number;
  hsn_code: string;
}

export default function PurchaseBillingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [vendorName, setVendorName] = useState("");
  const [vendorGstin, setVendorGstin] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [billNo, setBillNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [paymentMode, setPaymentMode] = useState<"bank" | "cash">("bank");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: inventoryProducts } = useProducts();

  // Vendors list for auto-fill
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) return [];
      return data ?? [];
    },
  });

  // Recent purchases stream
  const { data: recentPurchases = [], refetch: refetchPurchases } = useQuery({
    queryKey: ["recent_purchases_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .order("purchase_date", { ascending: false })
        .limit(10);
      if (error) return [];
      return data ?? [];
    },
  });

  // Vendor auto-complete matches
  const vendorMatches = useMemo(() => {
    const q = vendorName.trim().toLowerCase();
    if (q.length < 2) return [];
    return vendors.filter((v: any) => v.name?.toLowerCase().includes(q)).slice(0, 5);
  }, [vendorName, vendors]);

  function pickVendor(v: any) {
    setVendorName(v.name);
    setVendorGstin(v.gstin || "");
    setVendorPhone(v.phone || "");
  }

  function addLineFromInventory(inventoryId: string) {
    const prod = inventoryProducts?.find((p) => p.id === inventoryId);
    if (!prod) return;

    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        inventory_id: prod.id,
        product_name: prod.name,
        qty: 1,
        rate: Number(prod.cost_price || 0),
        gst_pct: Number(prod.gst_rate ?? 5),
        hsn_code: "",
      },
    ]);
  }

  function addNewCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        product_name: "",
        qty: 1,
        rate: 0,
        gst_pct: 5,
        hsn_code: "",
      },
    ]);
  }

  function updateLine(id: string, updates: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  // Calculations
  const summary = useMemo(() => {
    let taxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    for (const l of lines) {
      const lineBase = Number(l.qty || 0) * Number(l.rate || 0);
      const taxRate = Number(l.gst_pct || 0);
      const taxAmt = lineBase * (taxRate / 100);
      taxable += lineBase;
      totalCgst += taxAmt / 2;
      totalSgst += taxAmt / 2;
    }

    return {
      taxable,
      cgst: totalCgst,
      sgst: totalSgst,
      gross: taxable + totalCgst + totalSgst,
    };
  }, [lines]);

  async function handleSavePurchase() {
    if (!vendorName.trim()) {
      toast.error("Please enter vendor / supplier name");
      return;
    }
    if (lines.length === 0) {
      toast.error("Please add at least one product line item");
      return;
    }
    for (const l of lines) {
      if (!l.product_name.trim()) {
        toast.error("All line items must have a product name");
        return;
      }
      if (l.qty <= 0) {
        toast.error(`Quantity for ${l.product_name} must be greater than 0`);
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Auto-save or fetch vendor
      let vendorId: string | null = null;
      const existing = vendors.find(
        (v: any) => v.name?.toLowerCase().trim() === vendorName.toLowerCase().trim()
      );
      if (existing) {
        vendorId = existing.id;
        await supabase
          .from("vendors")
          .update({ gstin: vendorGstin || null, phone: vendorPhone || null })
          .eq("id", existing.id);
      } else {
        const { data: newV, error: vErr } = await supabase
          .from("vendors")
          .insert({ name: vendorName.trim(), gstin: vendorGstin || null, phone: vendorPhone || null })
          .select("id")
          .single();
        if (!vErr && newV) vendorId = newV.id;
      }

      // 2. Process each line: record purchase + automatically add stock to inventory + record ledger
      for (const line of lines) {
        let invId = line.inventory_id;

        // If not already matched to an existing inventory item, find or create one
        if (!invId) {
          const matchedProd = inventoryProducts?.find(
            (p) => p.name.toLowerCase().trim() === line.product_name.toLowerCase().trim()
          );
          if (matchedProd) {
            invId = matchedProd.id;
          } else {
            // Auto-create new inventory product
            const { data: newInv, error: invErr } = await supabase
              .from("inventory")
              .insert({
                name: line.product_name.trim(),
                is_service: false,
                unit: "pcs",
                stock_qty: 0,
                cost_price: line.rate,
                sale_price: Math.round(line.rate * 1.3), // 30% default margin
                gst_rate: line.gst_pct,
                active: true,
              })
              .select("id")
              .single();
            if (!invErr && newInv) invId = newInv.id;
          }
        }

        // Record flat purchase row
        await supabase.from("purchases").insert({
          vendor_id: vendorId,
          company_name: vendorName.trim(),
          product_name: line.product_name.trim(),
          purchase_rate: line.rate,
          gst_pct: line.gst_pct,
          quantity: line.qty,
          purchase_date: purchaseDate,
          bill_no: billNo || null,
          hsn_code: line.hsn_code || null,
          payment_status: paymentStatus === "paid" ? "Paid" : "Pending",
        });

        // AUTOMATED INVENTORY ADDITION (STOCK-IN)
        if (invId) {
          const { data: curInv } = await supabase
            .from("inventory")
            .select("stock_qty")
            .eq("id", invId)
            .single();

          const currentStock = Number(curInv?.stock_qty || 0);
          const newStock = currentStock + line.qty;

          await supabase.from("inventory").update({ stock_qty: newStock }).eq("id", invId);

          // Record in inventory_ledger
          await supabase.from("inventory_ledger").insert({
            inventory_id: invId,
            movement_type: "purchase",
            quantity: line.qty,
            reference_type: "purchase_invoice",
            note: `Stock added via Purchase Bill #${billNo || "Direct"} from ${vendorName}`,
          });
        }
      }

      toast.success(
        `Purchase bill recorded! ${lines.length} item(s) automatically added to inventory stock.`
      );

      // Reset
      setLines([]);
      setVendorName("");
      setVendorGstin("");
      setVendorPhone("");
      setBillNo("");

      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
      queryClient.invalidateQueries({ queryKey: ["vendors_all"] });
      refetchPurchases();
    } catch (err: any) {
      toast.error(err.message || "Failed to record purchase billing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" /> Purchase Billing & Vendor Inward
          </h1>
          <p className="text-sm text-muted-foreground">
            Record supplier bills, input GST, and instantly add inbound goods to available inventory stock.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Form */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Vendor & Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="relative space-y-1 sm:col-span-2">
                  <Label>Vendor / Company Name</Label>
                  <Input
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Type supplier name..."
                  />
                  {vendorMatches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md divide-y max-h-40 overflow-y-auto">
                      {vendorMatches.map((v: any) => (
                        <button
                          key={v.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-xs hover:bg-accent flex justify-between"
                          onClick={() => pickVendor(v)}
                        >
                          <span className="font-medium">{v.name}</span>
                          <span className="text-muted-foreground">{v.gstin || v.phone || ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Vendor GSTIN</Label>
                  <Input
                    value={vendorGstin}
                    onChange={(e) => setVendorGstin(e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Supplier Invoice / Bill No</Label>
                  <Input
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value)}
                    placeholder="INV-2026-001"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Payment Status</Label>
                  <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid Immediately</SelectItem>
                      <SelectItem value="pending">Credit / Pending Due</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line items table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Inward Product Line Items</CardTitle>
                <CardDescription>
                  Purchased quantities will automatically increment central stock on save.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Select onValueChange={addLineFromInventory}>
                  <SelectTrigger className="h-8 text-xs w-48">
                    <span>+ From Inventory Catalog</span>
                  </SelectTrigger>
                  <SelectContent>
                    {(inventoryProducts ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (Current: {p.stock_qty})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addNewCustomLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> New Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <div className="border border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
                  No line items added yet. Click "+ From Inventory Catalog" or "+ New Item" above.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20 text-center">Qty</TableHead>
                      <TableHead className="w-24 text-right">Rate (₹)</TableHead>
                      <TableHead className="w-24 text-center">GST %</TableHead>
                      <TableHead className="w-28 text-right">Total (₹)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const lineTax = (line.qty * line.rate * line.gst_pct) / 100;
                      const lineTotal = line.qty * line.rate + lineTax;
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <Input
                              value={line.product_name}
                              onChange={(e) => updateLine(line.id, { product_name: e.target.value })}
                              placeholder="Product name"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })}
                              className="h-8 text-xs text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={line.rate}
                              onChange={(e) => updateLine(line.id, { rate: Number(e.target.value) })}
                              className="h-8 text-xs text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={String(line.gst_pct)}
                              onValueChange={(v) => updateLine(line.id, { gst_pct: Number(v) })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="5">5%</SelectItem>
                                <SelectItem value="12">12%</SelectItem>
                                <SelectItem value="18">18%</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs">
                            {formatINR(lineTotal)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive"
                              onClick={() => removeLine(line.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {/* Totals Breakdown */}
              {lines.length > 0 && (
                <div className="mt-4 border-t pt-4 flex flex-col items-end gap-1 text-xs">
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Taxable Value:</span>
                    <span className="font-medium">{formatINR(summary.taxable)}</span>
                  </div>
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Output CGST:</span>
                    <span className="font-medium">{formatINR(summary.cgst)}</span>
                  </div>
                  <div className="flex justify-between w-64">
                    <span className="text-muted-foreground">Output SGST:</span>
                    <span className="font-medium">{formatINR(summary.sgst)}</span>
                  </div>
                  <div className="flex justify-between w-64 border-t pt-1 font-bold text-sm">
                    <span>Gross Invoice Total:</span>
                    <span className="text-primary">{formatINR(summary.gross)}</span>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  size="default"
                  disabled={saving || lines.length === 0 || !vendorName.trim()}
                  onClick={handleSavePurchase}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "Posting Purchase & Adding Stock..." : "Record Inward & Add Stock"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Recent purchases */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Inward Purchase History
              </CardTitle>
              <CardDescription>Recent vendor procurement records</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentPurchases.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">No purchases recorded yet.</div>
              ) : (
                recentPurchases.map((p: any) => (
                  <div key={p.id} className="border-b pb-2 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>{p.company_name || "Vendor"}</span>
                      <span className="font-semibold text-primary">{formatINR(Number(p.purchase_rate) * Number(p.quantity))}</span>
                    </div>
                    <div className="text-muted-foreground flex justify-between">
                      <span>{p.product_name} ({p.quantity} qty)</span>
                      <Badge variant={p.payment_status === "Paid" ? "secondary" : "destructive"} className="text-[10px] h-4">
                        {p.payment_status}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">{p.purchase_date} {p.bill_no ? `· Bill #${p.bill_no}` : ""}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
