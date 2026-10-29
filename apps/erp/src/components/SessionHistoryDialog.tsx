import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Backdated session breakdown — one date row per already-completed session so
 * historical package entries produce accurate treatment history records.
 */
export function SessionHistoryDialog({
  open,
  count,
  serviceName,
  patientName,
  onCancel,
  onConfirm,
  saving,
}: {
  open: boolean;
  count: number;
  serviceName: string;
  patientName: string;
  onCancel: () => void;
  onConfirm: (dates: string[]) => void;
  saving?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDates(Array.from({ length: Math.max(0, count) }, () => today));
  }, [open, count]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session History Breakdown</DialogTitle>
          <DialogDescription>
            {patientName || "Client"} · {serviceName || "Package"} — enter the date each completed session was rendered.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Label className="w-32 shrink-0 text-xs">Session {i + 1} Date</Label>
              <Input
                type="date"
                value={d}
                onChange={(e) => setDates((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Skip</Button>
          <Button onClick={() => onConfirm(dates)} disabled={saving}>
            {saving ? "Saving…" : `Save ${dates.length} Session Record(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
