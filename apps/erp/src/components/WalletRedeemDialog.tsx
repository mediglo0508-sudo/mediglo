import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { redeemWalletSessions } from "@/lib/wallet-redeem";
import { printWalletReceipt } from "@/lib/print-layout";
import { toast } from "sonner";
import { Printer, Wallet } from "lucide-react";

export interface RedeemableWallet {
  id: string;
  service_name: string;
  total_sessions: number;
  consumed_sessions: number;
  remaining: number;
}

/**
 * Wallet redemption modal — service picker, session count, editable (backdatable)
 * service date, therapist/room/notes, and a printable voucher on success.
 */
export function WalletRedeemDialog({
  open,
  onClose,
  onDone,
  patientName,
  wallets,
  initialWalletId,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  patientName: string;
  wallets: RedeemableWallet[];
  initialWalletId?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [walletId, setWalletId] = useState("");
  /** Kept as a raw string so the field can be emptied/edited freely; validated on submit. */
  const [sessionsInput, setSessionsInput] = useState("1");
  const [serviceDate, setServiceDate] = useState(today);
  const [therapistId, setTherapistId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const sessions = Number(sessionsInput) || 0;

  useEffect(() => {
    if (!open) return;
    setWalletId(initialWalletId || wallets[0]?.id || "");
    setSessionsInput("1");
    setServiceDate(today);
    setNotes("");
  }, [open, initialWalletId]);

  const { data: therapists } = useQuery({
    queryKey: ["therapists"],
    queryFn: async () => ((await supabase.from("staff").select("id, name, role_title").eq("active", true).order("name")).data ?? []),
  });
  const { data: rooms } = useQuery({
    queryKey: ["clinic-rooms"],
    queryFn: async () => ((await supabase.from("clinic_rooms").select("room_name").order("room_name")).data ?? []),
  });

  const wallet = useMemo(() => wallets.find((w) => w.id === walletId), [wallets, walletId]);

  async function submit() {
    if (!wallet) return toast.error("Select a wallet service");
    if (sessions < 1) return toast.error("Sessions to redeem must be at least 1");
    if (sessions > wallet.remaining) return toast.error(`Only ${wallet.remaining} session(s) remaining`);
    setSaving(true);
    try {
      const t = therapists?.find((x) => x.id === therapistId);
      const res = await redeemWalletSessions({
        walletId: wallet.id,
        serviceName: wallet.service_name,
        patientName,
        sessions,
        serviceDate,
        notes: notes || null,
        therapistId: therapistId || null,
        therapistName: t?.name ?? null,
        roomName: roomName || null,
      });
      toast.success(`${res.sessionsUsed} session(s) redeemed — ${res.remaining} remaining`, {
        action: {
          label: "Print voucher",
          onClick: () =>
            printWalletReceipt({
              patient_name: res.patientName,
              service_name: res.serviceName,
              service_date: res.serviceDate,
              sessions_used: res.sessionsUsed,
              total_sessions: res.totalSessions,
              consumed_sessions: res.consumedSessions,
              remaining: res.remaining,
              therapist_name: res.therapistName,
              notes: res.notes,
            }),
        },
      });
      printWalletReceipt({
        patient_name: res.patientName,
        service_name: res.serviceName,
        service_date: res.serviceDate,
        sessions_used: res.sessionsUsed,
        total_sessions: res.totalSessions,
        consumed_sessions: res.consumedSessions,
        remaining: res.remaining,
        therapist_name: res.therapistName,
        notes: res.notes,
      });
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to redeem session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Redeem Wallet Service — {patientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Select Service *</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select wallet service" /></SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.service_name} · {w.remaining} left</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Sessions to Redeem</Label>
              <Input type="number" min={1} max={wallet?.remaining ?? 1} value={sessionsInput}
                onChange={(e) => setSessionsInput(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Service Date</Label>
              <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Staff Assigned <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select value={therapistId} onValueChange={setTherapistId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {therapists?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.role_title ? ` · ${t.role_title}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Room <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select value={roomName} onValueChange={setRoomName}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {rooms?.map((r) => <SelectItem key={r.room_name} value={r.room_name}>{r.room_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Session observations…" />
          </div>
          {wallet && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
              After redemption: <span className="font-semibold">{Math.max(0, wallet.remaining - sessions)}</span> session(s) remaining of {wallet.total_sessions}.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            <Printer className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Redeem & Print Voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
