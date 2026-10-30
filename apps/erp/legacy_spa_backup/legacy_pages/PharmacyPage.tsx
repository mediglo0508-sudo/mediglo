import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatINR } from "@/lib/utils";
import type { ProductOrder } from "@/types/domain";
import { Package, Check } from "lucide-react";

export default function PharmacyPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<(ProductOrder & { customers?: { name: string; phone: string } | null }) | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["product_orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_orders")
        .select("*, customers(name, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (ProductOrder & { customers: { name: string; phone: string } | null })[];
    },
    refetchInterval: 10_000,
  });

  const pending = (orders ?? []).filter((o) => o.status === "pending");
  const mine = (orders ?? []).filter((o) => o.assigned_to === user?.id && o.status === "assigned");
  const readyForBilling = (orders ?? []).filter((o) => o.status === "confirmed" || o.status === "ready_for_pickup");
  const completed = (orders ?? []).filter((o) => o.status === "completed");

  async function selfAssign(orderId: string) {
    try {
      // The `.eq("status", "pending")` guard (plus checking the returned row)
      // is what actually prevents the race: without it, two pharmacists
      // clicking Self-Assign on the same order within moments of each other
      // both got a success toast, but only the later write really won -
      // the other pharmacist believed they had an order they didn't.
      const { data, error } = await supabase
        .from("product_orders")
        .update({ assigned_to: user!.id, assigned_at: new Date().toISOString(), status: "assigned" })
        .eq("id", orderId)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("Someone else already picked this order up");
        queryClient.invalidateQueries({ queryKey: ["product_orders"] });
        return;
      }
      toast.success("Order assigned to you");
      queryClient.invalidateQueries({ queryKey: ["product_orders"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to self-assign");
    }
  }

  async function confirmDispense() {
    if (!confirming) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("product_orders")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: user!.id })
        .eq("id", confirming.id);
      if (error) throw error;
      toast.success("Confirmed - ready for billing");
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: ["product_orders"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to confirm");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pharmacy</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label="Pending" value={pending.length} />
        <MiniStat label="My assignments" value={mine.length} />
        <MiniStat label="Ready for billing" value={readyForBilling.length} />
        <MiniStat label="Completed" value={completed.length} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="mine">My Orders ({mine.length})</TabsTrigger>
          <TabsTrigger value="ready">Ready for Billing ({readyForBilling.length})</TabsTrigger>
          <TabsTrigger value="done">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState text="No pending orders" />
          ) : (
            pending.map((o) => (
              <Card key={o.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <OrderSummary order={o} />
                  <Button onClick={() => selfAssign(o.id)}>Self-Assign</Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="mine" className="space-y-3">
          {mine.length === 0 ? (
            <EmptyState text="No orders assigned to you" />
          ) : (
            mine.map((o) => (
              <Card key={o.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <OrderSummary order={o} />
                  <Button variant="success" onClick={() => setConfirming(o)}>
                    Confirm & Verify Items
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="ready" className="space-y-3">
          {readyForBilling.length === 0 ? (
            <EmptyState text="No orders ready for billing" />
          ) : (
            readyForBilling.map((o) => (
              <Card key={o.id} className="border-success/40">
                <CardContent className="flex items-center justify-between p-4">
                  <OrderSummary order={o} />
                  <span className="text-xs font-semibold text-success">Go to POS / Billing to invoice this order</span>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="done" className="space-y-3">
          {completed.length === 0 ? <EmptyState text="No completed orders yet" /> : completed.map((o) => (
            <Card key={o.id} className="opacity-70">
              <CardContent className="flex items-center justify-between p-4">
                <OrderSummary order={o} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Product Dispensing</DialogTitle>
          </DialogHeader>
          {confirming && (
            <div className="space-y-3">
              <div className="border-b border-border pb-2">
                <div className="font-semibold">{confirming.customers?.name}</div>
                <div className="text-sm text-muted-foreground">{confirming.customers?.phone}</div>
              </div>
              {confirming.items_json.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 p-3">
                  <div>
                    <div className="font-medium">{item.name}</div>
                    {item.notes && <div className="text-xs text-primary">{item.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {item.quantity} × {formatINR(item.unit_price)}
                    </div>
                    <div className="font-bold text-success">{formatINR(item.total)}</div>
                  </div>
                </div>
              ))}
              <div className="rounded-md bg-accent p-3 text-right text-lg font-bold">Total: {formatINR(confirming.total_amount)}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={confirmDispense} disabled={saving}>
              <Check className="mr-1 h-4 w-4" /> {saving ? "Confirming..." : "Confirm & Proceed to Billing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderSummary({ order }: { order: ProductOrder & { customers?: { name: string; phone: string } | null } }) {
  return (
    <div>
      <div className="font-medium">{order.customers?.name ?? "Unknown"}</div>
      <div className="text-xs text-muted-foreground">
        {order.customers?.phone} · {order.items_json.length} item(s) · {formatINR(order.total_amount)}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
        <Package className="h-8 w-8 opacity-40" />
        <p className="text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}
