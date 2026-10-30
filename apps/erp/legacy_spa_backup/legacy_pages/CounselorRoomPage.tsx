import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useServices, useProducts } from "@/hooks/useQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, cn } from "@/lib/utils";
import type { QuotationItem, TransactionType } from "@/types/domain";
import { Printer, Check } from "lucide-react";

interface PendingPrescription {
  id: string;
  customer_id: string;
  encounter_id: string;
  diagnosis: string | null;
  clinical_notes: string | null;
  customers: { name: string; phone: string } | null;
}

const TRANSACTION_TYPES: { value: TransactionType; label: string; icon: string }[] = [
  { value: "treatment_and_products", label: "Treatment & Products", icon: "🎯" },
  { value: "treatment", label: "Treatment Only", icon: "💉" },
  { value: "products_only", label: "Products Only", icon: "🛍️" },
  { value: "billing_only", label: "Billing Only", icon: "💳" },
];

export default function CounselorRoomPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: services } = useServices();
  const { data: products } = useProducts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("treatment_and_products");
  const [saving, setSaving] = useState(false);

  const { data: queue } = useQuery({
    queryKey: ["counselor_queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_prescriptions")
        .select("id, customer_id, encounter_id, diagnosis, clinical_notes, customers(name, phone)")
        .eq("sent_to_counselor_id", user!.id)
        .eq("status", "sent_to_counselor")
        .order("sent_to_counselor_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PendingPrescription[];
    },
    refetchInterval: 15_000,
  });

  const selected = (queue ?? []).find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    supabase
      .from("doctor_prescription_items")
      .select("*")
      .eq("prescription_id", selectedId)
      .then(({ data }) => {
        setItems(
          (data ?? []).map((row: any) => {
            const master = row.item_type === "service" ? services?.find((s) => s.id === row.service_id) : products?.find((p) => p.id === row.product_id);
            return {
              id: row.id,
              type: row.item_type,
              service_id: row.service_id,
              product_id: row.product_id,
              name: row.name,
              quantity: row.quantity,
              doctor_suggested_price: row.doctor_suggested_price,
              counselor_quoted_price: row.doctor_suggested_price,
              discount_applied: 0,
              discount_percent: 0,
              final_amount: row.doctor_suggested_price * row.quantity,
              gst_rate: master?.gst_rate ?? 5,
            };
          })
        );
      });
    setDiscountPercent(0);
    setDiscountReason("");
    setTransactionType("treatment_and_products");
  }, [selectedId]);

  function updatePrice(id: string, price: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              counselor_quoted_price: price,
              final_amount: price * i.quantity,
              discount_applied: Math.max(0, i.doctor_suggested_price - price) * i.quantity,
              discount_percent: i.doctor_suggested_price > 0 ? ((i.doctor_suggested_price - price) / i.doctor_suggested_price) * 100 : 0,
            }
          : i
      )
    );
  }

  const subtotal = items.reduce((s, i) => s + i.final_amount, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  // Per-item GST rate (see QuotationItem.gst_rate) rather than a flat 5% -
  // a mixed-rate quotation (e.g. an 18%-rated product alongside a 5%
  // service) previously totalled here differently than what Billing would
  // actually charge once edit_invoice() resolved the real per-line rates,
  // so a printed quotation could quietly disagree with the final invoice.
  const gst = items.reduce((s, i) => {
    const net = i.final_amount * (1 - discountPercent / 100);
    return s + net * ((i.gst_rate ?? 5) / 100);
  }, 0);
  const total = afterDiscount + gst;

  async function handleFinalize() {
    if (!selected || items.length === 0) return;
    setSaving(true);
    try {
      const { data: quoteNo } = await supabase.rpc("generate_quotation_number");

      const { data: quotation, error } = await supabase
        .from("counselor_quotations")
        .insert({
          // BUG FIX: this used to re-derive the encounter by picking the
          // customer's MOST RECENTLY CREATED encounter, not the one this
          // prescription actually belongs to. For a returning customer with
          // a newer encounter already open by the time an older pending
          // prescription in this queue got finalized, the quotation (and
          // everything billed from it) would silently attach to the wrong
          // visit. The prescription already carries its own encounter_id -
          // use that directly.
          encounter_id: selected.encounter_id,
          customer_id: selected.customer_id,
          prescription_id: selected.id,
          counselor_id: user!.id,
          quotation_number: quoteNo,
          items_json: items,
          subtotal,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          discount_reason: discountReason || null,
          cgst: gst / 2,
          sgst: gst / 2,
          net_total: total,
          transaction_type: transactionType,
          status: "sent_to_patient",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          finalized_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      const { error: finalizeErr } = await supabase
        .from("doctor_prescriptions")
        .update({ status: "finalized", finalized_at: new Date().toISOString() })
        .eq("id", selected.id);
      // If this silently failed (previously uncaught), the prescription stays
      // 'sent_to_counselor' and can be opened and finalized a SECOND time,
      // producing a duplicate quotation (and duplicate pharmacist order) for
      // the same visit.
      if (finalizeErr) throw finalizeErr;

      // Products-only transactions also spin up a pharmacist product order.
      if (transactionType === "products_only" || transactionType === "treatment_and_products") {
        const productItems = items.filter((i) => i.type === "product");
        if (productItems.length > 0) {
          const { data: order, error: orderErr } = await supabase
            .from("product_orders")
            .insert({
              encounter_id: quotation.encounter_id,
              customer_id: selected.customer_id,
              quotation_id: quotation.id,
              status: "pending",
              items_json: productItems.map((p) => ({
                id: p.id,
                product_id: p.product_id,
                name: p.name,
                quantity: p.quantity,
                unit_price: p.counselor_quoted_price,
                total: p.final_amount,
              })),
              total_amount: productItems.reduce((s, p) => s + p.final_amount, 0),
            })
            .select()
            .single();
          if (orderErr) throw orderErr;
          if (order) {
            const { error: assignErr } = await supabase.rpc("auto_assign_to_pharmacist", { p_order_id: order.id });
            if (assignErr) throw assignErr;
          }
        }
      }

      toast.success(`Quotation ${quoteNo} created and sent to Reception`);
      setSelectedId(null);
      setItems([]);
      queryClient.invalidateQueries({ queryKey: ["counselor_queue"] });
      queryClient.invalidateQueries({ queryKey: ["reception_quotation_queue"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create quotation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Counselor Room</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <div className="mb-3 text-sm font-semibold">Waiting for pricing</div>
            <div className="space-y-2">
              {(queue ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing in your queue.</p>}
              {(queue ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm",
                    selectedId === p.id ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
                  )}
                >
                  <div className="font-medium">{p.customers?.name}</div>
                  <div className="text-xs text-muted-foreground">{p.diagnosis ?? "No diagnosis noted"}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-2 border-primary/30">
          <CardContent className="p-6">
            {!selected ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Select a patient to review the doctor's recommendation and set pricing.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-bold">{selected.customers?.name}</h3>
                  {selected.clinical_notes && <p className="mt-1 text-sm text-muted-foreground">"{selected.clinical_notes}"</p>}
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold">What would the patient like to do?</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TRANSACTION_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTransactionType(t.value)}
                        className={cn(
                          "rounded-md border-2 p-2 text-sm font-medium",
                          transactionType === t.value ? "border-primary bg-accent" : "border-border"
                        )}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Doctor rate</TableHead>
                      <TableHead className="text-right">Your quote</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatINR(item.doctor_suggested_price)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="w-28 text-right"
                            value={item.counselor_quoted_price}
                            onChange={(e) => updatePrice(item.id, Number(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(item.final_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-2 text-sm font-semibold">Discount</div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {[0, 5, 10, 15, 20].map((p) => (
                      <button
                        key={p}
                        onClick={() => setDiscountPercent(p)}
                        className={cn("rounded px-3 py-1.5 text-sm font-medium", discountPercent === p ? "bg-primary text-primary-foreground" : "bg-secondary")}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                  <Input placeholder="Reason for discount..." value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Stat label="Subtotal" value={formatINR(subtotal)} />
                  <Stat label="Discount" value={`-${formatINR(discountAmount)}`} negative />
                  <Stat label="After discount" value={formatINR(afterDiscount)} />
                  <Stat label="GST" value={formatINR(gst)} />
                  <Stat label="TOTAL" value={formatINR(total)} highlight />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                    <Printer className="mr-1 h-4 w-4" /> Print Quotation
                  </Button>
                  <Button className="flex-1" onClick={handleFinalize} disabled={saving || items.length === 0}>
                    <Check className="mr-1 h-4 w-4" /> {saving ? "Creating..." : "Finalize & Send to Reception"}
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

function Stat({ label, value, negative, highlight }: { label: string; value: string; negative?: boolean; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3 text-center", highlight && "border-primary bg-accent")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold", negative && "text-destructive", highlight && "text-primary")}>{value}</div>
    </div>
  );
}
