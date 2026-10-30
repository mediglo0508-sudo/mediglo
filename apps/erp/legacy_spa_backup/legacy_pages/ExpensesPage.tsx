import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatINR, formatDate, todayIST } from "@/lib/utils";
import type { IndirectExpense, PaymentMode } from "@/types/domain";
import { Plus, Pencil, Trash2, Receipt, Info } from "lucide-react";

const ROW_LIMIT = 500;

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "electricity", label: "Electricity" },
  { value: "cleaning_supplies", label: "Cleaning Supplies" },
  { value: "machine_maintenance", label: "Machine Maintenance" },
  { value: "salary_advance", label: "Salary Advance" },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "other", label: "Other" },
];

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "netbanking", label: "Net Banking" },
  { value: "split", label: "Split" },
];

function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: expenses, isLoading, isError } = useQuery({
    queryKey: ["indirect_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indirect_expenses")
        .select("*")
        .order("expense_date", { ascending: false })
        .limit(ROW_LIMIT);
      if (error) throw error;
      return data as IndirectExpense[];
    },
  });

  const summary = useMemo(() => {
    const rows = expenses ?? [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = startOfWeek(now);

    let monthTotal = 0;
    let weekTotal = 0;
    const monthByCategory: Record<string, number> = {};

    for (const e of rows) {
      const d = new Date(e.expense_date);
      const amt = Number(e.amount) || 0;
      if (d >= monthStart) {
        monthTotal += amt;
        monthByCategory[e.category] = (monthByCategory[e.category] ?? 0) + amt;
      }
      if (d >= weekStart) weekTotal += amt;
    }

    let topCategory: string | null = null;
    let topAmount = 0;
    for (const [cat, amt] of Object.entries(monthByCategory)) {
      if (amt > topAmount) {
        topAmount = amt;
        topCategory = cat;
      }
    }

    return { monthTotal, weekTotal, topCategory, topAmount };
  }, [expenses]);

  async function addExpense(form: ExpenseFormValues) {
    const { error } = await supabase.from("indirect_expenses").insert({
      category: form.category,
      description: form.description || null,
      amount: Number(form.amount) || 0,
      paid_to: form.paid_to || null,
      payment_mode: form.payment_mode,
      expense_date: form.expense_date,
      recorded_by: user?.id ?? null,
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["indirect_expenses"] });
  }

  async function updateExpense(id: string, form: ExpenseFormValues) {
    const { error } = await supabase
      .from("indirect_expenses")
      .update({
        category: form.category,
        description: form.description || null,
        amount: Number(form.amount) || 0,
        paid_to: form.paid_to || null,
        payment_mode: form.payment_mode,
        expense_date: form.expense_date,
      })
      .eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["indirect_expenses"] });
  }

  async function deleteExpense(id: string) {
    const { error } = await supabase.from("indirect_expenses").delete().eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["indirect_expenses"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Indirect Expenses</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total This Month" value={formatINR(summary.monthTotal)} />
        <SummaryCard label="Total This Week" value={formatINR(summary.weekTotal)} />
        <SummaryCard
          label="Top Category (This Month)"
          value={summary.topCategory ? `${categoryLabel(summary.topCategory)} - ${formatINR(summary.topAmount)}` : "-"}
        />
      </div>

      <AddExpenseCard onSave={addExpense} />

      {(expenses ?? []).length >= ROW_LIMIT && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          <Info className="h-4 w-4 shrink-0" />
          Showing the most recent {ROW_LIMIT} expenses. Older entries exist but aren't listed here - use the GST / ITR Export Hub
          or a direct database query for full historical reporting.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Expense Log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead>Payment Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-destructive">
                    Couldn't load expenses - check your connection and try again.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !isError && (expenses ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No expenses recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {(expenses ?? []).map((e) => (
                <ExpenseRow key={e.id} expense={e} onSave={(form) => updateExpense(e.id, form)} onDelete={() => deleteExpense(e.id)} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

interface ExpenseFormValues {
  category: string;
  description: string;
  amount: string;
  paid_to: string;
  payment_mode: PaymentMode;
  expense_date: string;
}

function emptyForm(): ExpenseFormValues {
  return {
    category: "other",
    description: "",
    amount: "",
    paid_to: "",
    payment_mode: "cash",
    expense_date: todayIST(),
  };
}

function AddExpenseCard({ onSave }: { onSave: (form: ExpenseFormValues) => Promise<void> }) {
  const [form, setForm] = useState<ExpenseFormValues>(emptyForm());
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      toast.success("Expense recorded");
      setForm(emptyForm());
    } catch (err: any) {
      toast.error(err.message ?? "Failed to record expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Expense
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Paid To (optional)</Label>
            <Input placeholder="Vendor / staff name" value={form.paid_to} onChange={(e) => setForm((f) => ({ ...f, paid_to: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Payment Mode</Label>
            <Select value={form.payment_mode} onValueChange={(v) => setForm((f) => ({ ...f, payment_mode: v as PaymentMode }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label>Description (optional)</Label>
            <Textarea
              className="min-h-[60px]"
              placeholder="What was this expense for?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Add Expense"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseRow({
  expense,
  onSave,
  onDelete,
}: {
  expense: IndirectExpense;
  onSave: (form: ExpenseFormValues) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
      toast.success("Expense deleted");
      setConfirmDelete(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete expense");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TableRow>
      <TableCell>{formatDate(expense.expense_date)}</TableCell>
      <TableCell>
        <Badge variant="outline">{categoryLabel(expense.category)}</Badge>
      </TableCell>
      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{expense.description ?? "-"}</TableCell>
      <TableCell>{expense.paid_to ?? "-"}</TableCell>
      <TableCell className="capitalize">{expense.payment_mode}</TableCell>
      <TableCell className="text-right font-semibold">{formatINR(expense.amount)}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>

      <EditExpenseDialog open={editOpen} onOpenChange={setEditOpen} expense={expense} onSave={onSave} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {formatINR(expense.amount)} {categoryLabel(expense.category)} entry from{" "}
              {formatDate(expense.expense_date)}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  );
}

function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: IndirectExpense;
  onSave: (form: ExpenseFormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<ExpenseFormValues>({
    category: expense.category,
    description: expense.description ?? "",
    amount: String(expense.amount),
    paid_to: expense.paid_to ?? "",
    payment_mode: expense.payment_mode,
    expense_date: expense.expense_date,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      toast.success("Expense updated");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Paid To</Label>
            <Input value={form.paid_to} onChange={(e) => setForm((f) => ({ ...f, paid_to: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Payment Mode</Label>
            <Select value={form.payment_mode} onValueChange={(v) => setForm((f) => ({ ...f, payment_mode: v as PaymentMode }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Description</Label>
            <Textarea
              className="min-h-[60px]"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
