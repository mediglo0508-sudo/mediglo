import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { inr2 } from "@/lib/gst";
import { fmtDate } from "@/lib/date-format";
import type { DuplicateCheckResult } from "@/lib/billing-access";

interface Props {
  open: boolean;
  result: DuplicateCheckResult | null;
  canOverride: boolean;
  onOpenExisting: (invoiceId: string) => void;
  onContinue: (matchedInvoiceId: string, reason: string) => void;
  onCancel: () => void;
}

export function DuplicateBillDialog({
  open,
  result,
  canOverride,
  onOpenExisting,
  onContinue,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const top = result?.matches?.[0];
  const rest = (result?.matches ?? []).slice(1);
  const high = result?.level === "high";
  const needsReason = high && canOverride;
  const continueDisabled = !top || (high && !canOverride) || (needsReason && reason.trim().length < 5);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className={high ? "text-destructive" : undefined}>
            {high ? "🚨 High-Confidence Duplicate Bill" : "⚠️ Possible Duplicate Bill Detected"}
          </DialogTitle>
          <DialogDescription>A similar bill already exists in the system.</DialogDescription>
        </DialogHeader>

        {top && (
          <div className={`rounded-lg border p-3 text-sm ${high ? "border-destructive/40 bg-destructive/5" : ""}`}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <Field label="Customer" value={top.customer_name ?? "—"} />
              <Field label="Service/Product" value={top.services ?? "—"} />
              <Field label="Amount" value={inr2(Number(top.gross_total) || 0)} />
              <Field label="Date" value={fmtDate(top.invoice_date)} />
              <Field label="Invoice No." value={top.invoice_no ?? "—"} />
              <Field label="Created by" value={top.created_by_name ?? "—"} />
            </dl>
            {top.reasons?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {top.reasons.map((r, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{r}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {rest.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
            <p className="font-medium text-muted-foreground">Other similar bills</p>
            {rest.map((m) => (
              <div key={m.invoice_id} className="flex items-center justify-between gap-2">
                <span>{m.invoice_no ?? "—"} · {fmtDate(m.invoice_date)}</span>
                <span className="font-medium">{inr2(Number(m.gross_total) || 0)}</span>
              </div>
            ))}
          </div>
        )}

        {high && !canOverride && (
          <p className="text-xs text-muted-foreground">
            Only an Admin/Director can override a high-confidence duplicate.
          </p>
        )}

        {needsReason && (
          <div className="space-y-1.5">
            <Label htmlFor="dup-reason">Reason for override</Label>
            <Textarea
              id="dup-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this bill not a duplicate?"
              rows={3}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button onClick={() => top && onOpenExisting(top.invoice_id)} disabled={!top}>
            Open Existing Bill
          </Button>
          <Button
            variant={high ? "destructive" : "outline"}
            disabled={continueDisabled}
            onClick={() => top && onContinue(top.invoice_id, reason.trim())}
          >
            Continue Anyway
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
