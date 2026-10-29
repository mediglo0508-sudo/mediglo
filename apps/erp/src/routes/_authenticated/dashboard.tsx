import { createFileRoute } from "@tanstack/react-router";
import { InventoryVisibilityGrid } from "@/components/InventoryVisibilityGrid";
import { MasterBackupCard } from "@/components/MasterBackupCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { inr } from "@/lib/gst";
import { Link } from "@tanstack/react-router";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  BadgeIndianRupee, Wallet, Landmark, TrendingUp, Stethoscope, ShoppingCart, Users, ClipboardList,
} from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useDashboardRange } from "@/lib/date-range-store";
import { ClientTimelineDialog, type ClientTimelineTarget } from "@/components/ClientTimelineDialog";
import { invalidateLedger } from "@/lib/ledger-cache";
import { buildCatalogIndex, lineCategory, splitInvoiceRevenue } from "@/lib/item-category";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/date-format";
import { parsePayment, type PayMode } from "@/lib/payment-parser";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Clinic Financial Dashboard — MGHYN Clinic ERP" },
      { name: "description", content: "Daily collections, revenue mix, product sales and clinic KPIs at a glance." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Clinic Financial Dashboard — MGHYN Clinic ERP" },
      { property: "og:description", content: "Daily collections, revenue mix, product sales and clinic KPIs at a glance." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/dashboard" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/dashboard" }],
  }),
  component: Dashboard,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const PAYMENT_BUCKETS = ["Cash", "UPI", "Card", "Net Banking", "SaveIn", "Razorpay", "Finance", "Credit", "Other"];

function bucketForParsedMode(mode: PayMode, raw: string): string {
  if (mode !== "UPI") return PAYMENT_BUCKETS.includes(mode) ? mode : "Other";
  // The parser maps both UPI and Net Banking keywords to "UPI"; inspect the raw token.
  if (/\b(net\s?bank(ing)?|neft|imps|rtgs|transfer)\b/i.test(raw)) return "Net Banking";
  return "UPI";
}

function bucketForRawMode(raw: string): string {
  const lower = raw.toLowerCase();
  if (/\b(cash)\b/i.test(lower)) return "Cash";
  if (/\b(razor\s?pay|razorpay|rzp)\b/i.test(lower)) return "Razorpay";
  if (/\b(finance|emi|no\s?cost\s?emi|bajaj|snapmint)\b/i.test(lower)) return "Finance";
  if (/\b(save\s?in|savein|advance|deposit)\b/i.test(lower)) return "SaveIn";
  if (/\b(credit|cr)\b/i.test(lower)) return "Credit";
  if (/\b(net\s?bank(ing)?|neft|imps|rtgs|transfer)\b/i.test(lower)) return "Net Banking";
  if (/\b(upi|gpay|google\s?pay|phonepe|paytm|bhim)\b/i.test(lower)) return "UPI";
  if (/\b(card|swipe|pos|debit|credit\s?card|visa|master(card)?)\b/i.test(lower)) return "Card";
  return "Other";
}

function Dashboard() {
  const { isFinance, hasRole, profile } = useAuth();
  if (isFinance) return <FinanceDashboard name={profile?.full_name} />;
  if (hasRole("doctor") || hasRole("counselor") || hasRole("therapist")) return <DoctorDashboard />;
  return <ReceptionDashboard />;
}

function Stat({ icon: Icon, label, value, accent, onDoubleClick, onClick }: { icon: typeof Wallet; label: string; value: string; accent?: string; onDoubleClick?: () => void; onClick?: () => void }) {
  const interactive = !!(onDoubleClick || onClick);
  return (
    <Card
      className={`flex items-center gap-4 p-5${interactive ? " cursor-pointer select-none transition hover:ring-2 hover:ring-primary/40" : ""}`}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      title={interactive ? (onClick ? "Click for detailed breakdown" : "Double-click for detailed breakdown") : undefined}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ background: accent ?? "var(--gradient-brand)" }}>
        <Icon className="h-5 w-5 text-primary-foreground" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
      </div>
    </Card>
  );
}

function FinanceDashboard({ name }: { name?: string | null }) {
  const range = useDashboardRange();
  const { data, isFetching } = useQuery({
    queryKey: ["dashboard-finance", range.from, range.to],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_no, gross_total, base_amount, cgst, sgst, discount_amount, paid_amount, pending_balance, payment_mode, customer_name, assigned_staff, invoice_date")
        // Voided/replaced invoices must never be counted twice in financial totals.
        .is("voided_at", null)
        .gte("invoice_date", range.from)
        .lte("invoice_date", range.to);
      const invoices = inv ?? [];
      const invIds = invoices.map((r) => r.id);
      const { data: exp } = await supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", range.from)
        .lte("expense_date", range.to);
      const linesRes = invIds.length
        ? await supabase
            .from("invoice_lines")
            .select("description, item_category, line_total, base_amount, invoice_id, qty, unit_price")
            .in("invoice_id", invIds)
            .limit(20000)
        : { data: [] as { description: string | null; item_category: string | null; line_total: number; base_amount: number; invoice_id: string; qty: number; unit_price: number }[] };
      const consRes = invIds.length
        ? await supabase
            .from("service_consumption")
            .select("service_name, total_cost, invoice_id")
            .limit(5000)
        : { data: [] as { service_name: string | null; total_cost: number; invoice_id: string | null }[] };
      const [prodRes, svcRes] = await Promise.all([
        supabase.from("inventory").select("name").eq("active", true),
        supabase.from("services_master").select("name, category, sac_code, cost_estimate").eq("active", true),
      ]);
      const catalog = buildCatalogIndex(prodRes.data ?? [], svcRes.data ?? []);
      const svcCostEstMap = new Map((svcRes.data ?? []).map((s: any) => [String(s.name ?? "").trim().toLowerCase(), Number(s.cost_estimate ?? 0)]));
      const invIdSet = new Set(invIds);
      const invLines = linesRes.data ?? [];
      const consumption = (consRes.data ?? []).filter((c) => !c.invoice_id || invIdSet.has(c.invoice_id));
      const invById = new Map(invoices.map((i) => [i.id, i]));
      const productLines = invLines
        .filter((l) => lineCategory(l, catalog) === "product")
        .map((l) => {
          const inv = invById.get(l.invoice_id);
          return {
            invoice_id: l.invoice_id,
            invoice_no: inv?.invoice_no ?? "—",
            invoice_date: inv?.invoice_date ?? "",
            customer_name: inv?.customer_name ?? "Walk-in",
            description: l.description ?? "—",
            qty: Number(l.qty) || 0,
            unit_price: Number(l.unit_price) || 0,
            line_total: Number(l.line_total) || 0,
          };
        })
        .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1));
      // Granular revenue split, per invoice, honouring the Sacred OPD discount rule:
      // an invoice-level discount is absorbed by Services (then Products) — never by OPD.
      const linesByInvoice = new Map<string, typeof invLines>();
      for (const l of invLines) {
        const arr = linesByInvoice.get(l.invoice_id) ?? [];
        arr.push(l);
        linesByInvoice.set(l.invoice_id, arr);
      }
      let productSales = 0;
      let serviceSales = 0;
      let consultationSales = 0;
      for (const i of invoices) {
        const s = splitInvoiceRevenue(linesByInvoice.get(i.id) ?? [], Number(i.discount_amount ?? 0), catalog);
        productSales += s.product;
        serviceSales += s.service;
        consultationSales += s.consultation;
      }
      productSales = Math.round(productSales * 100) / 100;
      serviceSales = Math.round(serviceSales * 100) / 100;
      consultationSales = Math.round(consultationSales * 100) / 100;

      const gross = invoices.reduce((s, r) => s + Number(r.gross_total), 0);
      const collected = invoices.reduce((s, r) => s + Number(r.paid_amount || r.gross_total), 0);
      const pending = invoices.reduce((s, r) => s + Number(r.pending_balance), 0);
      const tax = invoices.reduce((s, r) => s + Number(r.cgst) + Number(r.sgst), 0);
      const expenses = (exp ?? []).reduce((s, r) => s + Number(r.amount), 0);

      const modeAgg: Record<string, { value: number; count: number }> = {};
      for (const r of invoices) {
        const raw = r.payment_mode || "Cash";
        const amt = Number(r.paid_amount || r.gross_total);
        const parsed = parsePayment(raw, amt);
        if (parsed.splits.length > 0) {
          const buckets = new Set<string>();
          for (const s of parsed.splits) {
            const bucket = bucketForParsedMode(s.mode, raw);
            buckets.add(bucket);
            modeAgg[bucket] = (modeAgg[bucket] ?? { value: 0, count: 0 });
            modeAgg[bucket].value += s.amount;
          }
          for (const bucket of buckets) {
            modeAgg[bucket].count += 1;
          }
        } else {
          const bucket = bucketForRawMode(raw);
          modeAgg[bucket] = (modeAgg[bucket] ?? { value: 0, count: 0 });
          modeAgg[bucket].value += amt;
          modeAgg[bucket].count += 1;
        }
      }
      const cash = modeAgg["Cash"]?.value ?? 0;
      const bank = Math.max(0, collected - cash);

      const svcGross: Record<string, number> = {};
      const svcBomCost: Record<string, number> = {};
      for (const l of invLines) {
        const key = (l.description ?? "Misc").trim();
        const lineAmt = Number(l.line_total);
        const qty = Math.max(1, Number(l.qty) || 1);
        svcGross[key] = (svcGross[key] ?? 0) + lineAmt;
        const unitCostEst = svcCostEstMap.get(key.toLowerCase()) || Math.round((lineAmt / qty) * 0.14);
        svcBomCost[key] = (svcBomCost[key] ?? 0) + unitCostEst * qty;
      }
      const svcCost: Record<string, number> = {};
      for (const c of consumption) {
        const key = (c.service_name ?? "Misc").trim().toLowerCase();
        svcCost[key] = (svcCost[key] ?? 0) + Number(c.total_cost);
      }
      const servicePnl = Object.keys(svcGross)
        .map((k) => {
          const grossVal = Math.round(svcGross[k]);
          const costVal = Math.round(Math.max(svcCost[k.toLowerCase()] ?? 0, svcBomCost[k] ?? 0));
          return { name: k, gross: grossVal, cost: costVal, net: grossVal - costVal };
        })
        .sort((a, b) => b.gross - a.gross)
        .slice(0, 12);

      return {
        gross, collected, pending, tax, expenses, cash, bank, productSales, serviceSales, consultationSales, count: invoices.length,
        modeData: Object.entries(modeAgg)
          .filter(([, v]) => v.value > 0)
          .map(([name, v]) => ({ name, value: Math.round(v.value * 100) / 100, count: v.count }))
          .sort((a, b) => b.value - a.value),
        servicePnl,
        productLines,
        rows: invoices,
      };
    },
  });

  const d = data;
  const qc = useQueryClient();
  const [drill, setDrill] = useState<null | "gross" | "collected" | "pending">(null);
  const [client, setClient] = useState<ClientTimelineTarget | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [prodSearch, setProdSearch] = useState("");

  const productLines = d?.productLines ?? [];
  const prodQ = prodSearch.trim().toLowerCase();
  const productRows = prodQ
    ? productLines.filter(
        (l) => l.customer_name.toLowerCase().includes(prodQ) || l.description.toLowerCase().includes(prodQ),
      )
    : productLines;

  const rows = d?.rows ?? [];
  const drillRows = drill === "pending" ? rows.filter((r) => Number(r.pending_balance) > 0) : rows;
  const drillTitle = drill === "gross" ? "Gross Sale — All Invoices" : drill === "collected" ? "Total Collection — Paid" : "Pending Dues — Outstanding";
  const drillValue = (r: typeof rows[number]) =>
    drill === "gross" ? Number(r.gross_total) : drill === "collected" ? Number(r.paid_amount || r.gross_total) : Number(r.pending_balance);

  return (
    <div>
      <PageHeader
        title={`Clinic Financial Dashboard${name ? ` — ${name.split(" ")[0]}` : ""}`}
        subtitle="Admin / Finance overview — double-click a card for the patient breakdown."
        action={<DateRangePicker loading={isFetching} />}
      />
      {/* Granular revenue streams */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <RevenueKpi
          icon={TrendingUp}
          label="Total Collection"
          value={inr(d?.collected ?? 0)}
          hint="All received payments"
          accent="var(--chart-2)"
          onClick={() => setDrill("collected")}
        />
        <RevenueKpi
          icon={ShoppingCart}
          label="Product Sales"
          value={inr(d?.productSales ?? 0)}
          hint="Pharmacy & retail lines"
          accent="var(--chart-5)"
          onClick={() => setProductOpen(true)}
        />
        <RevenueKpi
          icon={ClipboardList}
          label="Service & Treatments"
          value={inr(d?.serviceSales ?? 0)}
          hint="Treatment line revenue"
          accent="var(--chart-1)"
        />
        <RevenueKpi
          icon={Stethoscope}
          label="Doctor Consultation"
          value={inr(d?.consultationSales ?? 0)}
          hint="Consultation fees"
          accent="var(--chart-4)"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={BadgeIndianRupee} label="Gross Sale" value={inr(d?.gross ?? 0)} onDoubleClick={() => setDrill("gross")} />
        <Stat icon={Wallet} label="Pending Due" value={inr(d?.pending ?? 0)} accent="var(--chart-3)" onDoubleClick={() => setDrill("pending")} />
        <Stat icon={Landmark} label="GST (5%)" value={inr(d?.tax ?? 0)} accent="var(--chart-4)" />
        <TopPerformerCard />
      </div>


      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{drillTitle}</DialogTitle></DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">Click a patient row to open their 360° client drawer.</p>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                <tr className="border-b"><th className="py-2 font-medium">Patient</th><th className="py-2 font-medium">Mode</th><th className="py-2 text-right font-medium">Amount</th></tr>
              </thead>
              <tbody className="divide-y">
                {drillRows.map((r, i) => (
                  <tr
                    key={i}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                    onClick={() => { setDrill(null); setClient({ name: r.customer_name || "Walk-in" }); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDrill(null);
                        setClient({ name: r.customer_name || "Walk-in" });
                      }
                    }}
                  >
                    <td className="py-1.5">{r.customer_name || "Walk-in"}</td>
                    <td className="py-1.5 text-muted-foreground">{r.payment_mode || "Cash"}</td>
                    <td className="py-1.5 text-right font-medium">{inr(drillValue(r))}</td>
                  </tr>
                ))}
                {drillRows.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No records.</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product & Medicine sales ledger — line-level drill-down of the KPI card. */}
      <Dialog open={productOpen} onOpenChange={(o) => { setProductOpen(o); if (!o) setProdSearch(""); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Product &amp; Medicine Sales Ledger</DialogTitle></DialogHeader>
          <div className="-mt-2 flex flex-wrap items-center gap-3">
            <Input
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              placeholder="Search client or item…"
              className="h-9 max-w-xs"
            />
            <span className="text-xs text-muted-foreground">
              {productRows.length} line{productRows.length === 1 ? "" : "s"} · {inr(productRows.reduce((s, l) => s + l.line_total, 0))}
            </span>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Invoice</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Unit</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {productRows.map((l, i) => (
                  <tr key={`${l.invoice_id}-${i}`} className="hover:bg-muted/40">
                    <td className="py-1.5 whitespace-nowrap">{l.invoice_date ? fmtDate(l.invoice_date) : "—"}</td>
                    <td className="py-1.5">{l.invoice_no}</td>
                    <td className="py-1.5">{l.customer_name}</td>
                    <td className="py-1.5">{l.description}</td>
                    <td className="py-1.5 text-right">{l.qty}</td>
                    <td className="py-1.5 text-right">{inr(l.unit_price)}</td>
                    <td className="py-1.5 text-right font-medium">{inr(l.line_total)}</td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => { setProductOpen(false); setClient({ name: l.customer_name }); }}
                      >
                        Open CRM
                      </button>
                    </td>
                  </tr>
                ))}
                {productRows.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No product / medicine sales in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <ClientTimelineDialog
        target={client}
        onClose={() => {
          setClient(null);
          invalidateLedger(qc);
          qc.invalidateQueries({ queryKey: ["client-timeline"] });
        }}
      />



      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Cash vs Bank Collection</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{ name: "Cash", value: d?.cash ?? 0 }, { name: "Bank / Online", value: d?.bank ?? 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip formatter={(v: number) => inr(v)} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                <Cell fill="var(--chart-3)" />
                <Cell fill="var(--chart-1)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Payment Mode Split</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={d?.modeData ?? []} dataKey="value" nameKey="name" outerRadius={90} label>
                {(d?.modeData ?? []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => inr(v)} />
            </PieChart>
          </ResponsiveContainer>
          {/* Exact monetary total per payment mode — pie slices alone are not auditable. */}
          <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t pt-3 text-xs sm:grid-cols-2">
            {(d?.modeData ?? []).map((m, i) => {
              const total = (d?.modeData ?? []).reduce((s, x) => s + x.value, 0) || 1;
              return (
                <div key={m.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{m.name} · {m.count} invoice{m.count === 1 ? "" : "s"}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-foreground">
                    {inr(m.value)} <span className="font-normal text-muted-foreground">({((m.value / total) * 100).toFixed(1)}%)</span>
                  </span>
                </div>
              );
            })}
            {(d?.modeData?.length ?? 0) === 0 && (
              <p className="col-span-full py-2 text-center text-muted-foreground">No collections in this range.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Per-Service Net Profitability</h2>
          <p className="mb-3 text-xs text-muted-foreground">Gross collected − product cost consumed = net treatment profit.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 font-medium">Service</th><th className="py-1 text-right font-medium">Gross</th><th className="py-1 text-right font-medium">Prod. Cost</th><th className="py-1 text-right font-medium">Net</th></tr>
              </thead>
              <tbody className="divide-y">
                {(d?.servicePnl ?? []).map((s) => (
                  <tr key={s.name}>
                    <td className="py-1.5 pr-2">{s.name}</td>
                    <td className="py-1.5 text-right">{inr(s.gross)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{inr(s.cost)}</td>
                    <td className={`py-1.5 text-right font-semibold ${s.net >= 0 ? "text-foreground" : "text-destructive"}`}>{inr(s.net)}</td>
                  </tr>
                ))}
                {(d?.servicePnl?.length ?? 0) === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No service data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Net (Gross − Expenses): <span className="font-semibold text-foreground">{inr((d?.gross ?? 0) - (d?.expenses ?? 0))}</span> · {d?.count ?? 0} invoices
      </p>
    </div>
  );
}

function DoctorDashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-doctor"],
    queryFn: async () => {
      const [{ count: patients }, { data: rx }] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("prescriptions").select("id, customer_name, diagnosis, rx_date").order("rx_date", { ascending: false }).limit(8),
      ]);
      return { patients: patients ?? 0, rx: rx ?? [] };
    },
  });
  return (
    <div>
      <PageHeader title="Clinical Worklist" subtitle="Your patients and recent prescriptions. Financial data is hidden for clinical roles." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat icon={Users} label="Patients" value={String(data?.patients ?? 0)} />
        <Stat icon={Stethoscope} label="Recent Rx" value={String(data?.rx.length ?? 0)} accent="var(--chart-2)" />
        <Stat icon={ClipboardList} label="New Rx" value="—" accent="var(--chart-4)" />
      </div>
      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Prescriptions</h2>
          <Link to="/consultation" className="text-sm font-medium text-primary hover:underline">Open Consultation Room →</Link>
        </div>
        <div className="divide-y">
          {(data?.rx ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{r.customer_name}</span>
              <span className="text-muted-foreground">{r.diagnosis || "—"}</span>
              <span className="text-xs text-muted-foreground">{r.rx_date}</span>
            </div>
          ))}
          {(data?.rx.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No prescriptions yet.</p>}
        </div>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InventoryVisibilityGrid title="Live Stock — Consultation Reference" />
        <MasterBackupCard />
      </div>
    </div>
  );
}

function ReceptionDashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-reception"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: inv }, { count: customers }] = await Promise.all([
        supabase.from("invoices").select("gross_total, payment_mode").is("voided_at", null).eq("invoice_date", today),
        supabase.from("customers").select("*", { count: "exact", head: true }),
      ]);
      const todaySales = (inv ?? []).reduce((s, r) => s + Number(r.gross_total), 0);
      return { todaySales, bills: inv?.length ?? 0, customers: customers ?? 0 };
    },
  });
  return (
    <div>
      <PageHeader title="Billing Console" subtitle="Fast walk-in checkout. Profitability reports are restricted." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat icon={BadgeIndianRupee} label="Today's Sales" value={inr(data?.todaySales ?? 0)} />
        <Stat icon={ShoppingCart} label="Bills Today" value={String(data?.bills ?? 0)} accent="var(--chart-2)" />
        <Stat icon={Users} label="Customers" value={String(data?.customers ?? 0)} accent="var(--chart-4)" />
      </div>
      <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
        <ShoppingCart className="h-10 w-10 text-primary" />
        <h2 className="text-lg font-semibold">Ready to bill a walk-in?</h2>
        <Link to="/pos" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          Open POS Billing
        </Link>
      </Card>
      <div className="mt-4">
        <InventoryVisibilityGrid title="Live Stock Monitor" />
      </div>
    </div>
  );
}

/* Futuristic revenue KPI tile — gradient glow, subtle grid, optional drill-down. */
function RevenueKpi({
  icon: Icon, label, value, hint, accent, onClick,
}: {
  icon: typeof Wallet; label: string; value: string; hint?: string; accent?: string; onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden border-border/60 p-5${onClick ? " cursor-pointer transition hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/40" : ""}`}
      title={onClick ? "Click for the detailed breakdown" : undefined}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl"
        style={{ background: accent ?? "var(--gradient-brand)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold tabular-nums text-foreground">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: accent ?? "var(--gradient-brand)" }}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
    </Card>
  );
}

/* Marketing star — most appointments booked this calendar month (from the audit trail). */
function TopPerformerCard() {
  const { data } = useQuery({
    queryKey: ["dashboard-top-performer"],
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: rows } = await supabase
        .from("audit_log")
        .select("user_name, user_role, created_at, entity_type, action")
        .eq("entity_type", "appointments")
        .eq("action", "INSERT")
        .gte("created_at", from)
        .limit(5000);
      const tally = new Map<string, { name: string; role: string | null; count: number }>();
      for (const r of rows ?? []) {
        const name = (r.user_name ?? "").trim();
        if (!name) continue;
        const cur = tally.get(name) ?? { name, role: r.user_role ?? null, count: 0 };
        cur.count += 1;
        tally.set(name, cur);
      }
      return [...tally.values()].sort((a, b) => b.count - a.count)[0] ?? null;
    },
  });

  const initials = (data?.name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <Card className="relative overflow-hidden border-primary/30 p-5">
      <div className="pointer-events-none absolute -left-8 -bottom-10 h-28 w-28 rounded-full opacity-20 blur-2xl" style={{ background: "var(--gradient-brand)" }} />
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top Performer (Appointments)</p>
      <div className="relative mt-2 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-primary-foreground" style={{ background: "var(--gradient-brand)" }}>
          {initials || "—"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-foreground">{data?.name ?? "No bookings yet"}</p>
          <p className="text-xs text-muted-foreground">
            {data ? `${data.count} booking${data.count === 1 ? "" : "s"} this month${data.role ? ` · ${data.role}` : ""}` : "This calendar month"}
          </p>
        </div>
      </div>
    </Card>
  );
}
