// ============================================================================
// Void / un-void controls + this invoice's stock movement history.
//
// Void only sets invoices.voided_at — the AFTER UPDATE trigger on invoices
// reverses the inventory impact; un-void clears it and the trigger re-applies.
// Nothing here writes inventory.stock.
// ============================================================================
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyBillingError } from "@/lib/billing-access";
import { invalidateLedger } from "@/lib/ledger-cache";
import { fmtDate } from "@/lib/date-format";
import { toast } from "sonner";
import { Ban, RotateCcw } from "lucide-react";

interface LedgerRow {
  id: string;
  inventory_id: string | null;
  movement_type: string | null;
  quantity_change: number | null;
  previous_stock: number | null;
  new_stock: number | null;
  created_at: string;
  reverses_ledger_id: string | null;
  note: string | null;
}

export function InvoiceInventoryPanel({
  invoiceId,
  voidedAt,
  isAdmin,
}: {
  invoiceId: string;
  voidedAt: string | null;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["invoice-ledger", invoiceId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("inventory_ledger")
        .select("id, inventory_id, movement_type, quantity_change, previous_stock, new_stock, created_at, reverses_ledger_id, note")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      const ids = [...new Set((rows ?? []).map((r) => r.inventory_id).filter(Boolean))] as string[];
      const { data: items } = ids.length
        ? await supabase.from("inventory").select("id, name").in("id", ids)
        : { data: [] as { id: string; name: string | null }[] };
      const names = new Map((items ?? []).map((i) => [i.id, i.name ?? "—"]));
      return { rows: (rows ?? []) as LedgerRow[], names };
    },
  });

  async function refresh(msg: string) {
    const { data: after } = await supabase
      .from("inventory_ledger")
      .select("quantity_change, movement_type")
      .eq("invoice_id", invoiceId);
    const restored = (after ?? []).filter((r) => Number(r.quantity_change) > 0).reduce((s, r) => s + Number(r.quantity_change), 0);
    const deducted = (after ?? []).filter((r) => Number(r.quantity_change) < 0).reduce((s, r) => s - Number(r.quantity_change), 0);
    toast.success(`${msg} · ${restored} unit(s) restored, ${deducted} unit(s) deducted in total for this invoice.`);
    qc.invalidateQueries({ queryKey: ["invoice-ledger", invoiceId] });
    qc.invalidateQueries({ queryKey: ["invoice-lines", invoiceId] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    invalidateLedger(qc);
  }

  async function voidInvoice() {
    if (!confirm("Void this invoice? Its inventory impact will be reversed automatically.")) return;
    setBusy(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("invoices")
        .update({
          voided_at: new Date().toISOString(),
          voided_reason: reason.trim() || "Voided from invoice screen",
          voided_by: me.user?.id ?? null,
        })
        .eq("id", invoiceId);
      if (error) throw error;
      await refresh("Invoice voided");
    } catch (e) {
      toast.error(friendlyBillingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function unvoidInvoice() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ voided_at: null, voided_reason: null, voided_by: null })
        .eq("id", invoiceId);
      if (error) throw error;
      await refresh("Invoice un-voided");
    } catch (e) {
      toast.error(friendlyBillingError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        {voidedAt ? (
          <>
            <p className="text-xs text-muted-foreground">Voided on {fmtDate(voidedAt)}. Un-voiding re-applies the stock deductions.</p>
            {isAdmin && (
              <Button size="sm" variant="outline" className="mt-2 w-full" disabled={busy} onClick={unvoidInvoice}>
                <RotateCcw className="mr-2 h-4 w-4" /> Un-void invoice
              </Button>
            )}
          </>
        ) : (
          <>
            <Input
              className="h-9"
              placeholder="Void reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button size="sm" variant="destructive" className="mt-2 w-full" disabled={busy} onClick={voidInvoice}>
              <Ban className="mr-2 h-4 w-4" /> Void invoice
            </Button>
          </>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-2 text-xs font-semibold uppercase text-muted-foreground">Stock movement history</div>
        {(data?.rows ?? []).length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">No stock movement recorded for this invoice.</p>
        )}
        {(data?.rows ?? []).map((r) => (
          <div key={r.id} className="border-b p-2 text-xs last:border-0">
            <div className="flex justify-between">
              <span className="font-medium">{data?.names.get(r.inventory_id ?? "") ?? "Unknown item"}</span>
              <span className={Number(r.quantity_change) > 0 ? "text-emerald-600" : "text-destructive"}>
                {Number(r.quantity_change) > 0 ? "+" : ""}{Number(r.quantity_change)}
              </span>
            </div>
            <div className="text-muted-foreground">
              {r.movement_type}
              {r.reverses_ledger_id ? " (reversal)" : ""} · {Number(r.previous_stock)} → {Number(r.new_stock)} ·{" "}
              {new Date(r.created_at).toLocaleString("en-IN")}
              {r.note ? ` · ${r.note}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
