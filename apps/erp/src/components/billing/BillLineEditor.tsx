import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useServices, useProducts } from "@/hooks/useQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Printer, Save } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import type { PaymentMode } from "@/types/domain";

export interface CartLine {
  /** Existing invoice_lines.id when editing a line that already exists; undefined for a new line. */
  id?: string;
  item_type: "service" | "product";
  service_id?: string | null;
  product_id?: string | null;
  inventory_id?: string | null;
  name: string;
  quantity: number;
  rate: number;
  discount_amount: number;
  staff_id?: string | null;
  /** GST% resolved from the selected service/product at add-time - used only
   * to preview an accurate total here. edit_invoice() re-resolves the real
   * rate live from services_master/inventory at save time, which is
   * authoritative; this just keeps the preview from silently assuming a flat
   * 5% when a mixed-rate bill (e.g. an 18%-rated product alongside a 5%
   * service) would actually total differently. */
  gst_rate?: number;
}

interface Props {
  customerLabel: string;
  lines: CartLine[];
  onLinesChange: (lines: CartLine[]) => void;
  discountAmount: number;
  onDiscountAmountChange: (v: number) => void;
  gstMode: "inclusive" | "exclusive";
  onGstModeChange: (v: "inclusive" | "exclusive") => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (v: PaymentMode) => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
  readOnlyCustomer?: boolean;
}

export function BillLineEditor({
  customerLabel,
  lines,
  onLinesChange,
  discountAmount,
  onDiscountAmountChange,
  gstMode,
  onGstModeChange,
  paymentMode,
  onPaymentModeChange,
  onSave,
  saving,
  saveLabel = "Create Invoice",
}: Props) {
  const { data: services } = useServices();
  const { data: products } = useProducts();

  function addLine(type: "service" | "product") {
    onLinesChange([...lines, { item_type: type, name: "", quantity: 1, rate: 0, discount_amount: 0 }]);
  }

  function updateLine(idx: number, patch: Partial<CartLine>) {
    onLinesChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    onLinesChange(lines.filter((_, i) => i !== idx));
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.rate - l.discount_amount, 0), [lines]);

  // Per-line GST preview - see the CartLine.gst_rate comment. Mirrors
  // edit_invoice()'s own math (proportional discount distribution, per-line
  // rate) so this preview matches what actually gets saved for the common
  // case where the selected items' rates haven't changed since they were
  // added to this cart.
  const gstPreview = useMemo(() => {
    let gst = 0;
    for (const l of lines) {
      const lineAmount = l.quantity * l.rate - l.discount_amount;
      const discountShare = subtotal > 0 ? (lineAmount / subtotal) * discountAmount : 0;
      const net = lineAmount - discountShare;
      const rate = (l.gst_rate ?? 5) / 100;
      gst += gstMode === "inclusive" ? net - net / (1 + rate) : net * rate;
    }
    const base = Math.max(0, subtotal - discountAmount);
    const total = gstMode === "inclusive" ? base : base + gst;
    return { cgst: gst / 2, sgst: gst / 2, total };
  }, [lines, subtotal, discountAmount, gstMode]);

  const hasIncompleteLine = lines.some((l) => !l.name.trim());

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/40 p-3 text-sm font-medium">{customerLabel}</div>

      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => addLine("service")}>
          <Plus className="mr-1 h-3 w-3" /> Add Service
        </Button>
        <Button size="sm" variant="secondary" onClick={() => addLine("product")}>
          <Plus className="mr-1 h-3 w-3" /> Add Product
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="w-20 text-right">Qty</TableHead>
            <TableHead className="w-28 text-right">Rate</TableHead>
            <TableHead className="w-28 text-right">Line discount</TableHead>
            <TableHead className="w-28 text-right">Amount</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No items yet. Add a service or product above.
              </TableCell>
            </TableRow>
          )}
          {lines.map((line, idx) => (
            <TableRow key={line.id ?? idx}>
              <TableCell className="min-w-[220px]">
                <Select
                  value={line.item_type === "service" ? line.service_id ?? "" : line.product_id ?? ""}
                  onValueChange={(val) => {
                    const list = line.item_type === "service" ? services : products;
                    const found = list?.find((s: any) => s.id === val);
                    updateLine(idx, {
                      ...(line.item_type === "service" ? { service_id: val } : { product_id: val, inventory_id: val }),
                      name: found?.name ?? "",
                      rate: (found as any)?.default_price ?? (found as any)?.sale_price ?? 0,
                      gst_rate: (found as any)?.gst_rate ?? 5,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={line.name || `Select ${line.item_type}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(line.item_type === "service" ? services : products)?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={1}
                  className="text-right"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  className="text-right"
                  value={line.rate}
                  onChange={(e) => updateLine(idx, { rate: Math.max(0, Number(e.target.value) || 0) })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  className="text-right"
                  value={line.discount_amount}
                  onChange={(e) => updateLine(idx, { discount_amount: Math.max(0, Number(e.target.value) || 0) })}
                />
              </TableCell>
              <TableCell className="text-right font-semibold">{formatINR(line.quantity * line.rate - line.discount_amount)}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => removeLine(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">GST mode</span>
            <div className="flex items-center gap-2 text-sm">
              <span className={cn(gstMode === "exclusive" && "font-semibold")}>Exclusive</span>
              <Switch checked={gstMode === "inclusive"} onCheckedChange={(c) => onGstModeChange(c ? "inclusive" : "exclusive")} />
              <span className={cn(gstMode === "inclusive" && "font-semibold")}>Inclusive</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Overall discount (₹)</label>
            <Input type="number" className="mt-1" value={discountAmount} onChange={(e) => onDiscountAmountChange(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label className="text-sm font-medium">Payment mode</label>
            <Select value={paymentMode} onValueChange={(v) => onPaymentModeChange(v as PaymentMode)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="netbanking">Net Banking</SelectItem>
                <SelectItem value="split">Split</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 rounded-md bg-muted/40 p-4">
          <Row label="Subtotal" value={formatINR(subtotal)} />
          <Row label="Overall discount" value={`-${formatINR(discountAmount)}`} />
          <Row label="CGST" value={formatINR(gstPreview.cgst)} />
          <Row label="SGST" value={formatINR(gstPreview.sgst)} />
          <div className="my-2 border-t border-border" />
          <Row label="Grand Total" value={formatINR(gstPreview.total)} big />
          <p className="pt-1 text-[11px] text-muted-foreground">
            GST computed per item at each item's own rate; confirmed exactly at save (and split to IGST automatically for an
            out-of-state customer, once Clinic Settings has your home state configured).
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Print
        </Button>
        <Button className="flex-1" onClick={onSave} disabled={saving || lines.length === 0 || hasIncompleteLine}>
          <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : saveLabel}
        </Button>
        {hasIncompleteLine && <p className="text-xs text-destructive">Select an item for every line before saving.</p>}
      </div>
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={cn("flex justify-between text-sm", big && "text-lg font-bold")}>
      <span className={cn(!big && "text-muted-foreground")}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
