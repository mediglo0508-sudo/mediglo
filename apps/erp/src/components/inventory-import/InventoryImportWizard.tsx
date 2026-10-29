import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate } from "@/lib/date-format";
import {
  readWorkbook,
  extractRows,
  validateAll,
  toPayload,
  chunk,
  parseExpiry,
  FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type SheetInfo,
  type ParsedRow,
} from "@/lib/inventory-import";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Download,
  RotateCcw,
} from "lucide-react";

const STEPS = [
  "Upload Excel",
  "Preview & Map",
  "Validation",
  "Resolve Errors",
  "Import Progress",
  "Verification",
  "Import Report",
] as const;

const STAGES = [
  "Reading",
  "Validating",
  "Creating Masters",
  "Importing Products",
  "Creating Batches",
  "Updating Stock",
] as const;

const CHUNK_SIZE = 500;

interface RunTotals {
  products_created: number;
  products_matched: number;
  batches_created: number;
  batches_updated: number;
  quantity_applied: number;
  errors: { row_index: number; name: string; reason: string }[];
}

interface Verification {
  excelQty: number;
  ledgerQty: number;
  ledgerRows: number;
  orphanBatches: number;
  negativeStock: number;
  ok: boolean;
}

export function InventoryImportWizard() {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<RunTotals | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const good = useMemo(() => rows.filter((r) => r.errors.length === 0 && !r.skip), [rows]);
  const bad = useMemo(() => rows.filter((r) => r.errors.length > 0 && !r.skip), [rows]);
  const skipped = useMemo(() => rows.filter((r) => r.skip), [rows]);
  const excelQty = useMemo(() => good.reduce((s, r) => s + r.quantity, 0), [good]);

  const reset = () => {
    setStep(0);
    setFileName("");
    setSheets([]);
    setRows([]);
    setTotals(null);
    setVerification(null);
    setProgress(0);
    setStage(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const parsed = readWorkbook(buf);
      if (!parsed.length) {
        toast.error("No readable sheets in this workbook.");
        return;
      }
      setFileName(file.name);
      setSheets(parsed);
      setStep(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    }
  }, []);

  function setSheetCategory(i: number, value: string) {
    setSheets((prev) => prev.map((s, j) => (j === i ? { ...s, category: value as SheetInfo["category"] } : s)));
  }

  function setMapping(i: number, field: ImportField, colIdx: string) {
    setSheets((prev) =>
      prev.map((s, j) => {
        if (j !== i) return s;
        const mapping = { ...s.mapping };
        if (colIdx === "none") delete mapping[field];
        else mapping[field] = Number(colIdx);
        return { ...s, mapping };
      }),
    );
  }

  function runValidation() {
    const all = sheets.flatMap((s) => extractRows(s));
    if (!all.length) {
      toast.error("No data rows found — check the sheet category and column mapping.");
      return;
    }
    setRows(validateAll(all));
    setStep(2);
  }

  function editRow(rowIndex: number, patch: Partial<ParsedRow>) {
    setRows((prev) =>
      validateAll(
        prev.map((r) => {
          if (r.row_index !== rowIndex) return r;
          const next = { ...r, ...patch };
          if (patch.expiry_raw !== undefined) next.expiry_date = parseExpiry(patch.expiry_raw).iso;
          return next;
        }),
      ),
    );
  }

  function toggleSkip(rowIndex: number) {
    setRows((prev) => prev.map((r) => (r.row_index === rowIndex ? { ...r, skip: !r.skip } : r)));
  }

  async function runImport() {
    if (!good.length) {
      toast.error("Nothing valid to import.");
      return;
    }
    setStep(4);
    setRunning(true);
    setProgress(0);
    const started = performance.now();
    const importId = crypto.randomUUID();
    const agg: RunTotals = {
      products_created: 0,
      products_matched: 0,
      batches_created: 0,
      batches_updated: 0,
      quantity_applied: 0,
      errors: [],
    };
    try {
      setStage(0);
      await new Promise((r) => setTimeout(r, 120));
      setStage(1);
      const payload = good.map(toPayload);
      const parts = chunk(payload, CHUNK_SIZE);
      for (let i = 0; i < parts.length; i++) {
        setStage(Math.min(2 + i, 4));
        const { data, error } = await supabase.rpc("import_inventory_rows", {
          rows: parts[i] as unknown as never,
          import_id: importId,
        });
        if (error) throw error;
        const res = data as unknown as RunTotals;
        agg.products_created += res.products_created ?? 0;
        agg.products_matched += res.products_matched ?? 0;
        agg.batches_created += res.batches_created ?? 0;
        agg.batches_updated += res.batches_updated ?? 0;
        agg.quantity_applied += Number(res.quantity_applied ?? 0);
        agg.errors.push(...(res.errors ?? []));
        setProgress(Math.round(((i + 1) / parts.length) * 100));
      }
      setStage(5);
      setTotals(agg);
      setElapsed(Math.round(performance.now() - started));

      // ---- Step 6: reconciliation against the ledger ----
      const { data: ledger } = await supabase
        .from("inventory_ledger")
        .select("quantity_change")
        .eq("import_id", importId);
      const ledgerQty = (ledger ?? []).reduce((s, l) => s + Number(l.quantity_change ?? 0), 0);
      const { count: orphanBatches } = await supabase
        .from("inventory_batches")
        .select("id", { count: "exact", head: true })
        .is("inventory_id", null);
      const { count: negativeStock } = await supabase
        .from("inventory")
        .select("id", { count: "exact", head: true })
        .lt("stock", 0);
      const expectedQty = payload.reduce((s, r) => s + r.quantity, 0) - 0;
      const failedQty = agg.errors.reduce((s, e) => {
        const row = payload.find((p) => p.row_index === e.row_index);
        return s + (row?.quantity ?? 0);
      }, 0);
      const v: Verification = {
        excelQty: expectedQty - failedQty,
        ledgerQty,
        ledgerRows: ledger?.length ?? 0,
        orphanBatches: orphanBatches ?? 0,
        negativeStock: negativeStock ?? 0,
        ok: false,
      };
      v.ok = Math.abs(v.excelQty - v.ledgerQty) < 0.001 && v.orphanBatches === 0 && v.negativeStock === 0;
      setVerification(v);
      setStep(5);
      if (v.ok) toast.success(`Imported ${agg.batches_created + agg.batches_updated} batches — reconciliation passed.`);
      else toast.warning("Import finished but reconciliation reported a mismatch.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setTotals(agg);
      setStep(6);
    } finally {
      setElapsed(Math.round(performance.now() - started));
      setRunning(false);
    }
  }

  function downloadErrors() {
    const lines = [
      "excel_row,sheet,product,batch,quantity,reason",
      ...bad.map((r) => `${r.row_index},"${r.sheet}","${r.name}","${r.batch_no}",${r.quantity},"${r.errors.join("; ")}"`),
      ...(totals?.errors ?? []).map((e) => `${e.row_index},,"${e.name}",,,"${e.reason}"`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inventory-import-errors.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      {/* stepper */}
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              i === step
                ? "border-primary bg-primary text-primary-foreground"
                : i < step
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground"
            }`}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {/* STEP 1 — upload */}
      {step === 0 && (
        <Card className="p-6 text-center">
          <UploadCloud className="mx-auto mb-3 h-10 w-10 text-primary" />
          <p className="mb-1 text-sm font-semibold">Upload an inventory workbook</p>
          <p className="mb-4 text-xs text-muted-foreground">
            .xlsx / .xls · multiple sheets supported · Retail and Injectable only (In-house is skipped this sprint)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="mx-auto block max-w-xs text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </Card>
      )}

      {/* STEP 2 — preview & map */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{fileName}</span> · {sheets.length} sheet(s). Columns are
            auto-detected — override anything that looks wrong.
          </p>
          {sheets.map((s, i) => (
            <Card key={s.sheetName} className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{s.sheetName}</p>
                  <p className="text-xs text-muted-foreground">
                    Header on Excel row {s.headerRowIndex + 1} · {s.rows.length} data row(s)
                  </p>
                </div>
                <Select value={s.category} onValueChange={(v) => setSheetCategory(i, v)}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Injectable">Injectable</SelectItem>
                    <SelectItem value="skip">Skip this sheet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {s.category !== "skip" && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {IMPORT_FIELDS.map((f) => (
                      <div key={f}>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          {FIELD_LABELS[f]}
                        </label>
                        <Select
                          value={s.mapping[f] === undefined ? "none" : String(s.mapping[f])}
                          onValueChange={(v) => setMapping(i, f, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— not mapped —</SelectItem>
                            {s.headers.map((h, hi) => (
                              <SelectItem key={hi} value={String(hi)}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 max-h-52 overflow-auto rounded border">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {s.headers.map((h, hi) => (
                            <th key={hi} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.slice(0, 12).map((r, ri) => (
                          <tr key={ri} className="border-t">
                            {s.headers.map((_, ci) => (
                              <td key={ci} className="whitespace-nowrap px-2 py-1">
                                {String((r as unknown[])?.[ci] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={runValidation}>
              Validate <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — validation summary */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total rows" value={rows.length} />
            <Stat label="Valid" value={good.length} tone="ok" />
            <Stat label="With errors" value={bad.length} tone={bad.length ? "bad" : undefined} />
            <Stat label="Total quantity" value={excelQty} />
          </div>
          <Card className="max-h-[420px] overflow-auto p-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <Th>Row</Th>
                  <Th>Category</Th>
                  <Th>Product</Th>
                  <Th>Brand / Company</Th>
                  <Th>Batch</Th>
                  <Th>Expiry</Th>
                  <Th>MRP</Th>
                  <Th>Qty</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row_index} className={`border-t ${r.errors.length ? "bg-destructive/5" : ""}`}>
                    <Td>{r.row_index}</Td>
                    <Td>{r.category}</Td>
                    <Td>
                      {r.name}
                      {r.sub_category && <span className="ml-1 text-muted-foreground">· {r.sub_category}</span>}
                      {r.mergedFrom?.length ? (
                        <Badge variant="secondary" className="ml-1">
                          merged {r.mergedFrom.length}
                        </Badge>
                      ) : null}
                    </Td>
                    <Td>{[r.brand, r.company].filter(Boolean).join(" / ")}</Td>
                    <Td>{r.batch_no}</Td>
                    <Td>{r.expiry_date ? fmtDate(r.expiry_date) : r.expiry_raw}</Td>
                    <Td>{r.mrp}</Td>
                    <Td>{r.quantity}</Td>
                    <Td>
                      {r.errors.length ? (
                        <span className="text-destructive">{r.errors.join("; ")}</span>
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-cos-open" />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Remap
            </Button>
            <Button onClick={() => setStep(3)}>
              {bad.length ? "Resolve errors" : "Continue"} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 — resolve */}
      {step === 3 && (
        <div className="space-y-3">
          {bad.length === 0 ? (
            <Card className="p-6 text-center text-sm">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-cos-open" />
              Every row passed validation. {good.length} rows ready, {excelQty} units.
            </Card>
          ) : (
            <Card className="max-h-[420px] overflow-auto p-0">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <Th>Row</Th>
                    <Th>Product</Th>
                    <Th>Batch</Th>
                    <Th>Expiry</Th>
                    <Th>MRP</Th>
                    <Th>Qty</Th>
                    <Th>Problem</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {bad.map((r) => (
                    <tr key={r.row_index} className="border-t">
                      <Td>{r.row_index}</Td>
                      <Td>
                        <Input
                          className="h-7 w-40 text-xs"
                          value={r.name}
                          onChange={(e) => editRow(r.row_index, { name: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <Input
                          className="h-7 w-28 text-xs"
                          value={r.batch_no}
                          onChange={(e) => editRow(r.row_index, { batch_no: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <Input
                          className="h-7 w-24 text-xs"
                          value={r.expiry_raw}
                          onChange={(e) => editRow(r.row_index, { expiry_raw: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <Input
                          type="number"
                          className="h-7 w-20 text-xs"
                          value={r.mrp}
                          onChange={(e) => editRow(r.row_index, { mrp: Number(e.target.value) })}
                        />
                      </Td>
                      <Td>
                        <Input
                          type="number"
                          className="h-7 w-16 text-xs"
                          value={r.quantity}
                          onChange={(e) => editRow(r.row_index, { quantity: Number(e.target.value) })}
                        />
                      </Td>
                      <Td className="text-destructive">{r.errors.join("; ")}</Td>
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => toggleSkip(r.row_index)}>
                          Ignore row
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={runImport} disabled={running || good.length === 0}>
              Import {good.length} rows <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            {bad.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {bad.length} row(s) still failing — they will be left out and listed in the report.
              </span>
            )}
            {skipped.length > 0 && (
              <span className="text-xs text-muted-foreground">{skipped.length} ignored</span>
            )}
          </div>
        </div>
      )}

      {/* STEP 5 — progress */}
      {step === 4 && (
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {STAGES.map((s, i) => (
              <Badge key={s} variant={i <= stage ? "default" : "secondary"}>
                {i < stage ? "✓ " : i === stage ? "● " : ""}
                {s}
              </Badge>
            ))}
          </div>
          <Progress value={progress} className="mb-2" />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            {progress}% · {good.length} rows in chunks of {CHUNK_SIZE}
          </p>
        </Card>
      )}

      {/* STEP 6 — verification */}
      {step === 5 && verification && (
        <div className="space-y-3">
          <Card className={`p-5 ${verification.ok ? "border-cos-open" : "border-destructive"}`}>
            <div className="mb-3 flex items-center gap-2">
              {verification.ok ? (
                <CheckCircle2 className="h-5 w-5 text-cos-open" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              <p className="text-sm font-semibold">
                {verification.ok ? "Reconciliation passed" : "Reconciliation mismatch — review before trusting stock"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Excel quantity" value={verification.excelQty} />
              <Stat
                label="Ledger quantity"
                value={verification.ledgerQty}
                tone={verification.excelQty === verification.ledgerQty ? "ok" : "bad"}
              />
              <Stat label="Ledger entries" value={verification.ledgerRows} />
              <Stat
                label="Orphan batches"
                value={verification.orphanBatches}
                tone={verification.orphanBatches ? "bad" : "ok"}
              />
              <Stat
                label="Negative stock items"
                value={verification.negativeStock}
                tone={verification.negativeStock ? "bad" : "ok"}
              />
            </div>
          </Card>
          <Button onClick={() => setStep(6)}>
            View report <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* STEP 7 — report */}
      {step === 6 && totals && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total rows" value={rows.length} />
            <Stat label="Products created" value={totals.products_created} tone="ok" />
            <Stat label="Products updated" value={totals.products_matched} />
            <Stat label="Batches created" value={totals.batches_created} tone="ok" />
            <Stat label="Batches topped up" value={totals.batches_updated} />
            <Stat label="Quantity applied" value={totals.quantity_applied} />
            <Stat label="Skipped / ignored" value={skipped.length} />
            <Stat
              label="Errors"
              value={bad.length + totals.errors.length}
              tone={bad.length + totals.errors.length ? "bad" : "ok"}
            />
          </div>
          <p className="text-xs text-muted-foreground">Execution time: {(elapsed / 1000).toFixed(2)}s</p>
          {(bad.length > 0 || totals.errors.length > 0) && (
            <Card className="max-h-64 overflow-auto p-0">
              <div className="border-b p-2 text-xs font-semibold">Failed rows</div>
              <table className="w-full text-[11px]">
                <tbody>
                  {bad.map((r) => (
                    <tr key={`v${r.row_index}`} className="border-t">
                      <Td>{r.row_index}</Td>
                      <Td>{r.name}</Td>
                      <Td className="text-destructive">{r.errors.join("; ")}</Td>
                    </tr>
                  ))}
                  {totals.errors.map((e, i) => (
                    <tr key={`d${i}`} className="border-t">
                      <Td>{e.row_index}</Td>
                      <Td>{e.name}</Td>
                      <Td className="text-destructive">{e.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <div className="flex gap-2">
            {(bad.length > 0 || totals.errors.length > 0) && (
              <Button variant="outline" onClick={downloadErrors}>
                <Download className="mr-1 h-4 w-4" /> Error CSV
              </Button>
            )}
            <Button onClick={reset}>
              <RotateCcw className="mr-1 h-4 w-4" /> New import
            </Button>
          </div>
        </div>
      )}

      {step === 6 && !totals && (
        <Card className="p-6 text-center text-sm">
          <XCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
          The import did not complete. Nothing was left half-written — re-run after fixing the reported issue.
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold ${
          tone === "ok" ? "text-cos-open" : tone === "bad" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const Th = ({ children }: { children?: React.ReactNode }) => (
  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{children}</th>
);
const Td = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <td className={`px-2 py-1 align-middle ${className}`}>{children}</td>
);
