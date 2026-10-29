import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useAddPaymentMode, usePaymentModes, mergeModes } from "@/lib/payment-modes";
import { PAYMENT_MODES } from "@/lib/constants";

interface Props {
  value: string;
  onValueChange: (v: string) => void;
  base?: readonly string[];
  extra?: readonly string[];
  triggerClassName?: string;
}

export function PaymentModeSelect({ value, onValueChange, base = PAYMENT_MODES, extra = [], triggerClassName }: Props) {
  const { hasRole } = useAuth();
  const canAdd = hasRole("admin") || hasRole("accountant");
  const { modes } = usePaymentModes(base);
  const all = mergeModes(modes, extra, value ? [value] : []);
  const add = useAddPaymentMode();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const saved = await add(name, all);
      toast.success(`Payment mode "${saved}" added`);
      onValueChange(saved);
      setName(""); setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName ?? "flex-1"}><SelectValue /></SelectTrigger>
        <SelectContent>{all.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
      </Select>
      {canAdd && (
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0"
          title="Add New Payment Mode" aria-label="Add New Payment Mode" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Payment Mode</DialogTitle></DialogHeader>
          <Input autoFocus value={name} maxLength={40} placeholder="e.g. Bajaj Finserv"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
