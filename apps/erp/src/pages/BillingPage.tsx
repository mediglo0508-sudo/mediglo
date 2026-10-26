import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { BillLineEditor, type CartLine } from "@/components/billing/BillLineEditor";
import { formatINR } from "@/lib/utils";
import type { PaymentMode, CounselorQuotation, ProductOrder, Invoice, InvoiceLine } from "@/types/domain";
import { useCustomerSearch } from "@/hooks/useQueries";

type BillContext =
  | { kind: "new" }
  | { kind: "quotation"; quotation: CounselorQuotation }
  | { kind: "pharmacy"; order: ProductOrder }
  | { kind: "edit"; invoice: Invoice };

interface PickedCustomer {
  id: string;
  name: string;
  phone: string;
}

export default function BillingPage() {
  const [context, setContext] = useState<BillContext>({ kind: "new" });
  const [pickedCustomer, setPickedCustomer] = useState<PickedCustomer | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">POS / Billing</h1>

      <Tabs
        defaultValue="new"
        onValueChange={() => {
          setContext({ kind: "new" });
          setPickedCustomer(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="new">New Bill</TabsTrigger>
          <TabsTrigger value="quotation">From Counselor Quotation</TabsTrigger>
          <TabsTrigger value="pharmacy">From Pharmacy</TabsTrigger>
          <TabsTrigger value="edit">Edit Existing Invoice</TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <NewBillTab onPickCustomer={setPickedCustomer} />
        </TabsContent>
        <TabsContent value="quotation">
          <QuotationQueueTab onPick={setContext} />
        </TabsContent>
        <TabsContent value="pharmacy">
          <PharmacyQueueTab onPick={setContext} />
        </TabsContent>
        <TabsContent value="edit">
          <EditInvoiceTab onPick={setContext} />
        </TabsContent>
      </Tabs>

      <BillEditorPanel
        context={context}
        pickedCustomer={pickedCustomer}
        onDone={() => {
          setContext({ kind: "new" });
          setPickedCustomer(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// New bill: search-or-create customer, then edit lines below
// ---------------------------------------------------------------------------
function NewBillTab({ onPickCustomer }: { onPickCustomer: (c: PickedCustomer) => void }) {
  const [phone, setPhone] = useState("");
  const { data: results } = useCustomerSearch(phone);

  return (
    <Card className="mt-3">
      <CardContent className="space-y-3 p-4">
        <Input placeholder="Search customer by name or phone to start a new bill..." value={phone} onChange={(e) => setPhone(e.target.value)} />
        {results && results.length > 0 && (
          <div className="space-y-1">
            {results.map((c) => (
              <button
                key={c.id}
                className="block w-full rounded-md border border-border p-2 text-left text-sm hover:bg-accent"
                onClick={() => onPickCustomer({ id: c.id, name: c.name, phone: c.phone })}
              >
                {c.name} · {c.phone}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Or just start typing a new customer's details directly below.</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Quotation queue
// ---------------------------------------------------------------------------
function QuotationQueueTab({ onPick }: { onPick: (c: BillContext) => void }) {
  const { data: quotations } = useQuery({
    queryKey: ["reception_quotation_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("counselor_quotations")
        .select("*, customers(name, phone)")
        .eq("status", "sent_to_patient")
        .order("finalized_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (CounselorQuotation & { customers: { name: string; phone: string } })[];
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="mt-3 space-y-2">
      {(quotations ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No quotations waiting for billing.</p>}
      {(quotations ?? []).map((q) => (
        <Card key={q.id} className="cursor-pointer hover:border-primary" onClick={() => onPick({ kind: "quotation", quotation: q })}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{q.customers?.name}</div>
              <div className="text-xs text-muted-foreground">{q.quotation_number} · {q.items_json.length} item(s)</div>
            </div>
            <div className="text-lg font-bold">{formatINR(q.net_total)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pharmacy queue
// ---------------------------------------------------------------------------
function PharmacyQueueTab({ onPick }: { onPick: (c: BillContext) => void }) {
  const { data: orders } = useQuery({
    queryKey: ["reception_pharmacy_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_orders")
        .select("*, customers(name, phone)")
        .in("status", ["confirmed", "ready_for_pickup"])
        .order("confirmed_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (ProductOrder & { customers: { name: string; phone: string } })[];
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="mt-3 space-y-2">
      {(orders ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No confirmed pharmacy orders yet.</p>}
      {(orders ?? []).map((o) => (
        <Card key={o.id} className="cursor-pointer hover:border-primary" onClick={() => onPick({ kind: "pharmacy", order: o })}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{o.customers?.name}</div>
              <div className="text-xs text-muted-foreground">{o.items_json.length} item(s)</div>
            </div>
            <div className="text-lg font-bold">{formatINR(o.total_amount)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit existing invoice
// ---------------------------------------------------------------------------
function EditInvoiceTab({ onPick }: { onPick: (c: BillContext) => void }) {
  const [search, setSearch] = useState("");
  const { data: invoices } = useQuery({
    queryKey: ["invoice_search", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name, phone)")
        .ilike("invoice_no", `%${search}%`)
        .neq("status", "void")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as (Invoice & { customers: { name: string; phone: string } })[];
    },
  });

  return (
    <div className="mt-3 space-y-3">
      <Input placeholder="Search invoice number..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="space-y-2">
        {(invoices ?? []).map((inv) => (
          <Card key={inv.id} className="cursor-pointer hover:border-primary" onClick={() => onPick({ kind: "edit", invoice: inv })}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{inv.invoice_no}</div>
                <div className="text-xs text-muted-foreground">{inv.customers?.name}</div>
              </div>
              <div className="text-lg font-bold">{formatINR(inv.gross_total)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bill editor - builds a CartLine[] from whichever source was picked,
// then saves through the SAME path every time: insert a bare invoice header
// (or reuse an existing one) + call edit_invoice() with the full line set.
// edit_invoice's diff-based upsert (0008_functions.sql) means this is safe to
// call for brand-new invoices too - every line simply has id = null.
// ---------------------------------------------------------------------------
function BillEditorPanel({
  context,
  pickedCustomer,
  onDone,
}: {
  context: BillContext;
  pickedCustomer: PickedCustomer | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [gstMode, setGstMode] = useState<"inclusive" | "exclusive">("exclusive");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  // React to a customer picked in the "New Bill" search box above.
  useEffect(() => {
    if (context.kind === "new" && pickedCustomer) {
      setCustomerId(pickedCustomer.id);
      setCustomerName(pickedCustomer.name);
      setCustomerPhone(pickedCustomer.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedCustomer]);

  // Hydrate from context whenever a different quotation/order/invoice is picked
  // (or the tabs are reset back to "new").
  const contextKey = context.kind === "new" ? "new" : context.kind === "edit" ? context.invoice.id : context.kind === "quotation" ? context.quotation.id : context.order.id;

  useEffect(() => {
    if (context.kind === "quotation") {
      const q = context.quotation as any;
      setCustomerId(q.customer_id);
      setCustomerName(q.customers?.name ?? "");
      setCustomerPhone(q.customers?.phone ?? "");
      setLines(
        q.items_json.map((i: any) => ({
          item_type: i.type,
          service_id: i.type === "service" ? i.service_id : undefined,
          product_id: i.type === "product" ? i.product_id : undefined,
          inventory_id: i.type === "product" ? i.product_id : undefined,
          name: i.name,
          quantity: i.quantity,
          rate: i.counselor_quoted_price,
          discount_amount: 0,
        }))
      );
      setDiscountAmount(Number(q.discount_amount) || 0);
      setGstMode("exclusive");
      setInvoiceId(null);
    } else if (context.kind === "pharmacy") {
      const o = context.order as any;
      setCustomerId(o.customer_id);
      setCustomerName(o.customers?.name ?? "");
      setCustomerPhone(o.customers?.phone ?? "");
      setLines(
        o.items_json.map((i: any) => ({
          item_type: "product" as const,
          product_id: i.product_id,
          inventory_id: i.product_id,
          name: i.name,
          quantity: i.quantity,
          rate: i.unit_price,
          discount_amount: 0,
        }))
      );
      setDiscountAmount(0);
      setGstMode("exclusive");
      setInvoiceId(null);
    } else if (context.kind === "edit") {
      const inv = context.invoice as any;
      setCustomerId(inv.customer_id);
      setCustomerName(inv.customers?.name ?? "");
      setCustomerPhone(inv.customers?.phone ?? "");
      setDiscountAmount(Number(inv.discount_amount) || 0);
      setGstMode(inv.gst_mode ?? "exclusive");
      setPaymentMode(inv.payment_mode ?? "cash");
      setInvoiceId(inv.id);
      supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", inv.id)
        .eq("line_status", "active")
        .then(({ data }) => {
          setLines(
            (data ?? []).map((l: InvoiceLine) => ({
              id: l.id,
              item_type: l.item_type,
              service_id: l.service_id,
              product_id: l.product_id,
              inventory_id: l.inventory_id,
              name: l.name,
              quantity: l.quantity,
              rate: l.rate,
              discount_amount: l.discount_amount,
              staff_id: l.staff_id,
            }))
          );
        });
    } else {
      setCustomerId(null);
      setCustomerName("");
      setCustomerPhone("");
      setLines([]);
      setDiscountAmount(0);
      setGstMode("exclusive");
      setPaymentMode("cash");
      setInvoiceId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  async function handleSave() {
    if (!customerId && (!customerName.trim() || !customerPhone.trim())) {
      toast.error("Select or enter a customer first");
      return;
    }
    const wasNewInvoice = !invoiceId;
    setSaving(true);
    try {
      let cid = customerId;
      let cidStateCode: string | null = null;
      if (!cid) {
        const { data: found, error: findErr } = await supabase
          .from("customers")
          .select("id, state_code")
          .eq("phone", customerPhone)
          .maybeSingle();
        if (findErr) throw findErr;
        if (found) {
          cid = found.id;
          cidStateCode = found.state_code;
        } else {
          const { data: created, error } = await supabase
            .from("customers")
            .insert({ name: customerName, phone: customerPhone })
            .select("id, state_code")
            .single();
          if (error) throw error;
          cid = created.id;
          cidStateCode = created.state_code;
        }
      } else {
        const { data: existing } = await supabase.from("customers").select("state_code").eq("id", cid).maybeSingle();
        cidStateCode = existing?.state_code ?? null;
      }

      // CRITICAL: invoiceId must be captured into state the moment a new
      // invoice header exists. Previously this only updated the local `invId`
      // variable - `invoiceId` (the state) stayed null, so the Save button
      // stayed labelled "Create Invoice" and a second click (fat-finger,
      // double-tap, or one more item added before leaving the tab) created a
      // SECOND, separate invoice for the same sale instead of updating the
      // first. Everything below now also uses `invId` for the RPC and
      // `setInvoiceId(invId)` runs unconditionally right after the header is
      // created, before any await that could fail.
      let invId = invoiceId;
      if (!invId) {
        const invoiceType = context.kind === "pharmacy" ? "products" : context.kind === "quotation" ? (context.quotation.transaction_type === "products_only" ? "products" : "treatment_and_products") : "treatment_and_products";
        const { data: created, error } = await supabase
          .from("invoices")
          .insert({
            customer_id: cid,
            quotation_id: context.kind === "quotation" ? context.quotation.id : null,
            prescription_id: context.kind === "quotation" ? context.quotation.prescription_id : null,
            product_order_id: context.kind === "pharmacy" ? context.order.id : null,
            invoice_type: invoiceType,
            place_of_supply: cidStateCode,
          })
          .select("id")
          .single();
        if (error) throw error;
        invId = created.id;
        setInvoiceId(invId);
      }

      const { error: editErr } = await supabase.rpc("edit_invoice", {
        p_invoice_id: invId,
        p_lines: lines,
        p_discount_amount: discountAmount,
        p_gst_mode: gstMode,
        p_payment_mode: paymentMode,
      });
      if (editErr) throw editErr;

      if (context.kind === "quotation") {
        const { error } = await supabase.from("counselor_quotations").update({ status: "converted_to_invoice" }).eq("id", context.quotation.id);
        if (error) throw error;
      }
      if (context.kind === "pharmacy") {
        const { error } = await supabase
          .from("product_orders")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", context.order.id);
        if (error) throw error;
      }

      toast.success(wasNewInvoice ? "Invoice created" : "Invoice updated");
      queryClient.invalidateQueries();

      if (context.kind === "new") {
        // The "new bill" tab never changes `contextKey` on its own (it's the
        // literal string "new" before and after), so the hydration effect
        // keyed on it never re-fires - reset every field here directly, or a
        // second bill would silently continue editing the invoice just saved.
        setCustomerId(null);
        setCustomerName("");
        setCustomerPhone("");
        setLines([]);
        setDiscountAmount(0);
        setInvoiceId(null);
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardContent className="space-y-4 p-6">
        {context.kind === "new" && (
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Input placeholder="Customer phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
        )}
        <BillLineEditor
          customerLabel={customerName ? `${customerName} · ${customerPhone}` : "No customer selected"}
          lines={lines}
          onLinesChange={setLines}
          discountAmount={discountAmount}
          onDiscountAmountChange={setDiscountAmount}
          gstMode={gstMode}
          onGstModeChange={setGstMode}
          paymentMode={paymentMode}
          onPaymentModeChange={setPaymentMode}
          onSave={handleSave}
          saving={saving}
          saveLabel={invoiceId ? "Save Changes" : "Create Invoice & Print"}
        />
      </CardContent>
    </Card>
  );
}
