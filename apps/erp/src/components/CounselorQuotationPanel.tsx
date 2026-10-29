// ============================================================================
// Counselor pricing worksheet: turns the doctor's recommendation into a priced,
// discountable, printable quotation. Feeds Reception through the existing queue.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Autocomplete } from "@/components/ui/autocomplete";
import { useServiceCatalog, useProductCatalog, serviceOptions, productOptions } from "@/lib/catalog";
import { computeTax, inr2, round2 } from "@/lib/gst";
import { fmtDate } from "@/lib/date-format";
import { printQuotation } from "@/lib/print-layout";
import {
  getVisitWorkflow,
  saveQuotation,
  setQuotationStatus,
} from "@/lib/clinical-workflow.functions";
import type { QuotationItem } from "@/lib/clinical-workflow.functions";
import { IndianRupee, Printer, Save, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

interface Row extends QuotationItem {}

function lineFinal(r: Row) {
  return round2(Math.max(0, r.quoted_price * r.quantity - r.discount_amount));
}

export interface QuotationSnapshot {
  quotation_id: string | null;
  prescription_id: string | null;
  items: { kind: "service" | "product"; name: string; rate: number; qty: number; line_total: number }[];
  net_total: number;
}

export function CounselorQuotationPanel({
  visitId,
  customerName,
  onSnapshot,
}: {
  visitId: string;
  customerName: string;
  /** Latest priced state, so the parent can carry it into the billing hand-off. */
  onSnapshot?: (s: QuotationSnapshot) => void;
}) {
  const qc = useQueryClient();
  const { data: services } = useServiceCatalog();
  const { data: products } = useProductCatalog();
  const loadFn = useServerFn(getVisitWorkflow);
  const saveFn = useServerFn(saveQuotation);
  const statusFn = useServerFn(setQuotationStatus);

  const [rows, setRows] = useState<Row[]>([]);
  const [overallDiscount, setOverallDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const hydrated = useRef(false);

  const { data: wf } = useQuery({
    queryKey: ["visit-workflow", visitId],
    queryFn: () => loadFn({ data: { visit_id: visitId } }),
  });

  // Hydrate from an existing quotation if there is one, otherwise from the
  // doctor's recommendation at the doctor's suggested prices.
  useEffect(() => {
    if (!wf || hydrated.current) return;
    hydrated.current = true;
    const quote = wf.quotation;
    if (quote && Array.isArray(quote.items_json) && quote.items_json.length) {
      setRows(quote.items_json as unknown as Row[]);
      setOverallDiscount(Number(quote.discount_amount ?? 0) ? String(quote.discount_amount) : "");
      setDiscountReason(quote.discount_reason ?? "");
      return;
    }
    setRows(
      (wf.items ?? []).map((i) => {
        const qty = i.item_type === "service" ? Number(i.sessions ?? 1) : Number(i.quantity ?? 1);
        const price = Number(i.suggested_price ?? 0);
        return {
          id: crypto.randomUUID(),
          item_type: i.item_type === "product" ? "product" : "service",
          service_id: i.service_id,
          inventory_id: i.inventory_id,
          name: i.name,
          quantity: qty,
          doctor_suggested_price: price,
          quoted_price: price,
          discount_amount: 0,
          final_amount: round2(price * qty),
          notes: i.notes,
        } satisfies Row;
      }),
    );
  }, [wf]);

  const subtotal = round2(rows.reduce((s, r) => s + lineFinal(r), 0));
  const overall = Math.min(Math.max(0, Number(overallDiscount || 0)), subtotal);
  const net = round2(subtotal - overall);
  const tax = computeTax(net, "inclusive");
  const quotation = wf?.quotation ?? null;
  const closed = quotation?.status === "converted_to_invoice" || quotation?.status === "rejected";

  useEffect(() => {
    onSnapshot?.({
      quotation_id: quotation?.id ?? null,
      prescription_id: wf?.prescription?.id ?? null,
      net_total: net,
      items: rows.map((r) => ({
        kind: r.item_type,
        name: r.name,
        rate: r.quantity > 0 ? round2(lineFinal(r) / r.quantity) : r.quoted_price,
        qty: r.quantity,
        line_total: lineFinal(r),
      })),
    });
  }, [rows, net, quotation?.id, wf?.prescription?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, final_amount: lineFinal({ ...r, ...patch }) } : r)));
  }

  function addService(id: string) {
    const s = (services ?? []).find((x) => x.id === id);
    if (!s) return;
    const price = Number(s.default_price ?? 0);
    setRows((rs) => [...rs, {
      id: crypto.randomUUID(), item_type: "service", service_id: s.id, name: s.name,
      quantity: 1, doctor_suggested_price: 0, quoted_price: price, discount_amount: 0, final_amount: price,
    }]);
  }

  function addProduct(id: string) {
    const p = (products ?? []).find((x) => x.id === id);
    if (!p) return;
    const price = Number(p.sale_price ?? 0);
    setRows((rs) => [...rs, {
      id: crypto.randomUUID(), item_type: "product", inventory_id: p.id, name: p.name,
      quantity: 1, doctor_suggested_price: 0, quoted_price: price, discount_amount: 0, final_amount: price,
    }]);
  }

  const save = useMutation({
    mutationFn: (finalize: boolean) => {
      const onlyProducts = rows.length > 0 && rows.every((r) => r.item_type === "product");
      const onlyServices = rows.length > 0 && rows.every((r) => r.item_type === "service");
      return saveFn({
        data: {
          visit_id: visitId,
          customer_name: customerName,
          prescription_id: wf?.prescription?.id ?? null,
          items: rows.map((r) => ({ ...r, final_amount: lineFinal(r) })),
          subtotal,
          discount_amount: overall,
          discount_reason: discountReason || null,
          cgst: tax.cgst,
          sgst: tax.sgst,
          net_total: net,
          transaction_type: onlyProducts ? "products_only" : onlyServices ? "treatment" : "treatment_and_products",
          finalize,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit-workflow", visitId] }),
  });

  async function persist(finalize: boolean) {
    if (!rows.length) return toast.error("Add at least one treatment or product first.");
    try {
      const res = await save.mutateAsync(finalize);
      toast.success(finalize ? `Quotation ${res.quotation_number ?? ""} issued — valid 7 days` : "Quotation saved as draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the quotation");
    }
  }

  async function decide(status: "accepted" | "rejected") {
    if (!quotation?.id) return toast.error("Issue the quotation first.");
    try {
      await statusFn({ data: { quotation_id: quotation.id, status } });
      qc.invalidateQueries({ queryKey: ["visit-workflow", visitId] });
      toast.success(status === "accepted" ? "Marked accepted — Reception will see the priced plan" : "Marked rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the quotation");
    }
  }

  function print() {
    printQuotation({
      quotation_no: quotation?.quotation_number ?? "DRAFT",
      patient_name: customerName,
      date: new Date().toISOString().slice(0, 10),
      valid_till: quotation?.expires_at
        ? String(quotation.expires_at).slice(0, 10)
        : new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      items: rows.map((r) => ({
        name: r.name,
        kind: r.item_type,
        quantity: r.quantity,
        unit_price: r.quoted_price,
        discount: r.discount_amount,
        amount: lineFinal(r),
      })),
      subtotal,
      discount_amount: overall,
      discount_reason: discountReason,
      cgst: tax.cgst,
      sgst: tax.sgst,
      net_total: net,
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <IndianRupee className="h-3.5 w-3.5" /> Pricing &amp; Quotation
        {quotation?.quotation_number && <Badge variant="secondary">{quotation.quotation_number}</Badge>}
        {quotation?.status && <Badge variant="outline">{quotation.status.replace(/_/g, " ")}</Badge>}
        {quotation?.expires_at && <span className="font-normal normal-case text-muted-foreground">valid till {fmtDate(String(quotation.expires_at).slice(0, 10))}</span>}
      </p>

      {wf?.prescription && (
        <p className="mb-2 rounded bg-background/70 px-2 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Doctor:</span> {wf.prescription.diagnosis || "—"}
          {wf.prescription.instructions ? ` · ${wf.prescription.instructions}` : ""}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Add Treatment</Label>
          <Autocomplete options={serviceOptions(services ?? [])} placeholder="Search treatments…" searchPlaceholder="Type…" emptyText="No match." onSelect={(o) => addService(o.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Add Product</Label>
          <Autocomplete options={productOptions(products ?? [])} placeholder="Search products…" searchPlaceholder="Type…" emptyText="No match." onSelect={(o) => addProduct(o.value)} />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-2 space-y-1 rounded-lg border bg-background p-2">
          <div className="grid grid-cols-[1fr_5rem_3.5rem_5rem_5rem_1.75rem] gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Item</span><span>Price</span><span>Qty</span><span>Discount</span><span className="text-right">Amount</span><span />
          </div>
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_5rem_3.5rem_5rem_5rem_1.75rem] items-center gap-1 text-xs">
              <span className="truncate">
                <Badge variant="secondary" className="mr-1">{r.item_type === "service" ? "Svc" : "Prod"}</Badge>
                {r.name}
                {r.doctor_suggested_price > 0 && r.doctor_suggested_price !== r.quoted_price && (
                  <span className="ml-1 text-[10px] text-muted-foreground line-through">{inr2(r.doctor_suggested_price)}</span>
                )}
              </span>
              <NumberInput className="h-8" value={r.quoted_price} onValueChange={(v) => update(r.id, { quoted_price: v })} min={0} />
              <NumberInput className="h-8" value={r.quantity} onValueChange={(v) => update(r.id, { quantity: v })} min={1} />
              <NumberInput className="h-8" value={r.discount_amount} onValueChange={(v) => update(r.id, { discount_amount: v })} min={0} />
              <span className="text-right font-medium">{inr2(lineFinal(r))}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>×</Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Overall discount (₹)</Label>
          <Input type="number" value={overallDiscount} onChange={(e) => setOverallDiscount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Discount reason</Label>
          <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Why this discount…" />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr2(subtotal)}</span></div>
          {overall > 0 && <div className="flex justify-between text-destructive"><span>Overall discount</span><span>- {inr2(overall)}</span></div>}
          <div className="flex justify-between"><span>Taxable base</span><span>{inr2(tax.base)}</span></div>
          <div className="flex justify-between"><span>GST 5% (incl.)</span><span>{inr2(tax.tax)}</span></div>
          <div className="flex justify-between font-semibold"><span>Net payable</span><span>{inr2(net)}</span></div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => persist(false)} disabled={save.isPending || closed}>
          <Save className="mr-1 h-4 w-4" /> Save Draft
        </Button>
        <Button size="sm" onClick={() => persist(true)} disabled={save.isPending || closed}>Issue Quotation</Button>
        <Button size="sm" variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> Print</Button>
        <Button size="sm" variant="secondary" onClick={() => decide("accepted")} disabled={closed}><ThumbsUp className="mr-1 h-4 w-4" /> Accepted</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => decide("rejected")} disabled={closed}><ThumbsDown className="mr-1 h-4 w-4" /> Rejected</Button>
      </div>
    </div>
  );
}
