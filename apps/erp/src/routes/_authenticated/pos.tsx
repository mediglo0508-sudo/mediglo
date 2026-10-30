import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { computeTax, inr2, round2, lineGstRate } from "@/lib/gst";
import { GST_STATES, PAYMENT_MODES } from "@/lib/constants";
import { PaymentModeSelect } from "@/components/PaymentModeSelect";
import { printTallyInvoice } from "@/lib/print-layout";
import { postSaleVouchers, incrementPackages } from "@/lib/automation";
import { commitStockMovement, invalidateInventory } from "@/lib/inventory-stock";
import { invalidateLedger } from "@/lib/ledger-cache";
import { QuickAddDialog, type QuickAddResult } from "@/components/QuickAddDialog";
import { generateAutomatedSessions, pushNotification } from "@/lib/cos-engine";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Receipt, Printer, Boxes, CalendarClock, Wallet, MessageCircle, Share2 } from "lucide-react";
import { downloadInvoicePdf, shareInvoiceViaWhatsApp, type InvoiceShareData } from "@/lib/invoice-whatsapp-pdf";
import { useActiveWallets } from "@/lib/wallet-alerts";
import { logTreatmentSessions } from "@/lib/wallet-redeem";
import { WalletRedeemDialog } from "@/components/WalletRedeemDialog";
import { useRealtimeSync } from "@/lib/realtime";
import { useCatalogIndex, classifyDescription, normalizeCategory, type ItemCategory } from "@/lib/item-category";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

import { BillingLockGate } from "@/components/BillingLockGate";
import { DuplicateBillDialog } from "@/components/DuplicateBillDialog";
import {
  checkDuplicateBill,
  logBillingEvent,
  friendlyBillingError,
  isBillingLockedError,
  useBillingAccess,
  type DuplicateCheckResult,
} from "@/lib/billing-access";





export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "Billing / POS — MGHYN Clinic ERP" },
      { name: "description", content: "Point of sale billing with GST, discounts, wallets and split payments." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Billing / POS — MGHYN Clinic ERP" },
      { property: "og:description", content: "Point of sale billing with GST, discounts, wallets and split payments." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/pos" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/pos" }],
  }),
  component: POSPage,
});

interface ConsumedItem {
  id: string;
  item_id: string;
  item_name: string;
  qty_used: number;
  unit_cost: number;
  stock_qty: number;
}

interface Line {
  id: string;
  /** The REAL invoice_lines.id when this line came from the database; null for a brand-new line. */
  db_id: string | null;
  description: string;
  sac_code: string;
  qty: number;
  unit_price: number;
  discount_type: "amount" | "percent";
  discount_value: number;
  session_label: string;
  package_id: string;
  consumed: ConsumedItem[];
  is_complimentary: boolean;
  /** "Service taken today?" — when false the sessions go to the wallet unconsumed. */
  consume_today: boolean;
  /** Strict, immutable revenue bucket written to invoice_lines.item_category. */
  category: ItemCategory;
}

interface PaySplit { id: string; mode: string; amount: number; }

function newLine(): Line {
  return { id: crypto.randomUUID(), db_id: null, description: "", sac_code: "", qty: 1, unit_price: 0, discount_type: "amount", discount_value: 0, session_label: "", package_id: "", consumed: [], is_complimentary: false, consume_today: false, category: "service" };
}


function newSplit(mode = "Cash"): PaySplit {
  return { id: crypto.randomUUID(), mode, amount: 0 };
}

/** Line net (after its own discount) + GST split. Discount always applies before GST. */
function lineMath(l: Line, taxMode: "inclusive" | "exclusive") {
  const price = l.is_complimentary ? 0 : l.unit_price;
  const gross = round2(l.qty * price);
  const rawDisc = l.is_complimentary
    ? 0
    : l.discount_type === "percent"
      ? round2((gross * (l.discount_value || 0)) / 100)
      : round2(l.discount_value || 0);
  const discount = Math.min(Math.max(rawDisc, 0), gross);
  const net = round2(gross - discount);
  const t = computeTax(net, taxMode, lineGstRate(l.description, l.sac_code));
  return { price, gross, discount, net, t };
}

function POSPage() {
  const { canBilling, user } = useAuth();
  const navigate = useNavigate();
  const billingAccess = useBillingAccess();

  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("inclusive");
  const [stateCode, setStateCode] = useState("06");
  const [paymentMode, setPaymentMode] = useState<string>("Cash");
  const [paySplits, setPaySplits] = useState<PaySplit[]>([]);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [clientType, setClientType] = useState("New");
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [dupResult, setDupResult] = useState<DuplicateCheckResult | null>(null);
  const [dupPending, setDupPending] = useState<{ withPrint: boolean } | null>(null);


  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  // Audit trail: which recommendation / quotation this bill came from.
  const [quotationLink, setQuotationLink] = useState<{
    quotation_id: string; prescription_id: string | null; encounter_id: string | null;
    recommendation_id?: string | null;
  } | null>(null);
  // Audit trail: pharmacy product order this bill dispenses.
  const [productOrderLink, setProductOrderLink] = useState<{
    product_order_id: string; dispensed_by: string | null;
  } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editingNo, setEditingNo] = useState<string | null>(null);
  // Package cascade auto-booking (relocated from Quick Book calendar)
  const [autoSessions, setAutoSessions] = useState<number>(0);
  const [autoServiceId, setAutoServiceId] = useState<string>("none");
  const [autoStartDate, setAutoStartDate] = useState<string>(new Date().toISOString().slice(0, 10));




  // Prefill from a Reception billing hand-off (Final Bill / Product Bill → /pos?visit=ID)
  // or from an Invoice edit request (/pos?edit=INVOICE_ID).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("visit");
    const eid = params.get("edit");
    const nameParam = params.get("name");
    if (nameParam) {
      setCustName(nameParam);
      setCustPhone(params.get("phone") ?? "");
      setClientType("Existing");
    }
    if (eid) {
      (async () => {
        const [{ data: inv }, { data: ls }, { data: cons }] = await Promise.all([
          supabase.from("invoices").select("*").eq("id", eid).maybeSingle(),
          supabase.from("invoice_lines").select("*").eq("invoice_id", eid).order("created_at"),
          supabase.from("service_consumption").select("*").eq("invoice_id", eid),
        ]);
        if (!inv) return toast.error("Invoice not found");
        if (inv.voided_at) return toast.error("This invoice is already voided.");
        if (inv.source === "receipt") return toast.error("Balance-clearance receipts cannot be edited.");
        setEditId(inv.id);
        setEditingNo(inv.invoice_no ?? null);
        setCustName(inv.customer_name ?? "");
        setStateCode(inv.state_code ?? "06");
        setTaxMode((inv.tax_mode as "inclusive" | "exclusive") ?? "inclusive");
        setPaymentMode(inv.payment_mode ?? "Cash");
        setInvoiceDate(inv.invoice_date ?? new Date().toISOString().slice(0, 10));
        setDiscount(Number(inv.discount_amount ?? 0));
        setDiscountType("amount");
        setPaidAmount(String(Number(inv.paid_amount ?? 0)));
        setClientType("Existing");
        // Look up phone via customer
        if (inv.customer_id) {
          const { data: c } = await supabase.from("customers").select("phone").eq("id", inv.customer_id).maybeSingle();
          if (c?.phone) setCustPhone(c.phone);
        }
        const hydrated: Line[] = (ls ?? []).map((l) => {
          const lc = (cons ?? []).filter((cx) => cx.invoice_line_id === l.id);
          return {
            id: crypto.randomUUID(),
            db_id: l.id,
            description: l.description ?? "",
            sac_code: l.sac_code ?? "",
            qty: Number(l.qty) || 1,
            unit_price: Number(l.unit_price) || 0,
            discount_type: ((l as unknown as { discount_type?: string }).discount_type === "percent" ? "percent" : "amount") as "amount" | "percent",
            discount_value: Number((l as unknown as { discount_value?: number }).discount_value ?? 0),
            session_label: l.session_label ?? "",
            package_id: l.package_id ?? "",
            is_complimentary: Boolean((l as unknown as { is_complimentary?: boolean }).is_complimentary),
            consume_today: true,
            category: normalizeCategory((l as unknown as { item_category?: string }).item_category) ?? "service",

            consumed: lc.map((c) => ({
              id: crypto.randomUUID(),
              item_id: c.item_id ?? "",
              item_name: c.item_name ?? "",
              qty_used: Number(c.qty_used) || 0,
              unit_cost: Number(c.unit_cost) || 0,
              stock_qty: 0,
            })),
          };
        });
        setLines(hydrated.length ? hydrated : [newLine()]);
        toast.info(`Editing ${inv.invoice_no} — saving updates this invoice in place, keeping the same number.`);
      })();
      return;
    }
    // Hand-off from the Pharmacy (/pos?product_order=ID).
    const poid = params.get("product_order");
    if (poid) {
      (async () => {
        const [{ data: po }, { data: already }] = await Promise.all([
          supabase
            .from("product_orders")
            .select("id, customer_name, customer_phone, encounter_id, quotation_id, assigned_to, items_json, total_amount, status")
            .eq("id", poid)
            .maybeSingle(),
          supabase
            .from("invoices")
            .select("invoice_no")
            .eq("product_order_id", poid)
            .is("voided_at", null)
            .maybeSingle(),
        ]);
        if (!po) return toast.error("Product order not found");
        if (already) return toast.error(`This pharmacy order is already billed on ${already.invoice_no}.`);
        if (po.status === "cancelled") return toast.error("This pharmacy order was cancelled.");
        const its = (Array.isArray(po.items_json) ? po.items_json : []) as {
          name?: string; quantity?: number; unit_price?: number;
        }[];
        setProductOrderLink({ product_order_id: po.id, dispensed_by: po.assigned_to ?? null });

        if (po.quotation_id) {
          setQuotationLink({ quotation_id: po.quotation_id, prescription_id: null, encounter_id: po.encounter_id ?? null });
        }
        setCustName(po.customer_name ?? "");
        setCustPhone(po.customer_phone ?? "");
        setClientType("Existing");
        if (its.length) {
          setLines(its.map((it) => ({
            ...newLine(),
            description: String(it.name ?? ""),
            qty: Number(it.quantity ?? 1) || 1,
            unit_price: Number(it.unit_price ?? 0) || 0,
            category: "product" as const,
          })));
        }
        toast.info("Pre-filled from the pharmacy order — review before saving.");
      })();
      return;
    }
    // Hand-off straight from the Counselor room (/pos?quotation=ID).
    const qid = params.get("quotation");
    if (qid) {
      (async () => {
        const { data: q } = await supabase
          .from("counselor_quotations")
          .select("id, customer_name, prescription_id, encounter_id, recommendation_id, items_json, discount_amount, visit_id")
          .eq("id", qid)
          .maybeSingle();
        if (!q) return toast.error("Quotation not found");
        const its = (Array.isArray(q.items_json) ? q.items_json : []) as {
          name?: string; quantity?: number; counselor_quoted_price?: number; quoted_price?: number;
        }[];
        setQuotationLink({
          quotation_id: q.id,
          prescription_id: q.prescription_id ?? null,
          encounter_id: q.encounter_id ?? null,
          recommendation_id: (q as { recommendation_id?: string | null }).recommendation_id ?? null,
        });
        if (q.visit_id) setVisitId(q.visit_id);
        if (q.customer_name) { setCustName(q.customer_name); setClientType("Existing"); }
        if (its.length) {
          setLines(its.map((it) => ({
            ...newLine(),
            description: String(it.name ?? ""),
            qty: Number(it.quantity ?? 1) || 1,
            unit_price: Number(it.counselor_quoted_price ?? it.quoted_price ?? 0) || 0,
          })));
        }
        if (Number(q.discount_amount ?? 0) > 0) {
          setDiscount(Number(q.discount_amount));
          setDiscountType("amount");
        }
        toast.info("Pre-filled from the counselor's quotation — review before saving.");
      })();
      return;
    }
    if (!id) return;
    (async () => {
      const { data: v } = await supabase.from("patient_visits").select("*").eq("id", id).maybeSingle();
      if (!v) return;
      setVisitId(v.id);
      setCustName(v.customer_name ?? "");
      setCustPhone(v.phone ?? "");
      setClientType("Existing");

      // A counselor quotation, when there is one, is the priced source of truth
      // for this hand-off; staff can still adjust anything before saving.
      const { data: quote } = await supabase
        .from("counselor_quotations")
        .select("id, prescription_id, encounter_id, items_json, discount_amount, status")
        .eq("visit_id", v.id)
        .in("status", ["accepted", "sent_to_patient", "converted_to_invoice"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const quoteItems = (Array.isArray(quote?.items_json) ? quote?.items_json : []) as {
        name?: string; quantity?: number; quoted_price?: number; discount_amount?: number;
      }[];

      if (quote && quoteItems.length) {
        setQuotationLink({
          quotation_id: quote.id,
          prescription_id: quote.prescription_id ?? null,
          encounter_id: quote.encounter_id ?? null,
        });
        setLines(quoteItems.map((it) => ({
          ...newLine(),
          description: String(it.name ?? ""),
          qty: Number(it.quantity ?? 1) || 1,
          unit_price: Number(it.quoted_price ?? 0) || 0,
          discount_type: "amount" as const,
          discount_value: Number(it.discount_amount ?? 0) || 0,
        })));
        if (Number(quote.discount_amount ?? 0) > 0) {
          setDiscount(Number(quote.discount_amount));
          setDiscountType("amount");
        }
        toast.info("Pre-filled from the counselor's quotation — review before saving.");
        return;
      }

      const items = (Array.isArray(v.bill_items) ? v.bill_items : []) as { name?: string; rate?: number; qty?: number }[];
      if (items.length) {
        setLines(items.map((it) => ({
          ...newLine(), description: String(it.name ?? ""), qty: Number(it.qty ?? 1) || 1, unit_price: Number(it.rate ?? 0) || 0,
        })));
      }
    })();
  }, []);


  const qc = useQueryClient();
  // Live stock in the POS product picker.
  useRealtimeSync(["inventory", "inventory_batches"], ["inventory-pos"]);
  const [quickAdd, setQuickAdd] = useState<{ lineId: string; term: string } | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services-pos"],
    queryFn: async () => (await supabase.from("services_master").select("id, name, sac_code, default_price").eq("active", true).order("name")).data ?? [],
  });
  const { data: inventory } = useQuery({
    queryKey: ["inventory-pos"],
    queryFn: async () => ((await supabase.from("inventory").select("id, name, rate, stock").eq("active", true).order("name")).data ?? []).map((r) => ({ id: r.id, name: r.name, sale_price: r.rate, cost_price: r.rate, stock_qty: r.stock })),
  });
  // Live masters index used to auto-tag every billed line with its strict category.
  const { data: catalogIdx } = useCatalogIndex();

  // Existing customer directory for the searchable lookup (Client Type = Existing).
  const { data: customersList } = useQuery({
    queryKey: ["customers-pos-lookup"],
    queryFn: async () => (await supabase.from("customers").select("id, name, phone, state_code").order("name")).data ?? [],
  });

  function loadExistingCustomer(id: string) {
    const c = (customersList ?? []).find((x) => x.id === id);
    if (!c) return;
    setCustName(c.name ?? "");
    setCustPhone(c.phone ?? "");
    if (c.state_code) setStateCode(c.state_code);
    toast.success(`Loaded ${c.name}`);
  }

  // Packages of the matched customer (by name) for session auto-increment
  const { data: custPackages } = useQuery({
    queryKey: ["cust-packages-pos", custName.trim().toLowerCase()],
    enabled: custName.trim().length > 1,
    queryFn: async () => {
      const { data: cust } = await supabase.from("customers").select("id").ilike("name", custName.trim()).limit(1).maybeSingle();
      if (!cust) return [];
      return (await supabase.from("treatment_packages").select("id, package_name, sessions_completed, total_sessions").eq("customer_id", cust.id)).data ?? [];
    },
  });

  // Automatic Outstanding Ledger — pending balance across the client's LIVE invoices only.
  // Voided/replaced invoices are excluded (they are superseded, their dues are not real),
  // and a name with no customer record returns 0 so deleted clients can't show a ghost balance.
  const { data: outstanding } = useQuery({
    queryKey: ["cust-outstanding-pos", custName.trim().toLowerCase()],
    enabled: custName.trim().length > 1,
    queryFn: async () => {
      const name = custName.trim();
      const { data: cust } = await supabase.from("customers").select("id").ilike("name", name).limit(1).maybeSingle();
      if (!cust) return 0;
      const { data: rows } = await supabase
        .from("invoices")
        .select("pending_balance")
        .is("voided_at", null)
        .or(`customer_id.eq.${cust.id},customer_name.ilike.${name}`);
      return round2((rows ?? []).reduce((s, r) => s + Number(r.pending_balance || 0), 0));
    },
  });

  // Standalone balance clearance — no new services required, just collect against old dues.
  function startBalanceClearance() {
    const amt = Number(outstanding) || 0;
    if (amt <= 0) return;
    setLines([newLine()]);
    setPaidAmount(String(amt));
    setPaymentMode((m) => m || "Cash");
    toast.success(`Balance clearance ready — ${inr2(amt)}. Adjust Amount Paid & Save Receipt.`);
  }

  // Reduce prior outstanding invoices (FIFO) by the amount collected against old dues.
  async function reduceOutstanding(name: string, excludeId: string, amount: number) {
    let remaining = round2(amount);
    const { data: rows } = await supabase
      .from("invoices")
      .select("id, pending_balance, paid_amount")
      .is("voided_at", null)
      .ilike("customer_name", name.trim())
      .gt("pending_balance", 0)
      .neq("id", excludeId)
      .order("created_at", { ascending: true });
    for (const r of rows ?? []) {
      if (remaining <= 0) break;
      const pend = Number(r.pending_balance) || 0;
      const cut = Math.min(pend, remaining);
      await supabase
        .from("invoices")
        .update({ pending_balance: round2(pend - cut), paid_amount: round2((Number(r.paid_amount) || 0) + cut) })
        .eq("id", r.id);
      remaining = round2(remaining - cut);
    }
  }


  const totals = useMemo(() => {
    let base = 0, cgst = 0, sgst = 0, gross = 0, lineDiscount = 0, listGross = 0;
    for (const l of lines) {
      const m = lineMath(l, taxMode);
      base += m.t.base; cgst += m.t.cgst; sgst += m.t.sgst; gross += m.t.gross;
      lineDiscount += m.discount; listGross += m.gross;
    }
    return {
      base: round2(base), cgst: round2(cgst), sgst: round2(sgst), gross: round2(gross),
      lineDiscount: round2(lineDiscount), listGross: round2(listGross),
    };
  }, [lines, taxMode]);

  /** OPD (doctor consultation) gross on this bill — SACRED: never discounted. */
  const opdGross = useMemo(
    () => round2(lines.filter((l) => l.category === "consultation").reduce((s, l) => s + lineMath(l, taxMode).t.gross, 0)),
    [lines, taxMode],
  );
  /** The invoice-level discount may only eat into Services + Products. */
  const maxBillDiscount = useMemo(() => Math.max(0, round2(totals.gross - opdGross)), [totals.gross, opdGross]);

  // Apply discount (flat amount or percentage) and scale tax components proportionally.
  const final = useMemo(() => {
    const raw = discountType === "percent" ? round2((totals.gross * discount) / 100) : round2(discount);
    // SACRED OPD RULE — the consultation fee is always billed & reported at 100%.
    const discountAmount = Math.min(Math.max(raw, 0), maxBillDiscount);
    const net = Math.max(0, round2(totals.gross - discountAmount));
    const factor = totals.gross > 0 ? net / totals.gross : 0;
    return {
      discountAmount,
      requestedDiscount: raw,
      cappedByOpd: raw > discountAmount,
      lineDiscount: totals.lineDiscount,
      totalDiscount: round2(totals.lineDiscount + discountAmount),
      base: round2(totals.base * factor),
      cgst: round2(totals.cgst * factor),
      sgst: round2(totals.sgst * factor),
      gross: net,
    };
  }, [totals, discount, discountType, maxBillDiscount]);

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /** Strict auto-tag from the live masters; the user can still override per line. */
  function autoCategory(description: string, sacCode?: string | null): ItemCategory {
    if ((sacCode ?? "").trim() === "999312") return "consultation";
    if (!catalogIdx) return "service";
    return classifyDescription(description, catalogIdx);
  }

  function pickCatalog(id: string, value: string) {
    if (value.startsWith("svc:")) {
      const s = services?.find((x) => x.name === value.slice(4));
      if (s) updateLine(id, { description: s.name, sac_code: s.sac_code, unit_price: Number(s.default_price) || 0, category: autoCategory(s.name, s.sac_code) });
    } else if (value.startsWith("inv:")) {
      const it = inventory?.find((x) => x.name === value.slice(4));
      if (it) updateLine(id, { description: it.name, sac_code: "", unit_price: Number(it.sale_price) || 0, category: "product" });
    }
  }


  function addConsumed(lineId: string, itemName: string) {
    const it = inventory?.find((x) => x.name === itemName);
    if (!it) return;
    setLines((ls) => ls.map((l) => l.id === lineId
      ? { ...l, consumed: [...l.consumed, { id: crypto.randomUUID(), item_id: it.id, item_name: it.name, qty_used: 1, unit_cost: Number(it.cost_price) || 0, stock_qty: Number(it.stock_qty) || 0 }] }
      : l));
  }
  function updateConsumed(lineId: string, cid: string, qty: number) {
    setLines((ls) => ls.map((l) => l.id === lineId
      ? { ...l, consumed: l.consumed.map((c) => c.id === cid ? { ...c, qty_used: qty } : c) }
      : l));
  }
  function removeConsumed(lineId: string, cid: string) {
    setLines((ls) => ls.map((l) => l.id === lineId ? { ...l, consumed: l.consumed.filter((c) => c.id !== cid) } : l));
  }

  /**
   * Deduct billed physical products (matched against the product master) from stock.
   * Optimistic: the on-screen stock number drops immediately, then the server FIFO
   * routine confirms (or the cache rolls back on failure).
   */
  async function deductProductLines(billed: Line[], invoiceNo: string) {
    const items: { inventory_id: string; qty: number }[] = [];
    for (const l of billed) {
      const match = (inventory ?? []).find(
        (it) => it.name.trim().toLowerCase() === l.description.trim().toLowerCase(),
      );
      if (match && l.qty > 0) items.push({ inventory_id: match.id, qty: l.qty });
    }
    if (items.length) await commitStockMovement(qc, items, "POS Sales", "POS Billing", `Invoice ${invoiceNo}`);
  }

  /** Newly created master item drops straight into the open bill line. */
  function applyQuickAdd(lineId: string, item: QuickAddResult) {
    updateLine(lineId, { description: item.name, sac_code: item.sac_code, unit_price: item.price, category: autoCategory(item.name, item.sac_code) });
  }

  /**
   * Zero-tolerance stock guard — a checkout can never oversell the master inventory.
   * Counts both billed product lines and per-service consumption of the same item.
   */
  function stockShortage(billed: Line[]): string | null {
    const needed = new Map<string, number>();
    for (const l of billed) {
      const match = (inventory ?? []).find((it) => it.name.trim().toLowerCase() === l.description.trim().toLowerCase());
      if (match && l.qty > 0) needed.set(match.id, (needed.get(match.id) ?? 0) + Number(l.qty));
      for (const c of l.consumed) {
        if (c.item_id && c.qty_used > 0) needed.set(c.item_id, (needed.get(c.item_id) ?? 0) + Number(c.qty_used));
      }
    }
    for (const [id, qty] of needed) {
      const it = (inventory ?? []).find((x) => x.id === id);
      if (!it) continue;
      const available = Number(it.stock_qty) || 0;
      if (qty > available) {
        return `Insufficient Stock in Master Inventory — ${it.name} (requested ${qty}, available ${available})`;
      }
    }
    return null;
  }

  async function saveInvoice(opts: {
    withPrint: boolean;
    skipDuplicateCheck?: boolean;
    duplicateAck?: { invoiceId: string; reason: string } | null;
  }) {
    if (!custName.trim()) return toast.error("Enter customer name");
    const realLines = lines.filter((l) => l.description.trim() && l.qty > 0);
    const clearanceAmt = round2(Number(paidAmount) || 0);
    const receiptMode = realLines.length === 0;
    if (receiptMode && clearanceAmt <= 0) return toast.error("Add a line item, or enter an Amount Paid to clear the outstanding balance");
    if (!receiptMode) {
      const shortage = stockShortage(realLines);
      if (shortage) return toast.error(shortage);
    }
    // Server-side duplicate detection — runs for new sales and revisions alike.
    if (!receiptMode && !opts.skipDuplicateCheck) {
      const res = await checkDuplicateBill({
        customer_name: custName.trim(),
        phone: custPhone || null,
        invoice_date: invoiceDate,
        gross_total: final.gross,
        payment_mode: paymentMode,
        lines: realLines.map((l) => ({ description: l.description.trim() })),
        exclude_invoice_id: editId,
      });
      if (res.level !== "none") {
        const top = res.matches[0];
        setDupResult(res);
        setDupPending({ withPrint: opts.withPrint });
        void logBillingEvent({
          event_type: "duplicate_warned",
          matched_invoice_id: top?.invoice_id ?? null,
          matched_invoice_no: top?.invoice_no ?? null,
          match_level: res.level,
          match_score: top?.score ?? null,
          match_reasons: top?.reasons ?? null,
          customer_name: custName.trim(),
          phone: custPhone || null,
          amount: final.gross,
          entry_point: "pos",
        });
        return;
      }
    }
    setSaving(true);

    setSaving(true);


    try {
      let customerId: string | null = null;
      const { data: existing } = await supabase.from("customers").select("id").ilike("name", custName.trim()).limit(1).maybeSingle();
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: created } = await supabase
          .from("customers")
          .insert({ name: custName.trim(), phone: custPhone || null, state_code: stateCode, client_type: clientType })
          .select("id").single();
        customerId = created?.id ?? null;
      }

      // Pure balance-clearance receipt carries no new GST; it settles old dues.
      const clearanceLine: Line = { ...newLine(), description: "Pending Balance Clearance (Receipt)", qty: 1, unit_price: clearanceAmt };
      const valid = receiptMode ? [clearanceLine] : realLines;
      const fin = receiptMode
        ? { base: clearanceAmt, cgst: 0, sgst: 0, discountAmount: 0, gross: clearanceAmt }
        : final;
      const validSplits = paySplits.filter((s) => s.amount > 0);
      const splitPaid = round2(validSplits.reduce((a, s) => a + s.amount, 0));
      const paid = receiptMode
        ? clearanceAmt
        : validSplits.length > 0
          ? splitPaid
          : (paidAmount === "" ? final.gross : Number(paidAmount));
      const effectiveMode = validSplits.length > 0
        ? validSplits.map((s) => `${s.mode} ${round2(s.amount)}`).join(" + ")
        : paymentMode;

      // ---------- EDIT MODE (in-place) ----------
      // Editing keeps the SAME invoice row and the SAME invoice number. Lines are
      // diffed server-side (update in place / insert / delete) and inventory +
      // Sales voucher are reconciled atomically inside edit_invoice().
      if (editId && !receiptMode) {
        // Check 1 — general edit confirmation, shown once per save attempt.
        const proceedGeneral = window.confirm(
          "You are modifying an existing bill. This will affect accounting. Do you want to proceed?"
        );
        if (!proceedGeneral) { setSaving(false); return; }

        const editLinePayload = valid.map((l) => {
          const m = lineMath(l, taxMode);
          const match = (inventory ?? []).find(
            (it) => it.name.trim().toLowerCase() === l.description.trim().toLowerCase(),
          );
          return {
            db_id: l.db_id, // null => INSERT, present => UPDATE in place; anything not listed here gets DELETEd server-side
            description: l.description.trim(),
            sac_code: l.sac_code || null,
            qty: l.qty,
            unit_price: m.price,
            discount_type: l.discount_type,
            discount_value: l.is_complimentary ? 0 : (l.discount_value || 0),
            discount_amount: m.discount,
            base_amount: m.t.base, cgst: m.t.cgst, sgst: m.t.sgst, line_total: m.t.gross,
            session_label: l.session_label || null,
            package_id: l.package_id || null,
            is_complimentary: l.is_complimentary,
            item_category: l.category,
            inventory_id: l.category === "product" ? (match?.id ?? null) : null,
          };
        });

        // Check 2 — server-verified: which currently-removed lines have a package wallet
        // with sessions already consumed. Ask BEFORE attempting the save so the user sees
        // the real numbers, not a generic warning.
        const keptIds = editLinePayload.map((l) => l.db_id).filter((x): x is string => !!x);
        const { data: impact } = await supabase.rpc("invoice_removed_lines_impact", {
          p_invoice_id: editId,
          p_kept_line_ids: keptIds,
        });
        let forceRemove = false;
        const impactRows = (impact as { description: string; service_name: string; consumed_sessions: number; total_sessions: number }[] | null) ?? [];
        if (impactRows.length > 0) {
          const names = impactRows.map((r) => `${r.description} (${r.consumed_sessions}/${r.total_sessions} sessions used)`).join(", ");
          const typed = window.prompt(
            `Warning: The customer has already consumed sessions from this package (${names}). ` +
            `Deleting this item will wipe their session history. Type "CONFIRM" to proceed, or Cancel.`
          );
          if (typed !== "CONFIRM") { setSaving(false); return; }
          forceRemove = true;
        }

        const { error: editErr } = await supabase.rpc("edit_invoice", {
          p_invoice_id: editId,
          p_header: {
            customer_id: customerId, customer_name: custName.trim(),
            invoice_date: invoiceDate, state_code: stateCode, tax_mode: taxMode,
            payment_mode: effectiveMode,
            base_amount: fin.base, cgst: fin.cgst, sgst: fin.sgst,
            discount_amount: fin.discountAmount, gross_total: fin.gross,
            paid_amount: paid,
          },
          p_lines: editLinePayload,
          p_force_remove: forceRemove,
          p_splits: validSplits.length > 0 ? validSplits.map((s) => ({ mode: s.mode, amount: round2(s.amount) })) : null,
        });
        if (editErr) {
          // Defense in depth: if the block fires here (race condition / stale client state),
          // surface it as the same typed-CONFIRM flow instead of a raw error toast.
          const raw = editErr.message ?? "";
          if (raw.startsWith("WALLET_CONSUMED_BLOCK:")) {
            toast.error("Some removed items still have consumed package sessions — please re-check and try again.");
          } else {
            toast.error(raw || "Failed to save invoice");
          }
          setSaving(false);
          return;
        }

        invalidateInventory(qc);
        invalidateLedger(qc);
        setLastInvoiceId(editId);
        const savedNo = editingNo ?? "";
        setEditId(null); setEditingNo(null);
        toast.success(`Invoice ${savedNo} updated.`);
        if (opts.withPrint) {
          printTallyInvoice(
            {
              invoice_no: savedNo, invoice_date: invoiceDate, customer_name: custName.trim(), customer_phone: custPhone,
              state_code: stateCode, payment_mode: effectiveMode, tax_mode: taxMode,
              base_amount: fin.base, cgst: fin.cgst, sgst: fin.sgst, discount_amount: fin.discountAmount,
              gross_total: fin.gross, paid_amount: paid, pending_balance: round2(fin.gross - paid),
              session_note: valid.map((l) => l.session_label).filter(Boolean).join(" · ") || null,
            },
            editLinePayload.map((r) => ({
              description: r.description, sac_code: r.sac_code, qty: Number(r.qty),
              discount_amount: Number(r.discount_amount),
              base_amount: Number(r.base_amount), cgst: Number(r.cgst), sgst: Number(r.sgst),
              line_total: Number(r.line_total), session_label: r.session_label,
            })),
          );
        }
        return editId;
      }
      // ---------- END EDIT MODE ----------


      const invoiceNo = `MG-${Date.now().toString().slice(-8)}`;

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          invoice_no: invoiceNo,
          customer_id: customerId,
          customer_name: custName.trim(),
          invoice_date: invoiceDate,
          state_code: stateCode,
          tax_mode: taxMode,
          payment_mode: effectiveMode,
          base_amount: fin.base,
          cgst: fin.cgst,
          sgst: fin.sgst,
          discount_amount: fin.discountAmount,
          gross_total: fin.gross,
          paid_amount: paid,
          pending_balance: round2(fin.gross - paid),
          source: receiptMode ? "receipt" : "pos",
          quotation_id: quotationLink?.quotation_id ?? null,
          prescription_id: quotationLink?.prescription_id ?? null,
          encounter_id: quotationLink?.encounter_id ?? null,
          recommendation_id: quotationLink?.recommendation_id ?? null,
          product_order_id: productOrderLink?.product_order_id ?? null,
          dispensed_by: productOrderLink?.dispensed_by ?? null,
          dispensed_at: productOrderLink ? new Date().toISOString() : null,
          invoice_type: productOrderLink ? "products" : undefined,
        })
        .select("id").single();
      if (invErr) throw invErr;

      // Ledger clearance: apply a pure receipt against the client's oldest outstanding invoices.
      if (receiptMode && paid > 0) await reduceOutstanding(custName, inv.id, paid);

      const lineRows = valid.map((l) => {
        if (receiptMode) {
          return {
            invoice_id: inv.id, description: l.description.trim(), sac_code: null,
            qty: 1, unit_price: l.unit_price, discount_type: "amount" as const, discount_value: 0, discount_amount: 0,
            base_amount: l.unit_price, cgst: 0, sgst: 0,
            line_total: l.unit_price, session_label: null, package_id: null, is_complimentary: false,
            item_category: "service" as const,
          };
        }
        const m = lineMath(l, taxMode);
        return {
          invoice_id: inv.id,
          description: l.description.trim(),
          sac_code: l.sac_code || null,
          qty: l.qty,
          unit_price: m.price,
          discount_type: l.discount_type,
          discount_value: l.is_complimentary ? 0 : (l.discount_value || 0),
          discount_amount: m.discount,
          base_amount: m.t.base,
          cgst: m.t.cgst,
          sgst: m.t.sgst,
          line_total: m.t.gross,
          session_label: l.session_label || null,
          package_id: l.package_id || null,
          is_complimentary: l.is_complimentary,
          item_category: l.category,

        };
      });
      const { data: savedLines, error: lineErr } = await supabase.from("invoice_lines").insert(lineRows).select("id");
      if (lineErr) throw lineErr;

      // "Service taken today?" — the DB auto-creates a wallet for qty>1 lines and marks
      // session 1 consumed on billing day. When the toggle is OFF we undo that initial
      // redemption so the full purchased quantity sits unconsumed in the wallet.
      if (!receiptMode && savedLines?.length) {
        const deferredIds = valid
          .map((l, i) => (!l.consume_today ? savedLines[i]?.id : null))
          .filter(Boolean) as string[];
        if (deferredIds.length) {
          const { data: defWallets } = await supabase
            .from("service_wallets").select("id").in("invoice_line_id", deferredIds);
          const wIds = (defWallets ?? []).map((w) => w.id);
          if (wIds.length) {
            await supabase.from("wallet_redemptions").delete().in("wallet_id", wIds).eq("is_initial", true);
          }
        }
        // Sessions rendered today get a clinical history record dated to the invoice.
        const todayLines = valid.filter((l) => l.consume_today && l.description.trim());
        if (todayLines.length) {
          await logTreatmentSessions({
            patientName: custName.trim(),
            treatment: todayLines.map((l) => l.description.trim()).join(", "),
            therapist: null,
            dates: [invoiceDate],
          }).catch(() => undefined);
        }
      }

      // Product consumption per line + stock decrement
      const consumptionRows: {
        invoice_id: string; invoice_line_id: string | null; service_name: string;
        item_id: string; item_name: string; qty_used: number; unit_cost: number; total_cost: number;
      }[] = [];
      const allConsumed: { item_id: string; qty_used: number; stock_qty: number }[] = [];
      valid.forEach((l, idx) => {
        const lineId = savedLines?.[idx]?.id;
        for (const c of l.consumed) {
          if (!c.item_id || c.qty_used <= 0) continue;
          consumptionRows.push({
            invoice_id: inv.id,
            invoice_line_id: lineId ?? null,
            service_name: l.description.trim(),
            item_id: c.item_id,
            item_name: c.item_name,
            qty_used: c.qty_used,
            unit_cost: c.unit_cost,
            total_cost: round2(c.qty_used * c.unit_cost),
          });
          allConsumed.push({ item_id: c.item_id, qty_used: c.qty_used, stock_qty: c.stock_qty });
        }
      });
      if (consumptionRows.length) await supabase.from("service_consumption").insert(consumptionRows);
      if (allConsumed.length) {
        await commitStockMovement(
          qc,
          allConsumed.map((c) => ({ inventory_id: c.item_id, qty: c.qty_used })),
          "Service Consumed",
          "POS Consumption",
          `Invoice ${invoiceNo}`,
        );
      }
      // Physical product lines leave the shelf too — FIFO batch deduction + ledger.
      await deductProductLines(valid, invoiceNo);
      invalidateInventory(qc);
      invalidateLedger(qc);

      // Auto-post Sales + Receipt vouchers
      await postSaleVouchers({
        id: inv.id, invoice_no: invoiceNo, invoice_date: invoiceDate, customer_name: custName.trim(),
        base_amount: fin.base, cgst: fin.cgst, sgst: fin.sgst, gross_total: fin.gross,
        paid_amount: paid, payment_mode: effectiveMode,
          splits: validSplits.map((s) => ({ mode: s.mode, amount: round2(s.amount) })),
      });

      // Package session auto-increment
      const pkgIds = valid.map((l) => l.package_id).filter(Boolean);
      if (pkgIds.length) await incrementPackages(pkgIds);

      toast.success(`Invoice ${invoiceNo} saved · ${inr2(fin.gross)} · vouchers posted`);
      setLastInvoiceId(inv.id);

      if (opts.withPrint) {
        printTallyInvoice(
          {
            invoice_no: invoiceNo, invoice_date: invoiceDate, customer_name: custName.trim(), customer_phone: custPhone,
            state_code: stateCode, payment_mode: effectiveMode, tax_mode: taxMode,
            base_amount: fin.base, cgst: fin.cgst, sgst: fin.sgst, discount_amount: fin.discountAmount, gross_total: fin.gross,
            paid_amount: paid, pending_balance: round2(fin.gross - paid),
            session_note: valid.map((l) => l.session_label).filter(Boolean).join(" · ") || null,
          },
          lineRows.map((r) => ({
            description: String(r.description), sac_code: r.sac_code as string | null, qty: Number(r.qty),
            discount_amount: Number(r.discount_amount ?? 0),
            base_amount: Number(r.base_amount), cgst: Number(r.cgst), sgst: Number(r.sgst),
            line_total: Number(r.line_total), session_label: r.session_label as string | null,
          })),
        );
      }


      // Close the originating visit (Reception hand-off) so it leaves the live board.
      if (visitId) await supabase.from("patient_visits").update({ status: "done" }).eq("id", visitId);
      if (quotationLink?.quotation_id) {
        await supabase.from("counselor_quotations")
          .update({ status: "converted_to_invoice" })
          .eq("id", quotationLink.quotation_id);
      }
      if (productOrderLink?.product_order_id) {
        await supabase.from("product_orders")
          .update({
            status: "completed",
            payment_status: paid >= round2(fin.gross) ? "paid" : paid > 0 ? "partial" : "pending",
            completed_at: new Date().toISOString(),
            completed_by: user?.id ?? null,
            total_amount: round2(fin.gross),
          })
          .eq("id", productOrderLink.product_order_id);
        // Close the dispensing audit trail for this order.
        await supabase.from("pharmacist_order_items")
          .update({ status: "dispensed" })
          .eq("order_id", productOrderLink.product_order_id);
      }


      // ---- Multi-session package cascade (relocated from Quick Book) ----
      if (autoSessions > 1) {
        try {
          const { data: cust } = await supabase.from("customers")
            .select("id").ilike("name", custName.trim()).limit(1).maybeSingle();
          if (cust) {
            const svc = (services ?? []).find((s) => s.name === autoServiceId);
            const pkgName = svc?.name ?? valid[0]?.description ?? "Auto-scheduled Package";
            const { data: pkg } = await supabase.from("cos_treatment_packages").insert({
              patient_id: cust.id, package_name: pkgName,
              total_sessions: autoSessions, sessions_completed: 0, outstanding_balance: 0,
            }).select("id").single();
            if (pkg) {
              const sessions = await generateAutomatedSessions(
                pkg.id, autoStartDate, autoServiceId === "none" ? null : (svc?.id ?? null),
              );
              const msg = `${sessions.length} sessions auto-scheduled for ${custName.trim()} (${pkgName}). Next: ${sessions[1]?.scheduled_date ?? sessions[0]?.scheduled_date}.`;
              await Promise.all([
                pushNotification({ target_role: "marketing", notification_type: "Auto_Scheduled_Sessions", title: "Recurring package booked", message: msg, action_url: "/appointments" }),
                pushNotification({ target_role: "reception", notification_type: "Auto_Scheduled_Sessions", title: "Recurring package booked", message: msg, action_url: "/appointments" }),
              ]);
              toast.success(`+ ${sessions.length} follow-up sessions auto-scheduled`);
            }
          }
        } catch (e) {
          toast.warning(e instanceof Error ? e.message : "Cascade failed");
        }
      }

      return inv.id as string;
    } catch (err) {
      toast.error(friendlyBillingError(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function reprintLast() {
    if (!lastInvoiceId) return toast.error("Save an invoice first, or open it from Invoices to print.");
    const [{ data: inv }, { data: ls }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", lastInvoiceId).single(),
      supabase.from("invoice_lines").select("*").eq("invoice_id", lastInvoiceId),
    ]);
    if (!inv) return toast.error("Invoice not found");
    printTallyInvoice(
      {
        invoice_no: inv.invoice_no ?? "", invoice_date: inv.invoice_date, customer_name: inv.customer_name ?? "",
        state_code: inv.state_code ?? "", payment_mode: inv.payment_mode, tax_mode: inv.tax_mode,
        base_amount: Number(inv.base_amount), cgst: Number(inv.cgst), sgst: Number(inv.sgst),
        discount_amount: Number(inv.discount_amount ?? 0), gross_total: Number(inv.gross_total),
        paid_amount: Number(inv.paid_amount ?? 0), pending_balance: Number(inv.pending_balance ?? 0),
        session_note: (ls ?? []).map((l) => l.session_label).filter(Boolean).join(" · ") || null,
      },
      (ls ?? []).map((l) => ({
        description: l.description, sac_code: l.sac_code, qty: Number(l.qty),
        discount_amount: Number((l as unknown as { discount_amount?: number }).discount_amount ?? 0),
        base_amount: Number(l.base_amount), cgst: Number(l.cgst), sgst: Number(l.sgst),
        line_total: Number(l.line_total), session_label: l.session_label,
      })),
    );
  }

  async function saveAndSendToWhatsApp() {
    const currentCustName = custName.trim();
    const currentPhone = custPhone;
    const currentLines = lines.filter((l) => l.description.trim() && l.qty > 0);
    const currentFin = final;
    const currentPayMode = paymentMode;
    const currentDate = invoiceDate;

    if (!currentCustName) return toast.error("Enter customer name");
    if (!currentLines.length) return toast.error("Add at least one service or medicine");

    const invId = await saveInvoice({ withPrint: false });
    if (!invId) return;

    // Retrieve generated invoice number
    const { data: savedInv } = await supabase
      .from("invoices")
      .select("invoice_no")
      .eq("id", String(invId))
      .maybeSingle();

    const actualInvNo = savedInv?.invoice_no || `MG-${Date.now().toString().slice(-8)}`;

    const shareData: InvoiceShareData = {
      invoiceNo: actualInvNo,
      invoiceDate: currentDate,
      customerName: currentCustName,
      customerPhone: currentPhone ? String(currentPhone) : null,
      paymentMode: currentPayMode,
      lines: currentLines.map((l) => ({
        description: l.description,
        qty: l.qty,
        rate: l.unit_price,
        total: round2(l.unit_price * l.qty),
      })),
      baseAmount: currentFin.base,
      cgst: currentFin.cgst,
      sgst: currentFin.sgst,
      grossTotal: currentFin.gross,
      paidAmount: Number(paidAmount) || currentFin.gross,
    };

    // 1. Download official branded PDF
    const fileName = downloadInvoicePdf(shareData);
    toast.success(`Generated & downloaded ${fileName}`);

    // 2. Open WhatsApp Web / App with pre-filled thank you note & breakdown
    shareInvoiceViaWhatsApp(shareData, fileName);

    // Reset cart for next client
    setLines([newLine()]);
    setPaidAmount("");
    setPaySplits([]);
  }

  if (!canBilling) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="POS — Speed Billing" subtitle="Walk-in checkout · flat 5% GST · auto voucher posting · product consumption" />
      {editId && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>
            <strong>Editing invoice {editingNo}</strong> — saving updates this invoice in place, keeping the same invoice number. Stock is reconciled only if products or quantities changed.
          </span>
          <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setEditingNo(null); toast.info("Edit cancelled — original invoice untouched."); }}>Cancel edit</Button>
        </div>
      )}
      <QuickAddDialog
        open={!!quickAdd}
        term={quickAdd?.term ?? ""}
        onOpenChange={(v) => { if (!v) setQuickAdd(null); }}
        onCreated={(item) => { if (quickAdd) applyQuickAdd(quickAdd.lineId, item); setQuickAdd(null); }}
      />
      <DuplicateBillDialog
        open={!!dupResult}
        result={dupResult}
        canOverride={billingAccess.can_override_duplicate}
        onCancel={() => { setDupResult(null); setDupPending(null); }}
        onOpenExisting={(invoiceId) => {
          setDupResult(null);
          setDupPending(null);
          navigate({ to: "/invoices", search: { open: invoiceId } as never });
        }}
        onContinue={(matchedInvoiceId, reason) => {
          const p = dupPending;
          const level = dupResult?.level ?? null;
          setDupResult(null);
          setDupPending(null);
          void logBillingEvent({
            event_type: "duplicate_overridden",
            matched_invoice_id: matchedInvoiceId,
            match_level: level,
            reason: reason || null,

            customer_name: custName.trim(),
            phone: custPhone || null,
            amount: final.gross,
            entry_point: "pos",
          });
          void saveInvoice({
            withPrint: p?.withPrint ?? false,
            skipDuplicateCheck: true,
            duplicateAck: { invoiceId: matchedInvoiceId, reason },
          });
        }}
      />


      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Customer */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Customer (B2C)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <div className="relative">
                  <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Type name — matches existing clients live" autoComplete="off" />
                  {custName.trim().length > 1 && (() => {
                    const q = custName.trim().toLowerCase();
                    const hits = (customersList ?? []).filter((c) =>
                      (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
                    ).slice(0, 6);
                    const exact = hits.find((c) => (c.name ?? "").toLowerCase() === q);
                    if (hits.length === 0 || exact) return null;
                    return (
                      <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                        {hits.map((c) => (
                          <button key={c.id} type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent"
                            onClick={() => loadExistingCustomer(c.id)}>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground">{[c.phone, c.state_code].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Place of Supply (State)</Label>
                <Select value={stateCode} onValueChange={setStateCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GST_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>
            {clientType === "Existing" && (
              <div className="mt-3 space-y-1.5">
                <Label>Search Existing Customer</Label>
                <Autocomplete
                  placeholder="Search by name to auto-fill details…"
                  searchPlaceholder="Type customer name / phone…"
                  emptyText="No matching customer."
                  options={(customersList ?? []).map((c) => ({
                    value: c.id,
                    label: c.name,
                    sublabel: [c.phone, c.state_code].filter(Boolean).join(" · ") || "No contact",
                  }))}
                  onSelect={(o) => loadExistingCustomer(o.value)}
                />
                <p className="text-xs text-muted-foreground">Selecting a customer auto-fills Name, Phone & Place of Supply.</p>
              </div>
            )}
              <div className="space-y-1.5">
                <Label>Client Type</Label>
                <Select value={clientType} onValueChange={setClientType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Existing">Existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
              </div>
            </div>
            {Number(outstanding) > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <div className="text-sm">
                  <span className="font-semibold text-destructive">Total Outstanding Balance: {inr2(Number(outstanding))}</span>
                  <p className="text-xs text-muted-foreground">Cumulative pending dues. Click to collect without adding new services.</p>
                </div>
                <Button size="sm" variant="destructive" onClick={startBalanceClearance}>
                  <Receipt className="mr-1 h-4 w-4" /> Clear Balance (Receipt)
                </Button>
              </div>
            )}
            {(custPackages?.length ?? 0) > 0 && (
              <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="mb-2 text-sm font-semibold text-primary">Active Packages</p>
                <div className="space-y-1.5">
                  {(custPackages ?? []).map((p) => {
                    const rem = Math.max(0, (p.total_sessions || 0) - (p.sessions_completed || 0));
                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span>{p.package_name}</span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {p.sessions_completed}/{p.total_sessions} done · {rem} remaining
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Link a line below to a package to auto-increment its sessions. Use “+ Add Line” to bill retail/add-ons on the same invoice.</p>
              </div>
            )}
            <WalletAlertsInline customerName={custName} />
          </Card>

          {/* Package Auto-Booking (counselor / accountant) */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Package Auto-Booking (Cascade Follow-ups)</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              After billing, create a treatment package and automatically schedule N follow-up sessions using the service's gap rule (or 20-day default). Marketing & Reception are notified.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Total Sessions</Label>
                <Input type="number" min={0} max={30} value={autoSessions}
                  onChange={(e) => setAutoSessions(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                  placeholder="0 = off" />
              </div>
              <div className="space-y-1.5">
                <Label>Service (gap rule)</Label>
                <Select value={autoServiceId} onValueChange={setAutoServiceId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (20-day default)</SelectItem>
                    {Array.from(new Map((services ?? []).map((s) => [s.name, s])).values()).map((s) => (
                      <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>First Session Date</Label>
                <Input type="date" value={autoStartDate} onChange={(e) => setAutoStartDate(e.target.value)} />
              </div>
            </div>
          </Card>



          {/* Lines */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Items / Services</h2>
              <Button size="sm" variant="outline" onClick={() => setLines((l) => [...l, newLine()])}>
                <Plus className="mr-1 h-4 w-4" /> Add Line
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((l) => {
                const m = lineMath(l, taxMode);
                const t = m.t;

                return (
                  <div key={l.id} className="rounded-lg border p-3">
                    <div className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-12">
                        <Autocomplete
                          className="h-8 text-xs"
                          placeholder="Quick pick service / product (type to search)"
                          searchPlaceholder="Type e.g. glow, LHR, serum…"
                          options={[
                            ...(services ?? []).map((s) => ({ value: `svc:${s.name}`, label: `🩺 ${s.name}`, sublabel: s.sac_code ? `SAC ${s.sac_code}` : "Service" })),
                            ...(inventory ?? []).map((it) => ({ value: `inv:${it.name}`, label: `💊 ${it.name}`, sublabel: `stk ${Number(it.stock_qty)}` })),
                          ]}
                          onSelect={(o) => pickCatalog(l.id, o.value)}
                          onCreate={(term) => setQuickAdd({ lineId: l.id, term })}
                        />
                      </div>
                      <Input className="sm:col-span-4" placeholder="Description" value={l.description}
                        onChange={(e) => updateLine(l.id, { description: e.target.value, category: autoCategory(e.target.value, l.sac_code) })} />
                      <div className="sm:col-span-3">
                        <Select value={l.category} onValueChange={(v) => updateLine(l.id, { category: v as ItemCategory })}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="consultation">🩺 OPD / Consultation</SelectItem>
                            <SelectItem value="service">✨ Service &amp; Treatment</SelectItem>
                            <SelectItem value="product">💊 Product / Pharmacy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input className="sm:col-span-2" placeholder="SAC" value={l.sac_code}
                        onChange={(e) => updateLine(l.id, { sac_code: e.target.value, category: autoCategory(l.description, e.target.value) })} />

                      <NumberInput className="sm:col-span-1" placeholder="Qty" value={l.qty} onValueChange={(v) => updateLine(l.id, { qty: v })} />
                      <NumberInput className="sm:col-span-2" placeholder="Price" value={l.unit_price} onValueChange={(v) => updateLine(l.id, { unit_price: v })} />
                      <div className="flex items-center gap-1 sm:col-span-2">
                        <NumberInput
                          className="flex-1"
                          placeholder="Disc"
                          value={l.discount_value}
                          onValueChange={(v) => updateLine(l.id, { discount_value: v })}
                          disabled={l.is_complimentary}
                        />
                        <Select
                          value={l.discount_type}
                          onValueChange={(v) => updateLine(l.id, { discount_type: v as "amount" | "percent" })}
                        >
                          <SelectTrigger className="h-9 w-14 px-2 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">₹</SelectItem>
                            <SelectItem value="percent">%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-end sm:col-span-12 md:col-span-2">
                        <div className="mr-2 text-right">
                          {m.discount > 0 && (
                            <div className="text-[10px] leading-tight text-muted-foreground line-through">{inr2(m.gross)}</div>
                          )}
                          <span className="text-sm font-semibold">{inr2(t.gross)}</span>
                          {m.discount > 0 && (
                            <div className="text-[10px] leading-tight font-medium text-emerald-600">− {inr2(m.discount)} off</div>
                          )}
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input className="sm:col-span-7" placeholder="Session tracking e.g. Session 3 of 6" value={l.session_label} onChange={(e) => updateLine(l.id, { session_label: e.target.value })} />
                      <div className="sm:col-span-5">
                        <Select value={l.package_id || "none"} onValueChange={(v) => updateLine(l.id, { package_id: v === "none" ? "" : v })}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Link package (optional)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No package</SelectItem>
                            {(custPackages ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.package_name} ({p.sessions_completed}/{p.total_sessions})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="sm:col-span-12 mt-1 flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={l.is_complimentary}
                          onChange={(e) => updateLine(l.id, { is_complimentary: e.target.checked })}
                        />
                        <span className={l.is_complimentary ? "font-semibold text-emerald-600" : "text-muted-foreground"}>
                          Complimentary / Free (₹0 · tracks inventory, no revenue)
                        </span>
                      </label>
                      <label className="sm:col-span-12 flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={l.consume_today}
                          onChange={(e) => updateLine(l.id, { consume_today: e.target.checked })}
                        />
                        <span className={l.consume_today ? "font-semibold text-primary" : "text-muted-foreground"}>
                          Mark Service as Consumed Today? {l.consume_today ? "(1 session logged today)" : "(all sessions stay in wallet)"}
                        </span>
                      </label>
                    </div>

                    {/* Products consumed sub-panel */}
                    <div className="mt-3 rounded-md bg-muted/40 p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Products Consumed in Service</span>
                        <div className="w-52">
                          <Autocomplete
                            className="h-7 text-xs"
                            placeholder="+ Add material"
                            searchPlaceholder="Type material name…"
                            options={(inventory ?? []).map((it) => ({ value: it.name, label: it.name, sublabel: `stk ${Number(it.stock_qty)}` }))}
                            onSelect={(o) => addConsumed(l.id, o.value)}
                          />
                        </div>
                      </div>
                      {l.consumed.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No materials logged for this service.</p>
                      ) : (
                        <div className="space-y-1">
                          {l.consumed.map((c) => (
                            <div key={c.id} className="flex items-center gap-2 text-xs">
                              <span className="flex-1">{c.item_name}</span>
                              <span className="text-muted-foreground">cost {inr2(c.unit_cost)}</span>
                              <NumberInput className="h-7 w-16" value={c.qty_used} onValueChange={(v) => updateConsumed(l.id, c.id, v)} />
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeConsumed(l.id, c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Tax & Payment</h2>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Button variant={taxMode === "inclusive" ? "default" : "outline"} size="sm" onClick={() => setTaxMode("inclusive")}>Inclusive of GST</Button>
              <Button variant={taxMode === "exclusive" ? "default" : "outline"} size="sm" onClick={() => setTaxMode("exclusive")}>Exclusive of GST</Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Payment Mode{paySplits.length > 0 ? " (Split)" : ""}</Label>
                  {paySplits.length === 0 ? (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => setPaySplits([newSplit(paymentMode), newSplit("UPI")])}>
                      + Split Payment
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => setPaySplits([])}>Clear splits</Button>
                  )}
                </div>
                {paySplits.length === 0 ? (
                  <PaymentModeSelect value={paymentMode} onValueChange={setPaymentMode} />
                ) : (
                  <div className="space-y-2 rounded-md border p-2">
                    {paySplits.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <div className="flex-1"><PaymentModeSelect value={s.mode} triggerClassName="h-8 flex-1"
                          onValueChange={(v) => setPaySplits((xs) => xs.map((x) => x.id === s.id ? { ...x, mode: v } : x))} /></div>
                        <NumberInput className="h-8 w-28" value={s.amount}
                          onValueChange={(v) => setPaySplits((xs) => xs.map((x) => x.id === s.id ? { ...x, amount: v } : x))} />
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                          onClick={() => setPaySplits((xs) => xs.filter((x) => x.id !== s.id))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs">
                      <Button size="sm" variant="outline" className="h-7"
                        onClick={() => setPaySplits((xs) => [...xs, newSplit("Cash")])}>
                        <Plus className="mr-1 h-3 w-3" /> Add split
                      </Button>
                      <span className="text-muted-foreground">
                        Total: {inr2(round2(paySplits.reduce((a, x) => a + x.amount, 0)))} / {inr2(final.gross)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Bill-level Discount (after item discounts)</Label>
                <div className="flex gap-2">
                  <NumberInput className="flex-1" value={discount} onValueChange={setDiscount} placeholder="0" />
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "amount" | "percent")}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">₹</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {opdGross > 0 && (
                  <p className="text-xs text-muted-foreground">
                    🩺 OPD {inr2(opdGross)} is never discounted — max bill discount {inr2(maxBillDiscount)}.
                    {final.cappedByOpd && <span className="font-semibold text-destructive"> Capped to protect the consultation fee.</span>}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Amount Paid (blank = full)</Label>
                <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={String(final.gross)} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Invoice Summary</h2>
            <dl className="space-y-2 text-sm">
              {final.lineDiscount > 0 && (
                <>
                  <Row label="Gross (before discounts)" value={inr2(totals.listGross)} />
                  <Row label="Item-wise Discounts" value={`- ${inr2(final.lineDiscount)}`} />
                </>
              )}
              <Row label="Taxable Base" value={inr2(final.base)} />
              <Row label="CGST (2.5%)" value={inr2(final.cgst)} />
              <Row label="SGST (2.5%)" value={inr2(final.sgst)} />
              {final.discountAmount > 0 && <Row label="Bill-level Discount" value={`- ${inr2(final.discountAmount)}`} />}
              <div className="my-2 h-px bg-border" />
              <div className="flex items-center justify-between text-base font-bold">
                <span>Grand Total</span><span>{inr2(final.gross)}</span>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => saveInvoice({ withPrint: false }).then((id) => { if (id) { setLines([newLine()]); setPaidAmount(""); setPaySplits([]); toast.success("Invoice saved. New cart ready."); } })} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="mr-1 h-4 w-4" />} Save
              </Button>
              <Button variant="outline" onClick={reprintLast} disabled={saving || !lastInvoiceId} title={lastInvoiceId ? "Reprint last saved invoice" : "Save an invoice first"}>
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
              <Button onClick={() => saveInvoice({ withPrint: true })} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Save & Print
              </Button>
            </div>
            <Button
              className="mt-2.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm gap-2"
              disabled={saving}
              onClick={saveAndSendToWhatsApp}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Save &amp; Send to WhatsApp (PDF + Thank You)
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">Save commits & clears; Print reprints last saved invoice; Save &amp; Print does both.</p>

          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function WalletAlertsInline({ customerName }: { customerName: string }) {
  const qc = useQueryClient();
  const { data: wallets } = useActiveWallets(customerName);
  const [redeemId, setRedeemId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!wallets || wallets.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <Wallet className="h-4 w-4" /> Active Service Wallets ({wallets.length})
      </p>
      <div className="space-y-1.5">
        {wallets.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => { setRedeemId(w.id); setOpen(true); }}
            className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-sm hover:bg-emerald-500/10"
          >
            <span>{w.service_name}</span>
            <span className="text-xs font-medium text-muted-foreground">
              {w.consumed_sessions}/{w.total_sessions} used · <span className="font-semibold text-emerald-700">{w.remaining} remaining</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Click a wallet to redeem a session — no new invoice needed.</p>
      <WalletRedeemDialog
        open={open}
        onClose={() => setOpen(false)}
        initialWalletId={redeemId}
        patientName={customerName}
        wallets={wallets.map((w) => ({
          id: w.id, service_name: w.service_name,
          total_sessions: w.total_sessions, consumed_sessions: w.consumed_sessions, remaining: w.remaining,
        }))}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["active-wallets"] });
          qc.invalidateQueries({ queryKey: ["cust-wallets"] });
          qc.invalidateQueries({ queryKey: ["package-master"] });
        }}
      />
    </div>
  );
}
