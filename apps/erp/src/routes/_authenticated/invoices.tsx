import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inr2 } from "@/lib/gst";
import { fmtDate } from "@/lib/date-format";
import { stateName } from "@/lib/constants";
import { printTallyInvoice } from "@/lib/print-layout";
import { invalidateLedger } from "@/lib/ledger-cache";
import { friendlyBillingError } from "@/lib/billing-access";
import { buildCatalogIndex, lineCategory, type ItemCategory } from "@/lib/item-category";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Ban, Printer, Pencil, FileStack } from "lucide-react";

import { InvoiceEditDialog } from "@/components/InvoiceEditDialog";
import { InvoiceInventoryPanel } from "@/components/InvoiceInventoryPanel";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — MGHYN Clinic ERP" },
      { name: "description", content: "Search, categorise, edit and reprint clinic invoices." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Invoices — MGHYN Clinic ERP" },
      { property: "og:description", content: "Search, categorise, edit and reprint clinic invoices." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/invoices" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/invoices" }],
  }),
  component: InvoicesPage,
});

const PAGE_SIZE = 50;

function InvoicesPage() {
  const qc = useQueryClient();
  const { canBilling, hasRole } = useAuth();
  const canEditInvoice = hasRole("admin") || hasRole("accountant");

  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | ItemCategory>("all");
  const [editId, setEditId] = useState<string | null>(null);

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [showVoided, tab]);

  // Invoice → category map. invoice_lines carry no category column, so each
  // line is classified against the live masters and rolled up per invoice.
  const { data: catMap, isLoading: catLoading } = useQuery({
    queryKey: ["invoice-categories"],
    staleTime: 60_000,
    queryFn: async () => {
      const [prodRes, svcRes, lineRes] = await Promise.all([
        supabase.from("inventory").select("name").eq("active", true),
        supabase.from("services_master").select("name, category, sac_code").eq("active", true),
        supabase.from("invoice_lines").select("invoice_id, description, item_category").limit(50000),
      ]);
      const idx = buildCatalogIndex(prodRes.data ?? [], svcRes.data ?? []);
      const map: Record<ItemCategory, Set<string>> = { product: new Set(), service: new Set(), consultation: new Set() };
      for (const l of lineRes.data ?? []) {
        map[lineCategory(l, idx)].add(l.invoice_id);

      }
      return {
        product: Array.from(map.product),
        service: Array.from(map.service),
        consultation: Array.from(map.consultation),
      } as Record<ItemCategory, string[]>;
    },
  });

  const tabIds = tab === "all" ? null : catMap?.[tab] ?? null;

  // Server-side pagination keeps the initial payload small on large ledgers.
  const { data, isFetching } = useQuery({
    queryKey: ["invoices", debounced, showVoided, page, tab, tabIds?.length ?? 0],
    enabled: tab === "all" || !catLoading,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (tab !== "all" && (!tabIds || tabIds.length === 0)) return { rows: [], count: 0 };
      let q = supabase
        .from("invoices")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (tabIds) q = q.in("id", tabIds);
      if (!showVoided) q = q.is("voided_at", null);
      if (debounced) q = q.or(`customer_name.ilike.%${debounced}%,invoice_no.ilike.%${debounced}%`);
      const { data: rows, count } = await q;
      return { rows: rows ?? [], count: count ?? 0 };
    },
  });

  const filtered = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));


  function editInvoice(i: { id: string; source?: string | null; voided_at?: string | null; invoice_no?: string | null }) {
    if (i.voided_at) return toast.error("This invoice is voided — un-void it first to edit its lines.");
    if (i.source === "receipt") return toast.error("Balance-clearance receipts cannot be edited.");
    setEditId(i.id);
  }

  function reviseInvoice(i: { id: string; voided_at?: string | null }) {
    if (i.voided_at) return toast.error("This invoice is voided — open its replacement instead.");
    navigate({ to: "/pos", search: { edit: i.id } as never });
  }



  // GST/ITR system: invoice numbers must stay sequential and auditable, so
  // "delete" is a VOID. Setting voided_at fires the existing trigger, which
  // reverses that invoice's inventory exactly once.
  async function voidSelected() {
    if (!selected.size) return;
    if (!confirm(`Cancel / void ${selected.size} invoice(s)? The invoice number is kept for GST records and stock is returned.`)) return;
    const reason = window.prompt("Reason for cancellation (optional)") ?? "";
    const ids = Array.from(selected);
    let ok = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc("void_invoice", {
        p_id: id,
        p_reason: reason || "Cancelled from Invoices list",
      });
      if (error) toast.error(friendlyBillingError(error));
      else ok++;
    }
    setSelected(new Set());
    if (ok > 0) toast.success(`${ok} invoice(s) cancelled — stock reversed, numbers preserved.`);
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    invalidateLedger(qc);
  }



  if (!canBilling) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Invoices" subtitle="All sales invoices. Double-click a row for line items & session tracking." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-3">
        <TabsList>
          <TabsTrigger value="all">All Invoices</TabsTrigger>
          <TabsTrigger value="product">Product Sales{catMap ? ` (${catMap.product.length})` : ""}</TabsTrigger>
          <TabsTrigger value="service">Services &amp; Treatments{catMap ? ` (${catMap.service.length})` : ""}</TabsTrigger>
          <TabsTrigger value="consultation">Doctor Consultation{catMap ? ` (${catMap.consultation.length})` : ""}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="p-0">
        <div className="flex items-center gap-3 border-b p-3">
          <Input placeholder="Search invoice / customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 max-w-xs" />
          <div className="flex items-center gap-2">
            <Switch id="show-voided" checked={showVoided} onCheckedChange={setShowVoided} />
            <Label htmlFor="show-voided" className="text-xs">Show voided</Label>
          </div>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" className="ml-auto" onClick={voidSelected}>
              <Ban className="mr-1 h-4 w-4" /> Cancel / Void ({selected.size})
            </Button>
          )}

        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-10 p-3"></th>
                <th className="p-3 font-medium">Invoice</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Mode</th>
                <th className="p-3 font-medium">State</th>
                <th className="p-3 text-right font-medium">GST</th>
                <th className="p-3 text-right font-medium">Total</th>
                <th className="p-3 text-right font-medium">Due</th>
                <th className="w-16 p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((i) => {
                const voided = !!i.voided_at;
                return (
                <tr key={i.id} className={`cursor-pointer hover:bg-muted/30 ${voided ? "text-muted-foreground line-through" : ""}`} onDoubleClick={() => setOpenId(i.id)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} />
                  </td>
                  <td className="p-3 font-medium">
                    {i.invoice_no}
                    {voided && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive no-underline">Voided</span>}
                  </td>
                  <td className="p-3">{fmtDate(i.invoice_date)}</td>
                  <td className="p-3">{i.customer_name}</td>
                  <td className="p-3">{i.payment_mode}</td>
                  <td className="p-3">{i.state_code}</td>
                  <td className="p-3 text-right">{inr2(Number(i.cgst) + Number(i.sgst))}</td>
                  <td className="p-3 text-right font-semibold">{inr2(Number(i.gross_total))}</td>
                  <td className="p-3 text-right text-destructive">{Number(i.pending_balance) > 0 ? inr2(Number(i.pending_balance)) : "—"}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {!voided && i.source !== "receipt" && (
                      <div className="flex items-center gap-1">
                        {canEditInvoice && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit lines & reconcile stock" onClick={() => editInvoice(i)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Revise as a new invoice (void + reissue)" onClick={() => reviseInvoice(i)}>
                          <FileStack className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">{isFetching ? "Loading…" : "No invoices found."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
          <span>
            {total === 0 ? "0 invoices" : `Showing ${page * PAGE_SIZE + 1}–${Math.min(total, page * PAGE_SIZE + filtered.length)} of ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <span>Page {page + 1} / {pageCount}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pageCount || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      <InvoiceDrawer id={openId} onClose={() => setOpenId(null)} isAdmin={hasRole("admin")} />
      <InvoiceEditDialog invoiceId={editId} onClose={() => setEditId(null)} />
    </div>
  );
}

function InvoiceDrawer({ id, onClose, isAdmin }: { id: string | null; onClose: () => void; isAdmin: boolean }) {
  const { data } = useQuery({
    queryKey: ["invoice-lines", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: inv }, { data: lines }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id!).single(),
        supabase.from("invoice_lines").select("*").eq("invoice_id", id!),
      ]);
      return { inv, lines: lines ?? [] };
    },
  });
  function handlePrint() {
    const inv = data?.inv;
    if (!inv) return;
    printTallyInvoice(
      {
        invoice_no: inv.invoice_no ?? "", invoice_date: inv.invoice_date, customer_name: inv.customer_name ?? "",
        state_code: inv.state_code ?? "", payment_mode: inv.payment_mode, tax_mode: inv.tax_mode,
        base_amount: Number(inv.base_amount), cgst: Number(inv.cgst),
        sgst: Number(inv.sgst), discount_amount: Number(inv.discount_amount ?? 0), gross_total: Number(inv.gross_total), paid_amount: Number(inv.paid_amount),
        pending_balance: Number(inv.pending_balance),
        session_note: (data?.lines ?? []).map((l) => l.session_label).filter(Boolean).join(" · ") || null,
      },
      (data?.lines ?? []).map((l) => ({
        description: l.description, sac_code: l.sac_code, qty: Number(l.qty), base_amount: Number(l.base_amount),
        cgst: Number(l.cgst), sgst: Number(l.sgst), line_total: Number(l.line_total), session_label: l.session_label,
      })),
    );
  }
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{data?.inv?.invoice_no}</SheetTitle></SheetHeader>
        {data?.inv && (
          <div className="mt-4 space-y-4 text-sm">
            <Button size="sm" className="w-full" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print Invoice
            </Button>
            <div className="rounded-lg border p-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{data.inv.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Place of Supply</span><span>{data.inv.state_code} · {stateName(data.inv.state_code)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span>{data.inv.payment_mode} ({data.inv.tax_mode})</span></div>
              {data.inv.assigned_staff && <div className="flex justify-between"><span className="text-muted-foreground">Staff</span><span>{data.inv.assigned_staff}</span></div>}
            </div>
            <div className="rounded-lg border">
              {data.lines.map((l) => (
                <div key={l.id} className="border-b p-3 last:border-0">
                  <div className="flex justify-between font-medium">{l.description}<span>{inr2(Number(l.line_total))}</span></div>
                  <div className="text-xs text-muted-foreground">Qty {l.qty} · SAC {l.sac_code || "—"} {l.session_label ? `· ${l.session_label}` : ""}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              {Number(data.inv.discount_amount ?? 0) > 0 && (
                <>
                  <Row l="Subtotal" v={inr2(Number(data.inv.base_amount) + Number(data.inv.cgst) + Number(data.inv.sgst) + Number(data.inv.discount_amount))} />
                  <Row l="Discount Allowed" v={`- ${inr2(Number(data.inv.discount_amount))}`} />
                </>
              )}
              <Row l="Taxable Base" v={inr2(Number(data.inv.base_amount))} />
              <Row l="CGST 2.5%" v={inr2(Number(data.inv.cgst))} />
              <Row l="SGST 2.5%" v={inr2(Number(data.inv.sgst))} />
              <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Grand Total</span><span>{inr2(Number(data.inv.gross_total))}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Paid Amount</span><span className="font-medium text-emerald-600">{inr2(Number(data.inv.paid_amount ?? 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding / Due</span><span className={`font-semibold ${Number(data.inv.pending_balance) > 0 ? "text-destructive" : ""}`}>{inr2(Number(data.inv.pending_balance ?? 0))}</span></div>
            </div>
            <InvoiceInventoryPanel invoiceId={data.inv.id} voidedAt={data.inv.voided_at} isAdmin={isAdmin} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{l}</span><span>{v}</span></div>;
}
