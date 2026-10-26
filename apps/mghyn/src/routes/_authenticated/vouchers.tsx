import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentModeSelect } from "@/components/PaymentModeSelect";
import { inr2, round2 } from "@/lib/gst";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vouchers")({
  head: () => ({
    meta: [
      { title: "Vouchers — MGHYN Clinic ERP" },
      { name: "description", content: "Accounting vouchers generated from invoices and payments." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Vouchers — MGHYN Clinic ERP" },
      { property: "og:description", content: "Accounting vouchers generated from invoices and payments." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/vouchers" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/vouchers" }],
  }),
  component: VouchersPage,
});

const VTYPES = [
  { v: "sales", label: "Sales" },
  { v: "purchase", label: "Purchase" },
  { v: "payment", label: "Payment" },
  { v: "receipt", label: "Receipt" },
  { v: "contra", label: "Contra" },
  { v: "credit_note", label: "Credit Note" },
  { v: "debit_note", label: "Debit Note" },
] as const;

function VouchersPage() {
  const qc = useQueryClient();
  const { isFinance } = useAuth();
  const [vtype, setVtype] = useState<string>("payment");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [narration, setNarration] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: vouchers } = useQuery({
    queryKey: ["vouchers"],
    queryFn: async () => (await supabase.from("vouchers").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const amt = Number(amount) || 0;
  const rate = vtype === "purchase" ? Number(gstRate) || 0 : 0;
  const base = rate ? round2(amt / (1 + rate / 100)) : amt;
  const tax = round2(amt - base);

  async function save() {
    if (amt <= 0) return toast.error("Enter amount");
    setSaving(true);
    try {
      const vno = `${vtype.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-6)}`;
      const { data: v, error } = await supabase.from("vouchers").insert({
        vtype: vtype as never, voucher_no: vno, party: party || null, narration: narration || null,
        amount: amt, gst_rate: rate, cgst: round2(tax / 2), sgst: round2(tax - round2(tax / 2)), payment_mode: paymentMode,
      }).select("id").single();
      if (error) throw error;

      // double-entry
      const entries = buildEntries(vtype, amt, party, paymentMode);
      await supabase.from("voucher_entries").insert(entries.map((e) => ({ ...e, voucher_id: v.id })));
      toast.success(`Voucher ${vno} posted`);
      setAmount(""); setParty(""); setNarration("");
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!isFinance) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Tally Vouchers" subtitle="Double-entry bookkeeping · Sales / Purchase / Payment / Receipt / Contra / Credit & Debit Notes" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">New Voucher</h3>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={vtype} onValueChange={setVtype}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VTYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Party / Ledger</Label><Input value={party} onChange={(e) => setParty(e.target.value)} placeholder="Vendor / Person / Account" /></div>
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          {vtype === "purchase" && (
            <div className="space-y-1.5">
              <Label>Input GST Rate (ITC)</Label>
              <Select value={gstRate} onValueChange={setGstRate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["0", "5", "12", "18"].map((r) => <SelectItem key={r} value={r}>{r}%</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Payment Mode</Label>
            <PaymentModeSelect value={paymentMode} onValueChange={setPaymentMode} />
          </div>
          <div className="space-y-1.5"><Label>Narration</Label><Textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={2} /></div>
          {rate > 0 && <p className="text-xs text-muted-foreground">Base {inr2(base)} · ITC {inr2(tax)}</p>}
          <Button className="w-full" onClick={save} disabled={saving}>Post Voucher</Button>
        </Card>

        <Card className="p-0 lg:col-span-2">
          <div className="border-b p-3 text-sm font-semibold">Voucher Register</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-3">No</th><th className="p-3">Type</th><th className="p-3">Party</th><th className="p-3">Mode</th><th className="p-3 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y">
                {(vouchers ?? []).map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{v.voucher_no}</td>
                    <td className="p-3 capitalize">{String(v.vtype).replace("_", " ")}</td>
                    <td className="p-3">{v.party || "—"}</td>
                    <td className="p-3">{v.payment_mode}</td>
                    <td className="p-3 text-right font-semibold">{inr2(Number(v.amount))}</td>
                  </tr>
                ))}
                {(vouchers?.length ?? 0) === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No vouchers.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function buildEntries(vtype: string, amt: number, party: string, mode: string) {
  const cash = mode === "Cash" ? "Cash" : "Bank";
  const p = party || "Party";
  switch (vtype) {
    case "sales": return [{ ledger: cash, debit: amt, credit: 0 }, { ledger: "Sales", debit: 0, credit: amt }];
    case "purchase": return [{ ledger: "Purchases", debit: amt, credit: 0 }, { ledger: cash, debit: 0, credit: amt }];
    case "payment": return [{ ledger: p, debit: amt, credit: 0 }, { ledger: cash, debit: 0, credit: amt }];
    case "receipt": return [{ ledger: cash, debit: amt, credit: 0 }, { ledger: p, debit: 0, credit: amt }];
    case "contra": return [{ ledger: "Bank", debit: amt, credit: 0 }, { ledger: "Cash", debit: 0, credit: amt }];
    case "credit_note": return [{ ledger: "Sales Returns", debit: amt, credit: 0 }, { ledger: p, debit: 0, credit: amt }];
    case "debit_note": return [{ ledger: p, debit: amt, credit: 0 }, { ledger: "Purchase Returns", debit: 0, credit: amt }];
    default: return [{ ledger: cash, debit: amt, credit: 0 }, { ledger: p, debit: 0, credit: amt }];
  }
}
