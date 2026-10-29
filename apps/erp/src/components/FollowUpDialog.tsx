// ============================================================================
// Follow-up call popup.
// Fields adapt to the follow-up `kind` (collection vs sessions). Every save
// APPENDS a row to cos_follow_up_notes (history is never overwritten) and then
// updates the parent cos_follow_ups row. Both writes go through the browser
// client, so the existing RLS policies decide what the user may touch.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Phone } from "lucide-react";
import { fmtDateTime } from "@/lib/date-format";

export interface FollowUpRecord {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  trigger_reason: string;
  kind: string;
  status: string;
  bucket: string | null;
  assigned_to: string | null;
  next_followup_at: string | null;
  expected_visit_date: string | null;
  notes: string | null;
}

export const FOLLOWUP_STATUSES = ["open", "in_progress", "done"] as const;

interface NoteRow {
  id: string;
  note: string;
  outcome: string | null;
  next_followup_at: string | null;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

function isoDateToTimestamp(d: string): string | null {
  if (!d) return null;
  const parsed = new Date(`${d}T09:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function FollowUpDialog({
  followUp,
  onClose,
}: {
  followUp: FollowUpRecord | null;
  onClose: () => void;
}) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const [discussed, setDiscussed] = useState("");
  const [outcome, setOutcome] = useState("");
  const [status, setStatus] = useState("open");
  const [nextDate, setNextDate] = useState("");
  const [extra, setExtra] = useState("");
  // collection
  const [paymentDetail, setPaymentDetail] = useState("");
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [amountDiscussed, setAmountDiscussed] = useState("");
  // sessions
  const [treatmentDetail, setTreatmentDetail] = useState("");
  const [clientResponse, setClientResponse] = useState("");
  const [visitConfirmed, setVisitConfirmed] = useState(false);
  const [expectedVisitDate, setExpectedVisitDate] = useState("");

  useEffect(() => {
    if (!followUp) return;
    setDiscussed("");
    setOutcome("");
    setExtra("");
    setPaymentDetail("");
    setExpectedPaymentDate("");
    setAmountDiscussed("");
    setTreatmentDetail("");
    setClientResponse("");
    setVisitConfirmed(false);
    setStatus(followUp.status || "open");
    setNextDate(followUp.next_followup_at ? followUp.next_followup_at.slice(0, 10) : "");
    setExpectedVisitDate(followUp.expected_visit_date ?? "");
  }, [followUp]);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["follow-up-notes", followUp?.id],
    enabled: !!followUp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cos_follow_up_notes")
        .select("id, note, outcome, next_followup_at, author_id, author_name, created_at")
        .eq("follow_up_id", followUp!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const statusOptions = useMemo(() => {
    const base = [...FOLLOWUP_STATUSES] as string[];
    if (followUp?.status && !base.includes(followUp.status)) base.push(followUp.status);
    return base;
  }, [followUp?.status]);

  const kind = followUp?.kind ?? "";
  const authorName = profile?.full_name ?? user?.email ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!followUp || !user) throw new Error("Not ready");
      if (!discussed.trim()) throw new Error("Please record what was discussed");

      const nextIso = isoDateToTimestamp(nextDate);

      const lines = [`Discussed: ${discussed.trim()}`];
      if (kind === "collection") {
        if (paymentDetail.trim()) lines.push(`Payment discussion: ${paymentDetail.trim()}`);
        if (amountDiscussed.trim()) lines.push(`Amount discussed: ₹${amountDiscussed.trim()}`);
        if (expectedPaymentDate) lines.push(`Expected payment date: ${expectedPaymentDate}`);
      } else if (kind === "sessions") {
        if (treatmentDetail.trim()) lines.push(`Treatment / package: ${treatmentDetail.trim()}`);
        if (clientResponse.trim()) lines.push(`Client response: ${clientResponse.trim()}`);
        lines.push(`Visit confirmed: ${visitConfirmed ? "Yes" : "No"}`);
        if (expectedVisitDate) lines.push(`Expected visit date: ${expectedVisitDate}`);
      }
      if (extra.trim()) lines.push(`Notes: ${extra.trim()}`);

      const { error: noteErr } = await supabase.from("cos_follow_up_notes").insert({
        follow_up_id: followUp.id,
        note: lines.join("\n"),
        outcome: outcome.trim() || null,
        next_followup_at: nextIso,
        author_id: user.id,
        author_name: authorName,
      });
      if (noteErr) throw noteErr;

      const patch = {
        status,
        next_followup_at: nextIso,
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(kind === "sessions" ? { expected_visit_date: expectedVisitDate || null } : {}),
      };

      const { error: upErr } = await supabase
        .from("cos_follow_ups")
        .update(patch)
        .eq("id", followUp.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast.success("Follow-up saved");
      qc.invalidateQueries({ queryKey: ["follow-ups"] });
      qc.invalidateQueries({ queryKey: ["auto-followup-queue"] });
      qc.invalidateQueries({ queryKey: ["follow-up-notes", followUp?.id] });
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  return (
    <Dialog open={!!followUp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {followUp && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {followUp.patient_name}
                <Badge variant="secondary">{followUp.kind}</Badge>
                {followUp.bucket && <Badge variant="outline">{followUp.bucket}</Badge>}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                {followUp.patient_phone && (
                  <p className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {followUp.patient_phone}
                  </p>
                )}
                <p className="mt-1">
                  <span className="text-muted-foreground">Trigger:</span> {followUp.trigger_reason}
                </p>
                {kind === "collection" && followUp.notes && (
                  <p className="mt-1">
                    <span className="text-muted-foreground">Outstanding context:</span>{" "}
                    {followUp.notes}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="fu-discussed">What was discussed *</Label>
                <Textarea
                  id="fu-discussed"
                  value={discussed}
                  onChange={(e) => setDiscussed(e.target.value)}
                  rows={3}
                  placeholder="Summary of the conversation"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="fu-outcome">Outcome</Label>
                  <Input
                    id="fu-outcome"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="e.g. Will pay on Friday"
                  />
                </div>
                <div>
                  <Label htmlFor="fu-status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="fu-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fu-next">Next reminder date</Label>
                  <Input
                    id="fu-next"
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                  />
                </div>
              </div>

              {kind === "collection" && (
                <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold text-amber-700">Payment follow-up</p>
                  <div>
                    <Label htmlFor="fu-pay-detail">Payment discussion detail</Label>
                    <Textarea
                      id="fu-pay-detail"
                      rows={2}
                      value={paymentDetail}
                      onChange={(e) => setPaymentDetail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="fu-pay-amt">Amount discussed (₹)</Label>
                      <Input
                        id="fu-pay-amt"
                        inputMode="decimal"
                        value={amountDiscussed}
                        onChange={(e) => setAmountDiscussed(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fu-pay-date">Expected payment date</Label>
                      <Input
                        id="fu-pay-date"
                        type="date"
                        value={expectedPaymentDate}
                        onChange={(e) => setExpectedPaymentDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {kind === "sessions" && (
                <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                  <p className="text-xs font-semibold text-emerald-700">Treatment follow-up</p>
                  <div>
                    <Label htmlFor="fu-tx-detail">Treatment / package discussed</Label>
                    <Textarea
                      id="fu-tx-detail"
                      rows={2}
                      value={treatmentDetail}
                      onChange={(e) => setTreatmentDetail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="fu-tx-response">Client response / status</Label>
                    <Input
                      id="fu-tx-response"
                      value={clientResponse}
                      onChange={(e) => setClientResponse(e.target.value)}
                    />
                  </div>
                  <div className="grid items-end gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={visitConfirmed}
                        onCheckedChange={(v) => setVisitConfirmed(v === true)}
                      />
                      Visit confirmed
                    </label>
                    <div>
                      <Label htmlFor="fu-tx-visit">Expected visit date</Label>
                      <Input
                        id="fu-tx-visit"
                        type="date"
                        value={expectedVisitDate}
                        onChange={(e) => setExpectedVisitDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="fu-extra">Additional notes</Label>
                <Textarea
                  id="fu-extra"
                  rows={2}
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Save follow-up
                </Button>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Note history</h4>
                {historyLoading && (
                  <p className="text-xs text-muted-foreground">Loading history…</p>
                )}
                {!historyLoading && (history ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No notes recorded yet.</p>
                )}
                <div className="space-y-2">
                  {(history ?? []).map((n) => (
                    <div key={n.id} className="rounded-lg border p-3 text-xs">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {n.author_name ?? "Staff member"}
                        </span>
                        <span>{fmtDateTime(n.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{n.note}</p>
                      {n.outcome && (
                        <p className="mt-1">
                          <span className="text-muted-foreground">Outcome:</span> {n.outcome}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
