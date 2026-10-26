// ============================================================================
// In-place invoice line editor.
//
// Saves the lines through the browser client (existing RLS on invoice_lines is
// the authorisation point), then calls rebill_invoice_inventory() ONCE via a
// server function. Stock is NEVER written from here — the SQL function reverses
// the invoice's previous impact and re-applies the current lines atomically.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { computeTax, lineGstRate, inr2, round2 } from "@/lib/gst";
import { friendlyBillingError } from "@/lib/billing-access";
import { invalidateLedger } from "@/lib/ledger-cache";
import { classifyDescription, buildCatalogIndex, normalizeCategory, type ItemCategory } from "@/lib/item-category";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, Check, ChevronsUpDown, Loader2 } from "lucide-react";

interface EditLine {
  id: string | null;
  description: string;
  sac_code: string;
  qty: number;
  unit_price: number;
  discount_amount: number;
  inventory_id: string | null;
  item_category: ItemCategory;
  session_label: string | null;
  is_complimentary: boolean;
}


interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

const CATEGORIES: ItemCategory[] = ["product", "service", "consultation"];

import { PAYMENT_MODES } from "@/lib/constants";
import { PaymentModeSelect } from "@/components/PaymentModeSelect";
interface Split { id: string; mode: string; amount: number; }

export function InvoiceEditDialog({ invoiceId, onClose }: Props) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<EditLine[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  const [paymentMode, setPaymentMode] = useState<string>("Cash");
  const [paySplits, setPaySplits] = useState<Split[]>([]);
  const [paidAmount, setPaidAmount] = useState<string>("0");
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [overallDiscountType, setOverallDiscountType] = useState<"amount" | "percent">("amount");

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-edit", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const [{ data: inv }, { data: rows }, { data: products }, { data: services }] = await Promise.all([
        supabase.from("invoices").select("*, customers(phone)").eq("id", invoiceId!).single(),
        supabase.from("invoice_lines").select("*").eq("invoice_id", invoiceId!).order("created_at"),
        supabase.from("inventory").select("id, name, stock, rate").eq("active", true).order("name"),
        supabase.from("services_master").select("name, category, sac_code").eq("active", true),
      ]);
      return { inv, rows: rows ?? [], products: products ?? [], services: services ?? [] };
    },
  });

  const catalog = useMemo(
    () => buildCatalogIndex(data?.products ?? [], data?.services ?? []),
    [data?.products, data?.services],
  );

  useEffect(() => {
    if (!data?.rows) return;
    setRemoved([]);
    setLines(
      data.rows.map((l) => ({
        id: l.id,
        description: l.description ?? "",
        sac_code: l.sac_code ?? "",
        qty: Number(l.qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        discount_amount: Number(l.discount_amount) || 0,
        inventory_id: l.inventory_id ?? null,
        item_category:
          normalizeCategory(l.item_category) ?? classifyDescription(l.description, catalog),
        session_label: l.session_label ?? null,
        is_complimentary: l.is_complimentary ?? false,
      })),
    );
  }, [data?.rows, catalog]);

  useEffect(() => {
    if (!data?.inv) return;
    setPaymentMode(data.inv.payment_mode ?? "Cash");
    setPaidAmount(String(Number(data.inv.paid_amount ?? 0)));
    setOverallDiscount(Number(data.inv.discount_amount ?? 0));
    setOverallDiscountType("amount");
    setPaySplits([]);
    setCustomerName(data.inv.customer_name ?? "");
    setCustomerPhone(
      (data.inv as { customers?: { phone?: string | null } | null }).customers?.phone ?? "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.inv?.id]);


  const taxMode = (data?.inv?.tax_mode ?? "inclusive") as "inclusive" | "exclusive";

  function calc(l: EditLine) {
    const gross = round2(Math.max(0, l.qty * l.unit_price - l.discount_amount));
    return computeTax(gross, taxMode, lineGstRate(l.description, l.sac_code));
  }

  const totals = lines.reduce(
    (acc, l) => {
      const t = calc(l);
      acc.base += t.base; acc.cgst += t.cgst; acc.sgst += t.sgst; acc.gross += t.gross;
      if (l.item_category !== "consultation") acc.eligibleGross += t.gross;
      return acc;
    },
    { base: 0, cgst: 0, sgst: 0, gross: 0, eligibleGross: 0 },
  );

  /** Overall bill-level discount, applied on top of line discounts. Consultation
   * lines are never discounted here (same "sacred OPD" rule pos.tsx uses). */
  const final = useMemo(() => {
    const raw = overallDiscountType === "percent" ? round2((totals.gross * overallDiscount) / 100) : round2(overallDiscount);
    const discountAmount = Math.min(Math.max(raw, 0), round2(totals.eligibleGross));
    const net = Math.max(0, round2(totals.gross - discountAmount));
    const factor = totals.gross > 0 ? net / totals.gross : 0;
    return {
      discountAmount,
      cappedByEligibility: raw > discountAmount,
      base: round2(totals.base * factor),
      cgst: round2(totals.cgst * factor),
      sgst: round2(totals.sgst * factor),
      gross: net,
    };
  }, [totals.gross, totals.base, totals.cgst, totals.sgst, totals.eligibleGross, overallDiscount, overallDiscountType]);

  const paidNum = Number(paidAmount) || 0;
  const pendingDue = round2(final.gross - paidNum);
  const splitsTotal = round2(paySplits.reduce((s, x) => s + (Number(x.amount) || 0), 0));
  const splitsMismatch = paymentMode === "Split Payment" && round2(splitsTotal) !== round2(paidNum);

  const unmapped = lines.filter((l) => l.item_category === "product" && !l.inventory_id);

  function patch(i: number, next: Partial<EditLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...next } : l)));
  }

  function removeLine(i: number) {
    const l = lines[i];
    if (l?.id) setRemoved((r) => [...r, l.id!]);
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  function addLine() {
    setLines((ls) => [
      ...ls,
      {
        id: null,
        description: "",
        sac_code: "",
        qty: 1,
        unit_price: 0,
        discount_amount: 0,
        inventory_id: null,
        item_category: "product",
        session_label: null,
        is_complimentary: false,

      },
    ]);
  }

  function addSplit() {
    setPaySplits((s) => [...s, { id: crypto.randomUUID(), mode: "Cash", amount: 0 }]);
  }
  function updateSplit(id: string, patch: Partial<Split>) {
    setPaySplits((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeSplit(id: string) {
    setPaySplits((s) => s.filter((x) => x.id !== id));
  }


  async function save() {
    if (!invoiceId || !data?.inv) return;
    if (data.inv.voided_at) return toast.error("This invoice is voided — un-void it before editing.");
    if (lines.some((l) => !l.description.trim())) return toast.error("Every line needs a description.");
    if (splitsMismatch) return toast.error(`Split payments (${inr2(splitsTotal)}) must add up to the amount paid (${inr2(paidNum)}).`);

    const proceedGeneral = window.confirm(
      "You are modifying an existing bill. This will affect accounting. Do you want to proceed?"
    );
    if (!proceedGeneral) return;

    setSaving(true);

    try {
      const editLinePayload = lines.map((l) => {
        const t = calc(l);
        return {
          db_id: l.id,
          description: l.description.trim(),
          sac_code: l.sac_code || null,
          qty: l.qty,
          unit_price: l.unit_price,
          discount_type: "amount" as const,
          discount_value: l.discount_amount,
          discount_amount: l.discount_amount,
          base_amount: t.base, cgst: t.cgst, sgst: t.sgst, line_total: t.gross,
          gst_rate: lineGstRate(l.description, l.sac_code),
          session_label: l.session_label,
          package_id: null,
          is_complimentary: l.is_complimentary,
          item_category: l.item_category,
          inventory_id: l.item_category === "product" ? l.inventory_id : null,

        };
      });

      const keptIds = editLinePayload.map((l) => l.db_id).filter((x): x is string => !!x);
      const { data: impact } = await supabase.rpc("invoice_removed_lines_impact", {
        p_invoice_id: invoiceId,
        p_kept_line_ids: keptIds,
      });
      let forceRemove = false;
      const impactRows = (impact as { description: string; consumed_sessions: number; total_sessions: number }[] | null) ?? [];
      if (impactRows.length > 0) {
        const names = impactRows.map((r) => `${r.description} (${r.consumed_sessions}/${r.total_sessions} sessions used)`).join(", ");
        const typed = window.prompt(
          `Warning: The customer has already consumed sessions from this package (${names}). ` +
          `Deleting this item will wipe their session history. Type "CONFIRM" to proceed, or Cancel.`
        );
        if (typed !== "CONFIRM") { setSaving(false); return; }
        forceRemove = true;
      }

      const effectivePaymentMode = paymentMode === "Split Payment"
        ? paySplits.filter((s) => s.amount > 0).map((s) => `${s.mode} ${round2(s.amount)}`).join(" + ") || "Split Payment"
        : paymentMode;

      const { data: rpcResult, error: editErr } = await supabase.rpc("edit_invoice", {
        p_invoice_id: invoiceId,
        p_header: {
          customer_id: data.inv.customer_id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          invoice_date: data.inv.invoice_date,

          state_code: data.inv.state_code,
          tax_mode: taxMode,
          payment_mode: effectivePaymentMode,
          base_amount: final.base, cgst: final.cgst, sgst: final.sgst,
          discount_amount: final.discountAmount, gross_total: final.gross,
          paid_amount: paidNum,
        },
        p_lines: editLinePayload,
        p_force_remove: forceRemove,
        p_splits: paymentMode === "Split Payment"
          ? paySplits.filter((s) => s.amount > 0).map((s) => ({ mode: s.mode, amount: round2(s.amount) }))
          : null,
      });
      if (editErr) {
        const raw = editErr.message ?? "";
        throw new Error(raw.startsWith("WALLET_CONSUMED_BLOCK:")
          ? "Some removed items still have consumed package sessions — please re-check and try again."
          : (raw || "Failed to save invoice"));
      }

      const result = (rpcResult ?? {}) as {
        new_invoice_no?: string;
        rebill?: {
          reversed?: { reversed_movements?: number; units_restored?: number };
          applied?: { units_deducted?: number };
        };
      };
      const unitsDeducted = result.rebill?.applied?.units_deducted ?? 0;
      const unitsRestored = result.rebill?.reversed?.units_restored ?? 0;
      setRemoved([]);

      if (unmapped.length) {
        toast.warning(
          `${unmapped.length} product line${unmapped.length > 1 ? "s are" : " is"} not linked to an inventory item — stock will not change for ${unmapped.length > 1 ? "them" : "it"}.`,
        );
      }
      toast.success(
        `Invoice corrected — new invoice ${result.new_invoice_no ?? ""} created. Original preserved as void history. ${unitsDeducted} unit(s) deducted, ${unitsRestored} unit(s) restored.`,
      );
      onClose();
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      invalidateLedger(qc);

    } catch (e) {
      toast.error(friendlyBillingError(e));
    } finally {
      setSaving(false);
    }
  }


  return (
    <Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-full max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit invoice {data?.inv?.invoice_no ?? ""}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading lines…</p>}

        {data?.inv?.voided_at && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Voided invoice</AlertTitle>
            <AlertDescription>Un-void this invoice before editing its lines.</AlertDescription>
          </Alert>
        )}

        {unmapped.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {unmapped.length} product line{unmapped.length > 1 ? "s are" : " is"} not linked to an inventory item
            </AlertTitle>
            <AlertDescription>
              Stock will not change for: {unmapped.map((l) => l.description || "(unnamed line)").join(", ")}. Link them
              to track stock. Saving is still allowed.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Customer name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Contact number</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-9" />
          </div>
        </div>

        <div className="space-y-3">

          {lines.map((l, i) => {
            const t = calc(l);
            return (
              <div key={l.id ?? `new-${i}`} className="rounded-lg border p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={l.description}
                      onChange={(e) => patch(i, { description: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Category</Label>
                    <Select
                      value={l.item_category}
                      onValueChange={(v) =>
                        patch(i, {
                          item_category: v as ItemCategory,
                          inventory_id: v === "product" ? l.inventory_id : null,
                        })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      min={0}
                      value={l.qty}
                      onChange={(e) => patch(i, { qty: Number(e.target.value) || 0 })}
                      className="h-9"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Unit price</Label>
                    <Input
                      type="number"
                      min={0}
                      value={l.unit_price}
                      onChange={(e) => patch(i, { unit_price: Number(e.target.value) || 0 })}
                      className="h-9"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Discount ₹</Label>
                    <Input
                      type="number"
                      min={0}
                      value={l.discount_amount}
                      onChange={(e) => patch(i, { discount_amount: Number(e.target.value) || 0 })}
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="flex items-center gap-2 pb-1">
                    <Checkbox
                      id={`compl-${l.id ?? i}`}
                      checked={l.is_complimentary}
                      onCheckedChange={(v) => patch(i, { is_complimentary: v === true })}
                    />
                    <Label htmlFor={`compl-${l.id ?? i}`} className="text-xs">Complimentary</Label>
                  </div>
                  {l.item_category === "product" ? (
                    <div className="min-w-64">
                      <Label className="text-xs">Inventory product</Label>
                      <ProductPicker
                        products={data?.products ?? []}
                        value={l.inventory_id}
                        onChange={(id) => patch(i, { inventory_id: id })}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Service / consultation line — no inventory item, no stock movement.
                    </p>
                  )}

                  <div className="ml-auto text-right text-xs text-muted-foreground">
                    Base {inr2(t.base)} · GST {inr2(t.tax)} ·{" "}
                    <span className="font-semibold text-foreground">{inr2(t.gross)}</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(i)} title="Remove line">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={addLine}>
            <Plus className="mr-1 h-4 w-4" /> Add line
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Overall discount</Label>
            <div className="flex gap-2">
              <Input type="number" min={0} value={overallDiscount}
                onChange={(e) => setOverallDiscount(Number(e.target.value) || 0)} className="h-9" />
              <Select value={overallDiscountType} onValueChange={(v) => setOverallDiscountType(v as "amount" | "percent")}>
                <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">₹</SelectItem>
                  <SelectItem value="percent">%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {final.cappedByEligibility && (
              <p className="mt-1 text-xs text-muted-foreground">Capped — discount cannot exceed the non-consultation total.</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Mode of payment</Label>
            <PaymentModeSelect value={paymentMode} onValueChange={setPaymentMode} triggerClassName="h-9 flex-1"
              base={PAYMENT_MODES} extra={["Split Payment"]} />
          </div>

          <div>
            <Label className="text-xs">Amount paid / received</Label>
            <Input type="number" min={0} value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Pending / due</Label>
            <Input type="number" value={pendingDue}
              onChange={(e) => setPaidAmount(String(round2(final.gross - (Number(e.target.value) || 0))))}
              className="h-9" />
          </div>

          {paymentMode === "Split Payment" && (
            <div className="md:col-span-2 space-y-2 rounded-lg border p-2">
              <p className="text-xs font-medium text-muted-foreground">Split payment breakdown</p>
              {paySplits.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Select value={s.mode} onValueChange={(v) => updateSplit(s.id, { mode: v })}>
                    <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Cash", "Card", "UPI", "Net Banking"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min={0} value={s.amount}
                    onChange={(e) => updateSplit(s.id, { amount: Number(e.target.value) || 0 })} className="h-9" />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeSplit(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addSplit}><Plus className="mr-1 h-4 w-4" /> Add split</Button>
              {splitsMismatch && (
                <p className="text-xs text-destructive">Split total ({inr2(splitsTotal)}) must equal amount paid ({inr2(paidNum)}).</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Lines total</span><span>{inr2(totals.gross)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Overall discount</span><span>− {inr2(final.discountAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Taxable base</span><span>{inr2(final.base)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{inr2(round2(final.cgst + final.sgst))}</span></div>
          <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Grand total</span><span>{inr2(final.gross)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{inr2(paidNum)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Pending / due</span><span>{inr2(pendingDue)}</span></div>
        </div>




        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
          <Button onClick={save} disabled={saving || isLoading || !!data?.inv?.voided_at}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save &amp; reconcile stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: { id: string; name: string | null; stock: number | null }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = products.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-9 w-72 justify-between font-normal">
          <span className={current ? "" : "text-muted-foreground"}>
            {current?.name ?? "Not linked — no stock impact"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search inventory…" />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onChange(null); setOpen(false); }}>
                <span className="text-muted-foreground">Not linked (no stock impact)</span>
              </CommandItem>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name ?? ""} ${p.id}`}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${p.id === value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{Number(p.stock ?? 0)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
