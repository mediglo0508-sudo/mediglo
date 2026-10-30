import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate, todayIST } from "@/lib/utils";
import { BookOpen, Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// Local types matching public.ledger_accounts / public.vouchers / public.voucher_entries
// ---------------------------------------------------------------------------

type AccountGroup = "assets" | "liabilities" | "income" | "expense" | "equity";
type VoucherType = "sales" | "purchase" | "payment" | "receipt" | "contra" | "credit_note" | "debit_note";

// 'sales' vouchers are created automatically by the backend when a bill is created/edited -
// they must never be manually creatable from this page.
const MANUAL_VOUCHER_TYPES: { value: Exclude<VoucherType, "sales">; label: string }[] = [
  { value: "purchase", label: "Purchase" },
  { value: "payment", label: "Payment" },
  { value: "receipt", label: "Receipt" },
  { value: "contra", label: "Contra" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
];

interface LedgerAccount {
  id: string;
  name: string;
  account_group: AccountGroup;
  is_system: boolean;
  active: boolean;
}

interface VoucherEntryRow {
  id: string;
  voucher_id: string;
  ledger_account_id: string;
  debit: number;
  credit: number;
  ledger_accounts: { name: string } | null;
}

interface VoucherRow {
  id: string;
  voucher_type: VoucherType;
  voucher_no: string | null;
  voucher_date: string;
  invoice_id: string | null;
  narration: string | null;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  created_at: string;
  voucher_entries: VoucherEntryRow[];
}

export default function AccountingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Accounting</h1>

      <Tabs defaultValue="daybook">
        <TabsList>
          <TabsTrigger value="daybook">New & Day Book</TabsTrigger>
          <TabsTrigger value="ledger">Account Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="daybook" className="space-y-4">
          <NewVoucherCard />
          <DayBookCard />
        </TabsContent>
        <TabsContent value="ledger">
          <AccountLedgerCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New voucher (manual double-entry) form
// ---------------------------------------------------------------------------

function useLedgerAccounts() {
  return useQuery({
    queryKey: ["ledger_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_accounts")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as LedgerAccount[];
    },
    staleTime: 60_000,
  });
}

function NewVoucherCard() {
  const queryClient = useQueryClient();
  const { data: accounts } = useLedgerAccounts();

  const [voucherType, setVoucherType] = useState<Exclude<VoucherType, "sales">>("payment");
  const [voucherDate, setVoucherDate] = useState(() => todayIST());
  const [narration, setNarration] = useState("");
  const [amount, setAmount] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [cgst, setCgst] = useState("0");
  const [sgst, setSgst] = useState("0");
  const [igst, setIgst] = useState("0");
  const [saving, setSaving] = useState(false);

  const isNote = voucherType === "credit_note" || voucherType === "debit_note";

  function reset() {
    setNarration("");
    setAmount("");
    setDebitAccountId("");
    setCreditAccountId("");
    setCgst("0");
    setSgst("0");
    setIgst("0");
  }

  async function handleSave() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!debitAccountId || !creditAccountId) {
      toast.error("Select both a debit and a credit account");
      return;
    }
    if (debitAccountId === creditAccountId) {
      toast.error("Debit and credit accounts must be different");
      return;
    }
    setSaving(true);
    try {
      // create_manual_voucher() posts the header + both entries atomically and
      // assigns voucher_no server-side via a real sequence (see
      // 0011_production_hardening.sql) - the previous
      // `${type}-${Date.now().toString().slice(-6)}` client-generated number
      // repeated every ~16.7 minutes and could collide with the `voucher_no
      // unique` constraint, and a failure between the old two separate
      // inserts could leave a voucher header with zero entries.
      const { data: voucher, error } = await supabase.rpc("create_manual_voucher", {
        p_voucher_type: voucherType,
        p_voucher_date: voucherDate,
        p_narration: narration || null,
        p_entries: [
          { ledger_account_id: debitAccountId, debit: amt, credit: 0 },
          { ledger_account_id: creditAccountId, debit: 0, credit: amt },
        ],
        p_cgst: isNote ? Number(cgst) || 0 : 0,
        p_sgst: isNote ? Number(sgst) || 0 : 0,
        p_igst: isNote ? Number(igst) || 0 : 0,
      });
      if (error) throw error;

      toast.success(`Voucher ${voucher?.voucher_no ?? ""} created`);
      reset();
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create voucher");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> New Voucher
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Voucher Type</Label>
            <Select value={voucherType} onValueChange={(v) => setVoucherType(v as Exclude<VoucherType, "sales">)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <Label>Narration</Label>
            <Textarea className="min-h-[40px]" placeholder="Optional note" value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>
        </div>

        {isNote && (
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">CGST (₹, optional)</Label>
              <Input type="number" min={0} value={cgst} onChange={(e) => setCgst(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SGST (₹, optional)</Label>
              <Input type="number" min={0} value={sgst} onChange={(e) => setSgst(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">IGST (₹, optional)</Label>
              <Input type="number" min={0} value={igst} onChange={(e) => setIgst(e.target.value)} />
            </div>
            <p className="col-span-full text-xs text-muted-foreground">
              Recorded on the voucher for GST reporting. The debit/credit accounts below still fully control how this note
              actually posts to the ledger.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Debit Account</Label>
            <Select value={debitAccountId} onValueChange={setDebitAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select debit account..." />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Credit Account</Label>
            <Select value={creditAccountId} onValueChange={setCreditAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select credit account..." />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Voucher"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Day book: filterable voucher list
// ---------------------------------------------------------------------------

const ALL_VOUCHER_TYPES: { value: VoucherType; label: string }[] = [
  { value: "sales", label: "Sales" },
  ...MANUAL_VOUCHER_TYPES,
];

function DayBookCard() {
  const [typeFilter, setTypeFilter] = useState<VoucherType | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: vouchers, isLoading } = useQuery({
    queryKey: ["vouchers", typeFilter, fromDate, toDate],
    queryFn: async () => {
      let q = supabase
        .from("vouchers")
        .select("*, voucher_entries(*, ledger_accounts(name))")
        .order("voucher_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (typeFilter !== "all") q = q.eq("voucher_type", typeFilter);
      if (fromDate) q = q.gte("voucher_date", fromDate);
      if (toDate) q = q.lte("voucher_date", toDate);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data as unknown as VoucherRow[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Day Book
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as VoucherType | "all")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ALL_VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Voucher No</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entries</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (vouchers ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No vouchers found for this filter.
                </TableCell>
              </TableRow>
            )}
            {(vouchers ?? []).map((v) => {
              const debits = v.voucher_entries.filter((e) => e.debit > 0);
              const credits = v.voucher_entries.filter((e) => e.credit > 0);
              return (
                <TableRow key={v.id}>
                  <TableCell>{formatDate(v.voucher_date)}</TableCell>
                  <TableCell className="font-mono text-xs">{v.voucher_no ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={v.voucher_type === "sales" ? "secondary" : "outline"} className="capitalize">
                      {v.voucher_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    Dr: {debits.map((d) => d.ledger_accounts?.name ?? "-").join(", ") || "-"} / Cr:{" "}
                    {credits.map((c) => c.ledger_accounts?.name ?? "-").join(", ") || "-"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{v.narration ?? "-"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(v.amount)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account ledger with running balance
// ---------------------------------------------------------------------------

interface LedgerEntryRow {
  id: string;
  debit: number;
  credit: number;
  vouchers: {
    voucher_date: string;
    voucher_no: string | null;
    voucher_type: VoucherType;
    narration: string | null;
    created_at: string;
  } | null;
}

function AccountLedgerCard() {
  const { data: accounts } = useLedgerAccounts();
  const [accountId, setAccountId] = useState("");

  const selectedAccount = (accounts ?? []).find((a) => a.id === accountId) ?? null;

  const { data: entries, isLoading } = useQuery({
    queryKey: ["ledger_entries", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      // Order server-side by the actual voucher date (a stable sort, unlike
      // the client-side comparator this replaces - see the note below) so
      // the running balance is computed in a real chronological sequence.
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("id, debit, credit, vouchers!inner(voucher_date, voucher_no, voucher_type, narration, created_at)")
        .eq("ledger_account_id", accountId)
        .order("voucher_date", { foreignTable: "vouchers", ascending: true })
        .order("created_at", { foreignTable: "vouchers", ascending: true });
      if (error) throw error;
      return (data as unknown as LedgerEntryRow[]).filter((r) => r.vouchers);
    },
  });

  // Sign convention: assets/expense accounts increase on debit; liabilities/income/equity increase on credit.
  const increasesOnDebit = selectedAccount ? selectedAccount.account_group === "assets" || selectedAccount.account_group === "expense" : true;

  const withBalance = useMemo(() => {
    let running = 0;
    return (entries ?? []).map((e) => {
      const delta = increasesOnDebit ? e.debit - e.credit : e.credit - e.debit;
      running += delta;
      return { ...e, balance: running };
    });
  }, [entries, increasesOnDebit]);

  const closingBalance = withBalance.length > 0 ? withBalance[withBalance.length - 1].balance : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Ledger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-xs space-y-1">
          <Label className="text-xs">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an account..." />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.account_group})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!accountId ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Select an account to view its ledger.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && withBalance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No transactions recorded against this account yet.
                    </TableCell>
                  </TableRow>
                )}
                {withBalance.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.vouchers!.voucher_date)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.vouchers!.voucher_no ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {e.vouchers!.voucher_type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{e.vouchers!.narration ?? "-"}</TableCell>
                    <TableCell className="text-right">{e.debit > 0 ? formatINR(e.debit) : "-"}</TableCell>
                    <TableCell className="text-right">{e.credit > 0 ? formatINR(e.credit) : "-"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatINR(e.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rounded-md bg-accent p-3 text-right text-sm font-bold">Closing Balance: {formatINR(closingBalance)}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
