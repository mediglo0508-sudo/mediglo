import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidateInventory } from "@/lib/inventory-stock";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  itemType: z.enum(["service", "product"]),
  name: z.string().trim().min(2, "Name is required"),
  price: z.coerce.number({ invalid_type_error: "Enter a price" }).min(0, "Price must be 0 or more"),
  code: z.string().trim().optional(),
  gstRate: z.string().optional(),
  openingQty: z.coerce.number().min(0).optional(),
});

export type QuickAddValues = z.infer<typeof schema>;

export interface QuickAddResult {
  kind: "service" | "product";
  id: string;
  name: string;
  sac_code: string;
  price: number;
}

/**
 * POS "on-the-fly" master creation. Writes straight into the Service Master
 * (services_master) or Product Master (inventory) and hands the saved row back
 * so the caller can drop it into the open bill.
 */
export function QuickAddDialog({
  open,
  term,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  term: string;
  onOpenChange: (v: boolean) => void;
  onCreated: (item: QuickAddResult) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<QuickAddValues>({
    resolver: zodResolver(schema),
    defaultValues: { itemType: "service", name: term, price: 0, code: "", gstRate: "5", openingQty: 0 },
  });

  useEffect(() => {
    if (open) form.reset({ itemType: "service", name: term, price: 0, code: "", gstRate: "5", openingQty: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, term]);

  const itemType = form.watch("itemType");
  const saving = form.formState.isSubmitting;

  async function submit(v: QuickAddValues) {
    try {
      if (v.itemType === "service") {
        const { data, error } = await supabase
          .from("services_master")
          .insert({
            name: v.name.trim(),
            category: "Uncategorized",
            sac_code: v.code?.trim() || "999312",
            default_price: v.price,
            gst_rate: Number(v.gstRate ?? 5) || 0,
            active: true,
          })
          .select("id, name, sac_code, default_price")
          .single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["services-pos"] });
        qc.invalidateQueries({ queryKey: ["services_master"] });
        qc.invalidateQueries({ queryKey: ["catalog-services"] });
        onCreated({ kind: "service", id: data.id, name: data.name, sac_code: data.sac_code ?? "", price: Number(data.default_price) || 0 });
      } else {
        const { data, error } = await supabase
          .from("inventory")
          .insert({
            name: v.name.trim(),
            category: "Uncategorized",
            rate: v.price,
            stock: Number(v.openingQty ?? 0) || 0,
            active: true,
          })
          .select("id, name, rate")
          .single();
        if (error) throw error;
        invalidateInventory(qc);
        onCreated({ kind: "product", id: data.id, name: data.name, sac_code: v.code?.trim() ?? "", price: Number(data.rate) || 0 });
      }
      onOpenChange(false);
      toast.success("Item saved to master and added to bill.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the item");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Quick Add Item</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div>
            <Label className="text-xs">Item Type</Label>
            <RadioGroup
              className="mt-2 flex gap-6"
              value={itemType}
              onValueChange={(v) => form.setValue("itemType", v as "service" | "product")}
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="service" id="qa-service" /> Service
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="product" id="qa-product" /> Product
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs" htmlFor="qa-name">Name</Label>
            <Input id="qa-name" {...form.register("name")} />
            {form.formState.errors.name && <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" htmlFor="qa-price">Selling Price (₹)</Label>
              <Input id="qa-price" type="number" step="0.01" {...form.register("price")} />
              {form.formState.errors.price && <p className="mt-1 text-xs text-destructive">{form.formState.errors.price.message}</p>}
            </div>
            <div>
              <Label className="text-xs" htmlFor="qa-code">HSN / SAC Code</Label>
              <Input id="qa-code" placeholder="Optional" {...form.register("code")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GST %</Label>
              <Select value={form.watch("gstRate")} onValueChange={(v) => form.setValue("gstRate", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0", "5", "12", "18"].map((g) => <SelectItem key={g} value={g}>{g}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {itemType === "product" && (
              <div>
                <Label className="text-xs" htmlFor="qa-qty">Opening Quantity</Label>
                <Input id="qa-qty" type="number" step="1" {...form.register("openingQty")} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save &amp; Add to Bill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
