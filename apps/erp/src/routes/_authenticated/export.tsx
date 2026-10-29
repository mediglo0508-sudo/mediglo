import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PAYMENT_MODES } from "@/lib/constants";
import { usePaymentModes, mergeModes } from "@/lib/payment-modes";

/** Match an invoice payment label to the longest known mode it starts with. */
function modeOf(raw: unknown, modes: string[]): string {
  const v = String(raw || "Cash").trim().toLowerCase();
  const hit = [...modes].sort((a, b) => b.length - a.length).find((m) => v.startsWith(m.toLowerCase()));
  return hit ?? String(raw || "Cash").trim();
}
import { inr2 } from "@/lib/gst";
import { fmtDate } from "@/lib/date-format";
import { buildCatalogIndex, lineCategory } from "@/lib/item-category";
import { FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({
    meta: [
      { title: "Tax Export Hub — MGHYN Clinic ERP" },
      { name: "description", content: "Export GST-ready invoice, tax and ledger data for filing." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Tax Export Hub — MGHYN Clinic ERP" },
      { property: "og:description", content: "Export GST-ready invoice, tax and ledger data for filing." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/export" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/export" }],
  }),
  component: ExportPage,
});

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

interface ExportRow {
  "Invoice Date": string;
  "Invoice Number": string;
  "Patient Name": string;
  "Patient City": string;
  "Treatments/Services Done": string;
  "Products Purchased": string;
  "OPD Details": string;
  "OPD Amount": number;
  "Total Bill Amount": number;
  "Total Paid Amount": number;
  "Pending Due Amount": number;
  "Payment Mode": string;
  "Taxable Base": number;
  CGST: number;
  SGST: number;
}

function ExportPage() {
  const { isFinance } = useAuth();
  // Track exclusions so new/custom/historical modes are included by default.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const { modes: knownModes } = usePaymentModes(PAYMENT_MODES);
  const [from, setFrom] = useState<string>(monthStart());
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const { data, isFetching } = useQuery({
    queryKey: ["export-invoices", from, to],
    enabled: isFinance,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_no, invoice_date, customer_id, customer_name, state_code, payment_mode, base_amount, cgst, sgst, gross_total, paid_amount, pending_balance")
        .is("voided_at", null)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date");
      const invs = invoices ?? [];
      const ids = invs.map((i) => i.id);
      const [linesRes, custRes, prodRes, svcRes] = await Promise.all([
        ids.length
          ? supabase
              .from("invoice_lines")
              .select("invoice_id, description, item_category, qty, line_total")
              .in("invoice_id", ids)
              .limit(50000)
          : Promise.resolve({ data: [] as { invoice_id: string; description: string | null; item_category: string | null; qty: number; line_total: number }[] }),
        supabase.from("customers").select("id, name, city, state_code"),
        supabase.from("inventory").select("name").eq("active", true),
        supabase.from("services_master").select("name, category, sac_code").eq("active", true),
      ]);
      const idx = buildCatalogIndex(prodRes.data ?? [], svcRes.data ?? []);
      const cityById = new Map((custRes.data ?? []).map((c) => [c.id, c.city ?? ""]));
      const cityByName = new Map((custRes.data ?? []).map((c) => [(c.name ?? "").trim().toLowerCase(), c.city ?? ""]));

      const byInvoice = new Map<string, { services: string[]; products: string[]; opd: string[]; opdAmount: number }>();
      for (const l of linesRes.data ?? []) {
        const bucket = byInvoice.get(l.invoice_id) ?? { services: [], products: [], opd: [], opdAmount: 0 };
        const label = `${(l.description ?? "").trim()}${Number(l.qty) > 1 ? ` ×${Number(l.qty)}` : ""}`;
        const cat = lineCategory(l, idx);
        if (cat === "product") bucket.products.push(label);
        else if (cat === "consultation") {
          bucket.opd.push(label);
          bucket.opdAmount += Number(l.line_total) || 0;
        } else bucket.services.push(label);
        byInvoice.set(l.invoice_id, bucket);
      }

      const rows: ExportRow[] = invs.map((i) => {
        const b = byInvoice.get(i.id) ?? { services: [], products: [], opd: [], opdAmount: 0 };
        const city =
          (i.customer_id ? cityById.get(i.customer_id) : "") ||
          cityByName.get((i.customer_name ?? "").trim().toLowerCase()) ||
          "";
        return {
          "Invoice Date": i.invoice_date,
          "Invoice Number": i.invoice_no ?? "",
          "Patient Name": i.customer_name ?? "Walk-in",
          "Patient City": city,
          "Treatments/Services Done": b.services.join(", "),
          "Products Purchased": b.products.join(", "),
          "OPD Details": b.opd.length ? `${b.opd.join(", ")} — ${Math.round(b.opdAmount * 100) / 100}` : "",
          "OPD Amount": Math.round(b.opdAmount * 100) / 100,
          "Total Bill Amount": Number(i.gross_total) || 0,
          "Total Paid Amount": Number(i.paid_amount) || 0,
          "Pending Due Amount": Number(i.pending_balance) || 0,
          "Payment Mode": i.payment_mode || "Cash",
          "Taxable Base": Number(i.base_amount) || 0,
          CGST: Number(i.cgst) || 0,
          SGST: Number(i.sgst) || 0,
        };
      });
      return rows;
    },
  });

  const allModes = useMemo(() => {
    const hist = (data ?? []).map((r) => modeOf(r["Payment Mode"], knownModes));
    return mergeModes(knownModes, hist);
  }, [data, knownModes]);
  const rows = useMemo(
    () => (data ?? []).filter((r) => !excluded.has(modeOf(r["Payment Mode"], allModes))),
    [data, excluded, allModes],
  );
  const total = rows.reduce((s, r) => s + r["Total Bill Amount"], 0);
  const paid = rows.reduce((s, r) => s + r["Total Paid Amount"], 0);
  const due = rows.reduce((s, r) => s + r["Pending Due Amount"], 0);

  function exportExcel() {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 44 },
      { wch: 34 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 18 }, { wch: 13 }, { wch: 10 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoice Register");
    XLSX.writeFile(wb, `MediGlo_Export_${from}_to_${to}.xlsx`);
  }
  function exportJSON() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MediGlo_Export_${from}_to_${to}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isFinance) return <AccessDenied />;

  return (
    <div>
      <PageHeader
        title="GST / ITR Tax Export Hub"
        subtitle="Pick any date range, filter by payment mode, then export a fully-mapped invoice register (services, products, OPD, dues)."
      />
      <Card className="mb-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>From Date</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To Date</Label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <h3 className="mb-3 mt-6 text-sm font-semibold">Payment Mode Filters</h3>
        <div className="flex flex-wrap gap-4">
          {allModes.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!excluded.has(m)}
                onCheckedChange={(c) =>
                  setExcluded((s) => {
                    const n = new Set(s);
                    if (c) n.delete(m); else n.add(m);
                    return n;
                  })
                }
              />
              {m}
            </label>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={exportExcel} disabled={!rows.length}>
            <FileDown className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={exportJSON} disabled={!rows.length}>Export JSON</Button>
          <span className="text-sm text-muted-foreground">
            {isFetching ? "Loading…" : `${rows.length} invoices · ${inr2(total)} billed · ${inr2(paid)} paid · ${inr2(due)} due`}
          </span>
        </div>
      </Card>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3">Date</th>
                <th className="px-3">Invoice</th>
                <th className="px-3">Patient</th>
                <th className="px-3">City</th>
                <th className="px-3">Services</th>
                <th className="px-3">Products</th>
                <th className="px-3">OPD</th>
                <th className="px-3">Mode</th>
                <th className="px-3 text-right">Total</th>
                <th className="px-3 text-right">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={`${r["Invoice Number"]}-${i}`} className="hover:bg-muted/30">
                  <td className="px-3 whitespace-nowrap">{fmtDate(r["Invoice Date"])}</td>
                  <td className="px-3">{r["Invoice Number"]}</td>
                  <td className="px-3">{r["Patient Name"]}</td>
                  <td className="px-3 text-muted-foreground">{r["Patient City"] || "—"}</td>
                  <td className="px-3 text-xs">{r["Treatments/Services Done"] || "—"}</td>
                  <td className="px-3 text-xs">{r["Products Purchased"] || "—"}</td>
                  <td className="px-3 text-xs">{r["OPD Details"] || "—"}</td>
                  <td className="px-3">{r["Payment Mode"]}</td>
                  <td className="px-3 text-right font-semibold">{inr2(r["Total Bill Amount"])}</td>
                  <td className="px-3 text-right">{inr2(r["Pending Due Amount"])}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No invoices in this range / payment mode.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
