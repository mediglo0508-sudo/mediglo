import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { inr2, round2 } from "@/lib/gst";
import { toast } from "sonner";
import { UploadCloud, Loader2, CheckCircle2, Landmark, Trash2, Split, Plus, X } from "lucide-react";
import { applyReconAllocations, listReconAllocations } from "@/lib/reconciliation.functions";
import {
  parseStatementDate, parseAmount, readStatementWorkbook, detectHeader, normDesc,
  type ParsedAmount,
} from "@/lib/bank-statement-parse";


export const Route = createFileRoute("/_authenticated/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation — MGHYN Clinic ERP" },
      { name: "description", content: "Match payments to invoices and reconcile bank and cash ledgers." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Reconciliation — MGHYN Clinic ERP" },
      { property: "og:description", content: "Match payments to invoices and reconcile bank and cash ledgers." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/reconciliation" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/reconciliation" }],
  }),
  component: ReconciliationPage,
});


interface SuspenseRow {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  direction: string;
  status: string;
  allocation_type: string | null;
  allocated_ref: string | null;
}

const ALLOC_LABELS: Record<string, string> = {
  invoice: "Match to Invoice",
  advance: "New Advance",
  expense: "Overhead Expense",
  vendor: "Vendor Ledger",
};

interface ParsedTxn { txn_date: string; description: string; amount: number; direction: string }
interface UnparsedRow { rowNo: number; reason: string; raw: string }
interface StatementPreview {
  fileName: string;
  format: string;
  mapping: Record<string, string>;
  rows: ParsedTxn[];
  unparsed: UnparsedRow[];
  rowsDetected: number;
  dateFrom: string;
  dateTo: string;
  totalIn: number;
  totalOut: number;
}

// Keywords in a narration that signify money going OUT (a Payment / Debit).
const OUTFLOW_RE = /\b(ads?|meta|facebook|google|fuel|petrol|diesel|rent|salary|wages|purchase|paid|payment|withdraw|withdrawal|debit|dr|emi|bill|charges?|fee|gst|tax|electricity|vendor|supplier|expense|upi.?out|neft|imps|rtgs)\b/i;
const INFLOW_RE = /\b(received|receipt|credit|cr|deposit|collection|refund|cash.?in)\b/i;

function ReconciliationPage() {
  const { isFinance } = useAuth();
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [edits, setEdits] = useState<Record<string, { type: string; ref: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitFor, setSplitFor] = useState<SuspenseRow | null>(null);


  const { data: entries } = useQuery({
    queryKey: ["suspense"],
    enabled: isFinance,
    queryFn: async () =>
      ((await supabase.from("suspense_entries").select("*").order("txn_date", { ascending: false })).data ?? []) as SuspenseRow[],
  });

  // Reference dictionaries for the smart narration tokenizer.
  const { data: vendors } = useQuery({
    queryKey: ["recon-vendors"],
    enabled: isFinance,
    queryFn: async () => (await supabase.from("vendors").select("name")).data ?? [],
  });
  const { data: clients } = useQuery({
    queryKey: ["recon-clients"],
    enabled: isFinance,
    queryFn: async () => (await supabase.from("customers").select("name")).data ?? [],
  });
  const { data: invoiceNos } = useQuery({
    queryKey: ["recon-invoices"],
    enabled: isFinance,
    queryFn: async () => (await supabase.from("invoices").select("invoice_no, customer_name")).data ?? [],
  });

  // Scan a narration string for a known vendor / client / invoice number match.
  function suggest(desc: string, direction: string): { type: string; ref: string; label: string } | null {
    const text = (desc || "").toLowerCase();
    if (!text) return null;
    const inv = (invoiceNos ?? []).find((i) => i.invoice_no && text.includes(i.invoice_no.toLowerCase()));
    if (inv) return { type: "invoice", ref: inv.invoice_no ?? "", label: `Invoice ${inv.invoice_no}` };
    if (direction === "in") {
      const c = (clients ?? []).find((x) => x.name && x.name.length > 2 && text.includes(x.name.toLowerCase()));
      if (c) return { type: "invoice", ref: c.name, label: `Client · ${c.name}` };
    } else {
      const v = (vendors ?? []).find((x) => x.name && x.name.length > 2 && text.includes(x.name.toLowerCase()));
      if (v) return { type: "vendor", ref: v.name, label: `Vendor · ${v.name}` };
    }
    return null;
  }



  function resolveDirection(opts: {
    dr: ParsedAmount; cr: ParsedAmount; fallback: ParsedAmount; flag: string; descText: string;
  }): string {
    const { dr, cr, fallback, flag, descText } = opts;
    if (dr.value > 0 && cr.value <= 0) return "out";
    if (cr.value > 0 && dr.value <= 0) return "in";
    if (/^d|debit|dr|withdraw/.test(flag)) return "out";
    if (/^c|credit|cr|deposit/.test(flag)) return "in";
    if (fallback.hint) return fallback.hint; // CR/DR token, parentheses or minus in the amount cell
    if (OUTFLOW_RE.test(descText) && !INFLOW_RE.test(descText)) return "out";
    if (INFLOW_RE.test(descText)) return "in";
    return "in";
  }

  function buildPreview(
    name: string,
    format: string,
    mapping: Record<string, string>,
    rows: ParsedTxn[],
    unparsed: UnparsedRow[],
    rowsDetected: number,
  ): StatementPreview {
    const dates = rows.map((r) => r.txn_date).sort();
    return {
      fileName: name,
      format,
      mapping,
      rows,
      unparsed,
      rowsDetected,
      dateFrom: dates[0] ?? "",
      dateTo: dates[dates.length - 1] ?? "",
      totalIn: round2(rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0)),
      totalOut: round2(rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0)),
    };
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setPreview(null);
    try {
      const lower = file.name.toLowerCase();
      const rows: ParsedTxn[] = [];
      const unparsed: UnparsedRow[] = [];
      let rowsDetected = 0;
      let format = "Delimited text";
      let mapping: Record<string, string> = {};

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        let wb: XLSX.WorkBook;
        try {
          const buf = await file.arrayBuffer();
          const read = readStatementWorkbook(buf);
          wb = read.wb;
          format = read.format;
        } catch (readErr) {
          console.error("[recon] workbook read failed", readErr);
          toast.error("Unable to read the workbook — the file may be password protected or not a real Excel file");
          return;
        }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
        const scan = detectHeader(grid as unknown[][]);
        if (!scan) {
          const found = (grid.slice(0, 10) as unknown[][])
            .flat()
            .map((c) => String(c ?? "").trim())
            .filter(Boolean)
            .slice(0, 12)
            .join(", ");
          console.error("[recon] no header row found", grid.slice(0, 10));
          toast.error(`No date/amount columns found. Headers detected: ${found || "none"}`);
          return;
        }
        const { headerRowIndex: hi, headers, map } = scan;
        const label = (i: number) => (i >= 0 ? headers[i] || `Column ${i + 1}` : "");
        mapping = Object.fromEntries(
          (
            [
              ["Date", map.date], ["Description", map.desc], ["Debit", map.debit],
              ["Credit", map.credit], ["Amount", map.amount], ["Dr/Cr", map.drcr],
            ] as [string, number][]
          ).filter(([, i]) => i >= 0).map(([k, i]) => [k, label(i)]),
        );

        for (let i = hi + 1; i < grid.length; i++) {
          const r = grid[i] as unknown[];
          if (!Array.isArray(r)) continue;
          if (r.every((c) => c == null || String(c).trim() === "")) continue;
          rowsDetected++;
          const rowNo = i + 1;
          const descText = map.desc >= 0 ? String(r[map.desc] ?? "").trim() : "";
          const cr = parseAmount(map.credit >= 0 ? r[map.credit] : null);
          const dr = parseAmount(map.debit >= 0 ? r[map.debit] : null);
          const fallback = parseAmount(map.amount >= 0 ? r[map.amount] : null);
          const flag = map.drcr >= 0 ? String(r[map.drcr] ?? "").trim().toLowerCase() : "";
          const amount = round2(cr.value || dr.value || fallback.value);
          const dateStr = parseStatementDate(map.date >= 0 ? r[map.date] : null);
          const raw = r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))).filter(Boolean).join(" | ").slice(0, 180);

          if (!dateStr && amount <= 0) continue; // blank / filler line, not a transaction
          if (!dateStr) {
            unparsed.push({ rowNo, reason: "Date could not be read", raw });
            continue;
          }
          if (!(amount > 0)) {
            unparsed.push({ rowNo, reason: "No valid amount", raw });
            continue;
          }
          rows.push({ txn_date: dateStr, description: descText, amount, direction: resolveDirection({ dr, cr, fallback, flag, descText }) });
        }
      } else {
        format = lower.endsWith(".csv") ? "CSV" : "Plain text";
        mapping = { Date: "first column", Description: "middle columns", Amount: "last column" };
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          const parts = line.split(/[,\t]|\s{2,}/).map((p) => p.trim()).filter(Boolean);
          if (parts.length < 2) continue;
          rowsDetected++;
          const rowNo = i + 1;
          const dateStr = parseStatementDate(parts[0]);
          const amt = parseAmount(parts[parts.length - 1]);
          const amount = round2(amt.value);
          const descText = parts.slice(1, -1).join(" ");
          const raw = line.slice(0, 180);
          if (!dateStr && amount <= 0) continue;
          if (!dateStr) { unparsed.push({ rowNo, reason: "Date could not be read", raw }); continue; }
          if (!(amount > 0)) { unparsed.push({ rowNo, reason: "No valid amount", raw }); continue; }
          const zero = { value: 0, hint: null, present: false } as ParsedAmount;
          rows.push({ txn_date: dateStr, description: descText, amount, direction: resolveDirection({ dr: zero, cr: zero, fallback: amt, flag: "", descText }) });
        }
      }

      if (rowsDetected === 0) {
        toast.error("No transactions detected. For PDF statements, export to Excel/CSV first.");
        return;
      }
      if (rows.length === 0) {
        toast.error(`All ${rowsDetected} rows failed to parse — check the date and amount columns.`);
        setPreview(buildPreview(file.name, format, mapping, rows, unparsed, rowsDetected));
        return;
      }
      if (unparsed.length > 0) {
        toast.warning(`${rows.length} rows parsed · ${unparsed.length} rows need review. Nothing imported yet.`);
      } else {
        toast.success(`${rows.length} transactions ready. Review the preview, then click Import.`);
      }
      setPreview(buildPreview(file.name, format, mapping, rows, unparsed, rowsDetected));
    } catch (err) {
      console.error("[recon] statement parse failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to parse statement");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  async function confirmImport() {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    let statementId: string | null = null;
    try {
      // Duplicate detection against the existing suspense ledger.
      const dates = preview.rows.map((r) => r.txn_date).sort();
      const { data: existing, error: exErr } = await supabase
        .from("suspense_entries")
        .select("txn_date, amount, direction, description")
        .gte("txn_date", dates[0])
        .lte("txn_date", dates[dates.length - 1]);
      if (exErr) throw exErr;
      const seen = new Set(
        (existing ?? []).map((e) => `${e.txn_date}|${round2(Number(e.amount))}|${e.direction}|${normDesc(String(e.description ?? ""))}`),
      );
      const fresh: ParsedTxn[] = [];
      let dupes = 0;
      for (const r of preview.rows) {
        const key = `${r.txn_date}|${round2(r.amount)}|${r.direction}|${normDesc(r.description)}`;
        if (seen.has(key)) { dupes++; continue; }
        seen.add(key);
        fresh.push(r);
      }
      if (fresh.length === 0) {
        toast.error(`Nothing to import — all ${dupes} transactions already exist in the suspense ledger.`);
        return;
      }

      const { data: stmt, error: stmtErr } = await supabase
        .from("bank_statements")
        .insert({ file_name: preview.fileName, row_count: fresh.length })
        .select("id")
        .single();
      if (stmtErr) throw stmtErr;
      statementId = stmt.id;

      const { error: insErr } = await supabase
        .from("suspense_entries")
        .insert(fresh.map((p) => ({ ...p, statement_id: stmt.id, status: "pending" })));
      if (insErr) throw insErr;

      toast.success(
        `${fresh.length} imported · ${dupes} duplicates skipped · ${preview.unparsed.length} rows need review`,
      );
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["suspense"] });
    } catch (err) {
      console.error("[recon] import failed", err);
      if (statementId) {
        // Never leave a half-imported statement behind.
        await supabase.from("bank_statements").delete().eq("id", statementId);
      }
      toast.error(err instanceof Error ? err.message : "Import failed — nothing was saved");
    } finally {
      setImporting(false);
    }
  }


  async function clearEntry(row: SuspenseRow) {
    const edit = edits[row.id];
    if (!edit?.type) return toast.error("Pick an allocation first");
    const { error } = await supabase
      .from("suspense_entries")
      .update({ status: "cleared", allocation_type: edit.type, allocated_ref: edit.ref || null })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Transaction cleared from suspense");
    qc.invalidateQueries({ queryKey: ["suspense"] });
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected transaction(s)? This permanently removes them from the suspense ledger.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("suspense_entries").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length} transaction(s)`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["suspense"] });
  }

  if (!isFinance) return <AccessDenied />;

  const pending = (entries ?? []).filter((e) => e.status === "pending");
  const cleared = (entries ?? []).filter((e) => e.status === "cleared");
  const receiptOpts = ["invoice", "advance"];
  const paymentOpts = ["expense", "vendor"];

  return (
    <div>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Tally-style suspense ledger. Import a bank statement (Excel / CSV / Text), then allocate each transaction to an invoice, advance, expense, or vendor."
      />
      <Card className="mb-4 p-6">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center">
          {parsing ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <UploadCloud className="h-8 w-8 text-primary" />}
          <span className="text-sm font-medium">{fileName || "Click to upload bank statement"}</span>
          <span className="text-xs text-muted-foreground">.xlsx, .xls, .csv or .txt — columns Date, Description, Debit/Credit (or Amount). Nothing is imported until you review the preview and confirm. For PDF, export to Excel/CSV first.</span>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={handleFile} disabled={parsing || importing} />
        </label>
      </Card>

      {preview && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Import Preview — {preview.fileName}</h3>
            <Badge variant="secondary">{preview.format}</Badge>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreview(null)} disabled={importing}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
              <Button size="sm" onClick={confirmImport} disabled={importing || preview.rows.length === 0}>
                {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                Import {preview.rows.length} transactions
              </Button>
            </div>
          </div>
          <div className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div><div className="text-muted-foreground">Rows detected</div><div className="text-sm font-semibold">{preview.rowsDetected}</div></div>
            <div><div className="text-muted-foreground">Rows parsed</div><div className="text-sm font-semibold">{preview.rows.length}</div></div>
            <div><div className="text-muted-foreground">Need review</div><div className="text-sm font-semibold">{preview.unparsed.length}</div></div>
            <div><div className="text-muted-foreground">Date range</div><div className="text-sm font-semibold">{preview.dateFrom || "—"} → {preview.dateTo || "—"}</div></div>
            <div><div className="text-muted-foreground">Total credits</div><div className="text-sm font-semibold text-emerald-600">{inr2(preview.totalIn)}</div></div>
            <div><div className="text-muted-foreground">Total debits</div><div className="text-sm font-semibold text-destructive">{inr2(preview.totalOut)}</div></div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium">Column mapping:</span>{" "}
            {Object.entries(preview.mapping).map(([k, v]) => `${k} → ${v}`).join(" · ") || "—"}
          </div>
          {preview.unparsed.length > 0 && (
            <div className="mt-3 max-h-40 overflow-auto rounded-lg border p-2 text-xs">
              <div className="mb-1 font-medium text-destructive">Rows needing review (not imported)</div>
              {preview.unparsed.slice(0, 50).map((u) => (
                <div key={u.rowNo} className="truncate text-muted-foreground">Row {u.rowNo}: {u.reason} — {u.raw}</div>
              ))}
            </div>
          )}
          <div className="mt-3 max-h-56 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left uppercase text-muted-foreground">
                <tr><th className="p-2">Date</th><th className="p-2">Description</th><th className="p-2 text-right">Amount</th><th className="p-2">Type</th></tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td className="p-2 whitespace-nowrap">{r.txn_date}</td>
                    <td className="p-2 max-w-xs truncate">{r.description || "—"}</td>
                    <td className="p-2 text-right">{inr2(r.amount)}</td>
                    <td className="p-2">{r.direction === "in" ? "Receipt" : "Payment"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}


      <Card className="mb-4 p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Landmark className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Suspense Ledger — Pending ({pending.length})</h3>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" className="ml-auto" onClick={deleteSelected}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete Selected Entries ({selected.size})
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-10 p-3">
                  <Checkbox
                    checked={pending.length > 0 && pending.every((r) => selected.has(r.id))}
                    onCheckedChange={(c) =>
                      setSelected(c ? new Set(pending.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
                <th className="p-3">Date</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Type</th>
                <th className="p-3">Allocate To</th>
                <th className="p-3">Reference</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pending.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No pending transactions. Import a statement above.</td></tr>
              )}
              {pending.map((row) => {
                const opts = row.direction === "in" ? receiptOpts : paymentOpts;
                const edit = edits[row.id] ?? { type: "", ref: "" };
                const match = suggest(row.description, row.direction);
                const isIn = row.direction === "in";
                return (
                  <tr key={row.id} className={selected.has(row.id) ? "bg-accent/40" : "hover:bg-muted/30"}>
                    <td className="p-3"><Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelect(row.id)} /></td>
                    <td className="p-3 whitespace-nowrap">{row.txn_date}</td>
                    <td className="p-3 max-w-xs truncate">{row.description || "—"}</td>
                    <td className={`p-3 text-right font-semibold ${isIn ? "text-emerald-600" : "text-destructive"}`}>
                      {isIn ? "+" : "−"} {inr2(row.amount)}
                    </td>
                    <td className="p-3">
                      <Badge className={isIn ? "bg-emerald-600 text-white hover:bg-emerald-600" : "bg-destructive text-white hover:bg-destructive"}>
                        {isIn ? "Receipt" : "Payment"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Select value={edit.type} onValueChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...edit, type: v } }))}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {opts.map((o) => <SelectItem key={o} value={o}>{ALLOC_LABELS[o]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {match && !edit.type && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                          onClick={() => setEdits((s) => ({ ...s, [row.id]: { type: match.type, ref: match.ref } }))}
                        >
                          ✨ {match.label}
                        </button>
                      )}
                    </td>
                    <td className="p-3">
                      <Input
                        className="h-8 w-40"
                        placeholder="Invoice no / vendor / note"
                        value={edit.ref}
                        onChange={(e) => setEdits((s) => ({ ...s, [row.id]: { ...edit, ref: e.target.value } }))}
                      />
                    </td>

                    <td className="p-3 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setSplitFor(row)}>
                        <Split className="mr-1 h-4 w-4" /> Split
                      </Button>
                      <Button size="sm" onClick={() => clearEntry(row)}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Clear
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>


      {cleared.length > 0 && (
        <Card className="p-0">
          <div className="border-b p-3"><h3 className="text-sm font-semibold">Cleared ({cleared.length})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3 text-right">Amount</th><th className="p-3">Allocated</th><th className="p-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y">
                {cleared.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 whitespace-nowrap">{row.txn_date}</td>
                    <td className="p-3 max-w-xs truncate">{row.description || "—"}</td>
                    <td className="p-3 text-right">{inr2(row.amount)}</td>
                    <td className="p-3">{row.allocation_type ? ALLOC_LABELS[row.allocation_type] : "—"}</td>
                    <td className="p-3">{row.allocated_ref || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SplitDialog row={splitFor} onClose={() => setSplitFor(null)} onDone={() => { setSplitFor(null); qc.invalidateQueries({ queryKey: ["suspense"] }); }} />
    </div>
  );
}

interface AllocDraft { target_type: "invoice" | "purchase" | "vendor_payment" | "expense"; target_ref: string; target_id: string; amount: number; note: string; }

function SplitDialog({ row, onClose, onDone }: { row: SuspenseRow | null; onClose: () => void; onDone: () => void }) {
  const apply = useServerFn(applyReconAllocations);
  const listFn = useServerFn(listReconAllocations);
  const [drafts, setDrafts] = useState<AllocDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: invoices } = useQuery({
    queryKey: ["recon-inv-search"],
    enabled: !!row,
    queryFn: async () =>
      (await supabase.from("invoices").select("id, invoice_no, customer_name, pending_balance").is("voided_at", null).gt("pending_balance", 0).limit(50)).data ?? [],
  });
  const { data: purchases } = useQuery({
    queryKey: ["recon-po-search"],
    enabled: !!row,
    queryFn: async () => (await supabase.from("purchases").select("id, bill_no, company_name, purchase_rate, quantity").limit(50)).data ?? [],
  });

  const { data: vendors } = useQuery({
    queryKey: ["recon-vendors-search"],
    enabled: !!row,
    queryFn: async () => (await supabase.from("vendors").select("id, name").limit(50)).data ?? [],
  });
  const { data: existing } = useQuery({
    queryKey: ["recon-allocs", row?.id],
    enabled: !!row,
    queryFn: () => listFn({ data: { bank_txn_id: row!.id } }),
  });

  if (!row) return null;
  const allocated = ((existing ?? []) as { amount: number }[]).reduce((s, a) => s + Number(a.amount), 0);
  const draftTotal = drafts.reduce((s, d) => s + (d.amount || 0), 0);
  const remaining = round2(row.amount - allocated - draftTotal);

  function addDraft() {
    setDrafts((d) => [...d, { target_type: "invoice", target_ref: "", target_id: "", amount: Math.max(0, remaining), note: "" }]);
  }
  function updateDraft(i: number, patch: Partial<AllocDraft>) {
    setDrafts((d) => d.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  }
  function removeDraft(i: number) { setDrafts((d) => d.filter((_, k) => k !== i)); }

  async function submit() {
    if (drafts.length === 0) return toast.error("Add at least one allocation");
    for (const d of drafts) {
      if (!d.target_id) return toast.error("Pick a target for every split");
      if (!(d.amount > 0)) return toast.error("Amount must be > 0");
    }
    setBusy(true);
    try {
      const bankTxnId = row!.id;
      await apply({ data: { bank_txn_id: bankTxnId, allocations: drafts.map((d) => ({ target_type: d.target_type, target_id: d.target_id, target_ref: d.target_ref, amount: round2(d.amount), note: d.note || null })) } });
      toast.success(`Applied ${drafts.length} allocation(s)`);
      setDrafts([]);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Split Allocate — {inr2(row.amount)} ({row.txn_date})</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{row.description}</p>
        <div className="rounded border p-2 text-xs">
          Already allocated: <b>{inr2(allocated)}</b> · Draft: <b>{inr2(draftTotal)}</b> · Remaining: <b className={remaining < 0 ? "text-destructive" : ""}>{inr2(remaining)}</b>
        </div>

        {(existing ?? []).length > 0 && (
          <div className="rounded border">
            <div className="border-b p-2 text-xs font-semibold">Existing allocations</div>
            {(existing as { id: string; target_type: string; target_ref: string | null; amount: number }[]).map((a) => (
              <div key={a.id} className="flex items-center justify-between border-t p-2 text-xs">
                <span>{a.target_type} · {a.target_ref ?? "—"}</span>
                <span className="font-semibold">{inr2(Number(a.amount))}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {drafts.map((d, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded border p-2">
              <Select value={d.target_type} onValueChange={(v) => updateDraft(i, { target_type: v as AllocDraft["target_type"], target_id: "", target_ref: "" })}>
                <SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="vendor_payment">Vendor Payment</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={d.target_id}
                onValueChange={(v) => {
                  const label =
                    d.target_type === "invoice" ? invoices?.find((x) => x.id === v) :
                    d.target_type === "purchase" ? purchases?.find((x) => x.id === v) :
                    d.target_type === "vendor_payment" ? vendors?.find((x) => x.id === v) : null;
                  const ref =
                    d.target_type === "invoice" ? (label as { invoice_no?: string } | null)?.invoice_no :
                    d.target_type === "purchase" ? (label as { bill_no?: string } | null)?.bill_no :
                    d.target_type === "vendor_payment" ? (label as { name?: string } | null)?.name : "";
                  updateDraft(i, { target_id: v, target_ref: ref ?? "" });
                }}
              >
                <SelectTrigger className="col-span-5 h-8 text-xs"><SelectValue placeholder="Pick target…" /></SelectTrigger>
                <SelectContent>
                  {d.target_type === "invoice" && (invoices ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.invoice_no} · {x.customer_name} · {inr2(Number(x.pending_balance))}</SelectItem>)}
                  {d.target_type === "purchase" && (purchases ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.bill_no ?? "—"} · {x.company_name ?? "—"} · {inr2(Number(x.purchase_rate) * Number(x.quantity))}</SelectItem>)}
                  {d.target_type === "vendor_payment" && (vendors ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                  {d.target_type === "expense" && <SelectItem value="__manual__">Manual — enter note below</SelectItem>}
                </SelectContent>
              </Select>
              <Input type="number" className="col-span-2 h-8 text-xs" value={d.amount} onChange={(e) => updateDraft(i, { amount: Number(e.target.value) })} />
              <Input className="col-span-1 h-8 text-xs" placeholder="note" value={d.note} onChange={(e) => updateDraft(i, { note: e.target.value })} />
              <Button size="sm" variant="ghost" className="col-span-1" onClick={() => removeDraft(i)}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addDraft}><Plus className="mr-1 h-4 w-4" /> Add split</Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || drafts.length === 0}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Apply {drafts.length} split(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

