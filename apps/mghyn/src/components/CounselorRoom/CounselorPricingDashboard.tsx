import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr2, round2 } from "@/lib/gst";
import { Printer, Check } from "lucide-react";
import { toast } from "sonner";

interface QuoteItem {
  id: string;
  type: "service" | "product";
  serviceId?: string | null;
  productId?: string | null;
  name: string;
  quantity: number;
  doctorSuggestedPrice: number;
  counselorQuotedPrice: number;
  notes: string;
}

interface Recommendation {
  id: string;
  encounter_id: string;
  customer_id: string | null;
  customer_name: string | null;
  diagnosis: string | null;
  clinical_notes: string | null;
}

const PERCENTS = [0, 5, 10, 15, 20];

export function CounselorPricingDashboard() {
  const { user } = useAuth();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [phone, setPhone] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const recId = params.get("recommendation");
      const encounterId = params.get("encounter");
      let query = supabase
        .from("treatment_recommendations")
        .select("id, encounter_id, customer_id, customer_name, diagnosis, clinical_notes, items_json, created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (recId) query = query.eq("id", recId);
      else if (encounterId) query = query.eq("encounter_id", encounterId);
      else query = query.eq("status", "sent_to_counselor");

      const { data } = await query.maybeSingle();
      if (!data) {
        setLoading(false);
        return;
      }
      setRec(data as Recommendation);
      const raw = (Array.isArray(data.items_json) ? data.items_json : []) as Record<string, unknown>[];
      setItems(
        raw.map((it) => ({
          id: String(it.id ?? crypto.randomUUID()),
          type: (it.type as "service" | "product") ?? "service",
          serviceId: (it.service_id as string) ?? null,
          productId: (it.product_id as string) ?? null,
          name: String(it.name ?? ""),
          quantity: Number(it.quantity ?? 1),
          doctorSuggestedPrice: Number(it.doctor_suggested_price ?? 0),
          counselorQuotedPrice: Number(it.doctor_suggested_price ?? 0),
          notes: String(it.notes ?? ""),
        })),
      );
      if (data.customer_id) {
        const { data: c } = await supabase.from("customers").select("phone").eq("id", data.customer_id).maybeSingle();
        setPhone(c?.phone ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((s, i) => s + i.counselorQuotedPrice * i.quantity, 0));
    const discountAmount = round2((subtotal * discountPercent) / 100);
    const afterDiscount = round2(Math.max(0, subtotal - discountAmount));
    const gst = round2(afterDiscount * 0.05);
    const total = round2(afterDiscount + gst);
    return { subtotal, discountAmount, afterDiscount, gst, total };
  }, [items, discountPercent]);

  const setPrice = (id: string, price: number) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, counselorQuotedPrice: price } : i)));

  const finalize = async () => {
    if (!rec) return;
    if (!items.length) return toast.error("No items to quote");
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("counselor_quotations")
        .insert({
          encounter_id: rec.encounter_id,
          customer_id: rec.customer_id,
          customer_name: rec.customer_name ?? "",
          recommendation_id: rec.id,
          counselor_id: user?.id as string,
          items_json: items.map((i) => ({
            id: i.id,
            type: i.type,
            service_id: i.serviceId,
            product_id: i.productId,
            name: i.name,
            quantity: i.quantity,
            doctor_suggested_price: i.doctorSuggestedPrice,
            counselor_quoted_price: i.counselorQuotedPrice,
            final_amount: round2(i.counselorQuotedPrice * i.quantity),
          })),
          subtotal: totals.subtotal,
          discount_percent: discountPercent,
          discount_amount: totals.discountAmount,
          discount_reason: discountReason || null,
          gst_5_percent: totals.gst,
          cgst: round2(totals.gst / 2),
          sgst: round2(totals.gst / 2),
          net_total: totals.total,
          status: "sent_to_patient",
          finalized_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;

      // Products on this quotation go to the pharmacy as their own order.
      const productItems = items.filter((i) => i.type === "product");
      if (productItems.length) {
        const { data: order } = await supabase
          .from("product_orders")
          .insert({
            encounter_id: rec.encounter_id,
            customer_id: rec.customer_id,
            customer_name: rec.customer_name ?? "",
            customer_phone: phone || null,
            quotation_id: data.id,
            status: "pending",
            items_json: productItems.map((i) => ({
              id: i.id,
              product_id: i.productId,
              name: i.name,
              quantity: i.quantity,
              unit_price: i.counselorQuotedPrice,
              total: round2(i.counselorQuotedPrice * i.quantity),
              notes: i.notes || null,
            })),
            total_amount: round2(
              productItems.reduce((s, i) => s + i.counselorQuotedPrice * i.quantity, 0),
            ),
          })
          .select("id")
          .single();
        if (order) {
          await supabase
            .from("counselor_quotations")
            .update({
              product_order_id: order.id,
              has_products_only: productItems.length === items.length,
            })
            .eq("id", data.id);
        }
      }

      toast.success("Quotation created");
      window.location.href = `/pos?quotation=${data.id}`;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-8 text-sm text-muted-foreground">Loading recommendation...</p>;
  if (!rec) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No treatment recommendation waiting. Ask the doctor to send one from the Doctor room.
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Patient</div>
            <div className="font-semibold">{rec.customer_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Phone</div>
            <div className="font-semibold">{phone || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Diagnosis</div>
            <div className="font-semibold">{rec.diagnosis || "—"}</div>
          </div>
        </div>
        {rec.clinical_notes && (
          <div className="mt-4 rounded-lg border bg-muted/40 p-3">
            <div className="text-xs uppercase text-muted-foreground">Doctor&apos;s notes</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{rec.clinical_notes}</p>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Pricing &amp; Quotation</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Item</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Doctor rate</th>
                <th className="py-2 text-right">Your quote</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{i.name}</div>
                    {i.notes && <div className="text-xs text-muted-foreground">{i.notes}</div>}
                  </td>
                  <td className="py-2 text-center">{i.quantity}</td>
                  <td className="py-2 text-right">{inr2(i.doctorSuggestedPrice)}</td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      className="ml-auto w-28 text-right"
                      value={i.counselorQuotedPrice}
                      onChange={(e) => setPrice(i.id, parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className="py-2 text-right font-semibold">
                    {inr2(round2(i.counselorQuotedPrice * i.quantity))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-lg border bg-muted/40 p-4">
          <Label className="text-xs uppercase text-muted-foreground">Discount (if applicable)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERCENTS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={discountPercent === p ? "default" : "secondary"}
                onClick={() => setDiscountPercent(p)}
              >
                {p}%
              </Button>
            ))}
          </div>
          <Input
            className="mt-3"
            value={discountReason}
            onChange={(e) => setDiscountReason(e.target.value)}
            placeholder="Reason for discount..."
          />
        </div>

        <div className="mt-5 space-y-1 text-sm">
          <Row label="Subtotal" value={inr2(totals.subtotal)} />
          <Row label="Discount" value={`-${inr2(totals.discountAmount)}`} />
          <Row label="After discount" value={inr2(totals.afterDiscount)} />
          <Row label="GST (5%)" value={inr2(totals.gst)} />
          <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
            <span>TOTAL</span>
            <span>{inr2(totals.total)}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print Quotation
          </Button>
          <Button className="flex-1" disabled={saving} onClick={finalize}>
            <Check className="mr-2 h-4 w-4" />
            {saving ? "Creating..." : "Finalize & Send to Billing"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
