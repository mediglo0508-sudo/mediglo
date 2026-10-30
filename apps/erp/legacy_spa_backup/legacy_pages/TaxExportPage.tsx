import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, formatDate, todayIST, startOfMonthIST, istDateBoundaryToUtcISO } from "@/lib/utils";
import type { InvoiceStatus, PaymentMode } from "@/types/domain";
import { Download, Info } from "lucide-react";

interface TaxInvoiceRow {
  id: string;
  invoice_no: string | null;
  created_at: string;
  invoice_type: string;
  status: InvoiceStatus;
  payment_mode: PaymentMode;
  subtotal: number;
  discount_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  gross_total: number;
  place_of_supply: string | null;
  customers: { name: string; phone: string } | null;
}

const ROW_LIMIT = 2000;

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "netbanking", label: "Net Banking" },
  { value: "split", label: "Split" },
];

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function TaxExportPage() {
  const [startDate, setStartDate] = useState(startOfMonthIST());
  const [endDate, setEndDate] = useState(todayIST());
  const [selectedModes, setSelectedModes] = useState<PaymentMode[]>(PAYMENT_MODES.map((m) => m.value));
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [includeVoid, setIncludeVoid] = useState(false);

  function toggleMode(mode: PaymentMode) {
    setSelectedModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  }

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["tax_export_invoices", startDate, endDate, selectedModes.join(","), statusFilter, includeVoid],
    queryFn: async () => {
      // startDate/endDate are IST calendar dates picked from a plain <input
      // type="date">; converting them to the correct UTC instant (rather
      // than comparing the bare date string, which Postgres would interpret
      // in the session's timezone - normally UTC) keeps an invoice made just
      // after midnight IST from falling into the wrong day/month bucket.
      let q = supabase
        .from("invoices")
        .select("*, customers(name, phone)")
        .gte("created_at", istDateBoundaryToUtcISO(startDate))
        .lte("created_at", istDateBoundaryToUtcISO(endDate, true))
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT);

      if (selectedModes.length > 0 && selectedModes.length < PAYMENT_MODES.length) {
        q = q.in("payment_mode", selectedModes);
      }
      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      if (!includeVoid && statusFilter === "all") {
        q = q.neq("status", "void");
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as TaxInvoiceRow[];
    },
  });

  const rows = invoices ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        const taxable = Number(r.subtotal) - Number(r.discount_amount);
        acc.count += 1;
        acc.taxable += taxable;
        acc.cgst += Number(r.cgst);
        acc.sgst += Number(r.sgst);
        acc.igst += Number(r.igst);
        acc.grand += Number(r.gross_total);
        return acc;
      },
      { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 }
    );
  }, [rows]);

  function downloadCsv() {
    const header = [
      "Invoice No",
      "Date",
      "Customer Name",
      "Type",
      "Payment Mode",
      "Taxable Value",
      "CGST",
      "SGST",
      "IGST",
      "Gross Total",
      "Place of Supply",
      "Status",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of rows) {
      const taxable = Number(r.subtotal) - Number(r.discount_amount);
      lines.push(
        [
          csvEscape(r.invoice_no ?? ""),
          csvEscape(formatDate(r.created_at)),
          csvEscape(r.customers?.name ?? ""),
          csvEscape(r.invoice_type),
          csvEscape(r.payment_mode),
          csvEscape(taxable.toFixed(2)),
          csvEscape(Number(r.cgst).toFixed(2)),
          csvEscape(Number(r.sgst).toFixed(2)),
          csvEscape(Number(r.igst).toFixed(2)),
          csvEscape(Number(r.gross_total).toFixed(2)),
          csvEscape(r.place_of_supply ?? ""),
          csvEscape(r.status),
        ].join(",")
      );
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mediglo-gst-export-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">GST / ITR Export Hub</h1>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Invoice status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | InvoiceStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (excl. void unless included below)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox id="include-void" checked={includeVoid} onCheckedChange={(v) => setIncludeVoid(v === true)} />
              <Label htmlFor="include-void" className="cursor-pointer">
                Include voided invoices
              </Label>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Payment modes</Label>
            <div className="flex flex-wrap gap-4">
              {PAYMENT_MODES.map((m) => (
                <div key={m.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`mode-${m.value}`}
                    checked={selectedModes.includes(m.value)}
                    onCheckedChange={() => toggleMode(m.value)}
                  />
                  <Label htmlFor={`mode-${m.value}`} className="cursor-pointer">
                    {m.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Invoices" value={String(totals.count)} />
        <MiniStat label="Taxable Value" value={formatINR(totals.taxable)} />
        <MiniStat label="CGST" value={formatINR(totals.cgst)} />
        <MiniStat label="SGST" value={formatINR(totals.sgst)} />
        <MiniStat label="IGST" value={formatINR(totals.igst)} />
        <MiniStat label="Grand Total" value={formatINR(totals.grand)} highlight />
      </div>

      {rows.length >= ROW_LIMIT && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          <Info className="h-4 w-4 shrink-0" />
          Showing the first {ROW_LIMIT} matching invoices. Narrow the date range to make sure nothing is being truncated.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Filtered Invoices</CardTitle>
            <CardDescription>
              {rows.length} row(s) {rows.length >= ROW_LIMIT ? `(capped at ${ROW_LIMIT})` : ""}
            </CardDescription>
          </div>
          <Button onClick={downloadCsv} disabled={rows.length === 0}>
            <Download className="mr-1 h-4 w-4" /> Download CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No invoices match the current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead className="text-right">Taxable Value</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">Gross Total</TableHead>
                  <TableHead>Place of Supply</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const taxable = Number(r.subtotal) - Number(r.discount_amount);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.invoice_no ?? "-"}</TableCell>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell>{r.customers?.name ?? "-"}</TableCell>
                      <TableCell className="capitalize">{r.invoice_type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="uppercase">{r.payment_mode}</TableCell>
                      <TableCell className="text-right">{formatINR(taxable)}</TableCell>
                      <TableCell className="text-right">{formatINR(r.cgst)}</TableCell>
                      <TableCell className="text-right">{formatINR(r.sgst)}</TableCell>
                      <TableCell className="text-right">{formatINR(r.igst)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(r.gross_total)}</TableCell>
                      <TableCell>{r.place_of_supply ?? "-"}</TableCell>
                      <TableCell className="capitalize">{r.status.replace(/_/g, " ")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={highlight ? "text-lg font-bold text-primary" : "text-lg font-bold"}>{value}</div>
      </CardContent>
    </Card>
  );
}
