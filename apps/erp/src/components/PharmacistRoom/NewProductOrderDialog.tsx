import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Autocomplete } from "@/components/ui/autocomplete";
import { useProductCatalog, productOptions } from "@/lib/catalog";
import { inr2, round2 } from "@/lib/gst";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  batchNo: string;
  expiry: string;
  notes: string;
}

const blank = (): Row => ({
  id: crypto.randomUUID(),
  productId: null,
  name: "",
  quantity: 1,
  unitPrice: 0,
  batchNo: "",
  expiry: "",
  notes: "",
});

export function NewProductOrderDialog({ onCreated }: { onCreated?: () => void }) {
  const { user } = useAuth();
  const { data: products = [] } = useProductCatalog();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [saving, setSaving] = useState(false);

  const opts = useMemo(() => productOptions(products), [products]);
  const total = useMemo(
    () => round2(rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0)),
    [rows],
  );

  const patch = (id: string, p: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const pick = (id: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    patch(id, { productId, name: p?.name ?? "", unitPrice: Number(p?.sale_price ?? 0) });
  };

  const save = async () => {
    const valid = rows.filter((r) => r.name.trim() && r.quantity > 0);
    if (!name.trim()) return toast.error("Enter the patient's name");
    if (!valid.length) return toast.error("Add at least one product");
    setSaving(true);
    const { error } = await supabase.from("product_orders").insert({
      customer_name: name.trim(),
      customer_phone: phone.trim() || null,
      items_json: valid.map((r) => ({
        id: r.id,
        product_id: r.productId,
        name: r.name,
        quantity: r.quantity,
        unit_price: r.unitPrice,
        total: round2(r.quantity * r.unitPrice),
        batch_no: r.batchNo || null,
        expiry_date: r.expiry || null,
        notes: r.notes || null,
      })),
      total_amount: total,
      notes: notes.trim() || null,
      status: "pending",
      created_by: user?.id as string,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Product order sent to the pharmacy");
    setOpen(false);
    setName(""); setPhone(""); setNotes(""); setRows([blank()]);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New product order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New product order</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Patient name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[2fr_80px_110px_auto]">
                <Autocomplete
                  options={opts}
                  value={r.productId ?? ""}
                  onSelect={(o) => pick(r.id, o.value)}
                  placeholder="Search product…"
                />
                <Input
                  type="number"
                  min={1}
                  value={r.quantity}
                  onChange={(e) => patch(r.id, { quantity: Number(e.target.value) || 1 })}
                />
                <Input
                  type="number"
                  step="0.01"
                  value={r.unitPrice}
                  onChange={(e) => patch(r.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows((p) => (p.length > 1 ? p.filter((x) => x.id !== r.id) : p))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input placeholder="Batch no." value={r.batchNo} onChange={(e) => patch(r.id, { batchNo: e.target.value })} />
                <Input type="date" value={r.expiry} onChange={(e) => patch(r.id, { expiry: e.target.value })} />
                <Input placeholder="Note (e.g. allergy)" value={r.notes} onChange={(e) => patch(r.id, { notes: e.target.value })} />
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setRows((p) => [...p, blank()])}>
            <Plus className="mr-2 h-4 w-4" /> Add product
          </Button>
        </div>

        <div>
          <Label>Special instructions</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
          <span>Total</span>
          <span>{inr2(total)}</span>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Send to pharmacy"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
