import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRealtimeSync } from "@/lib/realtime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { inr2, round2 } from "@/lib/gst";
import { Package, Check, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export interface OrderItem {
  id: string;
  product_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  batch_no?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}

export interface ProductOrder {
  id: string;
  receipt_no: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  encounter_id: string | null;
  quotation_id: string | null;
  assigned_to: string | null;
  status: string;
  payment_status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  items: OrderItem[];
}

function mapItems(raw: unknown): OrderItem[] {
  const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return arr.map((it) => {
    const qty = Number(it.quantity ?? 1) || 1;
    const price = Number(it.unit_price ?? 0) || 0;
    return {
      id: String(it.id ?? crypto.randomUUID()),
      product_id: (it.product_id as string) ?? null,
      name: String(it.name ?? ""),
      quantity: qty,
      unit_price: price,
      total: Number(it.total ?? round2(qty * price)),
      batch_no: (it.batch_no as string) ?? null,
      expiry_date: (it.expiry_date as string) ?? null,
      notes: (it.notes as string) ?? null,
    };
  });
}

async function fetchOrders(): Promise<ProductOrder[]> {
  const { data, error } = await supabase
    .from("product_orders")
    .select(
      "id, receipt_no, customer_id, customer_name, customer_phone, encounter_id, quotation_id, assigned_to, status, payment_status, total_amount, notes, items_json, created_at, completed_at",
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((o) => ({
    id: o.id,
    receipt_no: o.receipt_no,
    customer_id: o.customer_id,
    customer_name: o.customer_name ?? "Unknown",
    customer_phone: o.customer_phone,
    encounter_id: o.encounter_id,
    quotation_id: o.quotation_id,
    assigned_to: o.assigned_to,
    status: o.status,
    payment_status: o.payment_status,
    total_amount: Number(o.total_amount ?? 0),
    notes: o.notes,
    created_at: o.created_at,
    completed_at: o.completed_at ?? null,
    items: mapItems(o.items_json),
  }));
}

export function PharmacistDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<ProductOrder | null>(null);
  const [busy, setBusy] = useState(false);

  // Live updates through the shared realtime channel; the slow refetch is only a
  // safety net if the socket drops.
  useRealtimeSync(["product_orders"], ["pharmacy_orders"]);
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["pharmacy_orders"],
    queryFn: fetchOrders,
    refetchInterval: 60_000,
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["pharmacy_orders"] });

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : "Could not load orders");
  }, [error]);

  const pending = useMemo(() => orders.filter((o) => o.status === "pending" && !o.assigned_to), [orders]);
  const mine = useMemo(
    () => orders.filter((o) => o.assigned_to === user?.id && o.status === "assigned"),
    [orders, user?.id],
  );
  const readyForBilling = useMemo(
    () => orders.filter((o) => o.status === "confirmed" || o.status === "ready_for_pickup"),
    [orders],
  );
  const completed = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const completedToday = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    return completed.filter((o) => (o.completed_at ?? o.created_at).slice(0, 10) === day);
  }, [completed]);

  // Atomic claim: the filters make the UPDATE a no-op if another pharmacist won the race.
  const selfAssign = async (id: string) => {
    setBusy(true);
    const { data, error: err } = await supabase
      .from("product_orders")
      .update({ assigned_to: user?.id as string, assigned_at: new Date().toISOString(), status: "assigned" })
      .eq("id", id)
      .eq("status", "pending")
      .is("assigned_to", null)
      .select("id");
    setBusy(false);
    if (err) return toast.error(err.message);
    if (!data?.length) {
      reload();
      return toast.error("Another pharmacist just claimed this order");
    }
    toast.success("Order assigned to you");
    reload();
  };

  if (isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading pharmacy…</p>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending orders" value={pending.length} />
        <Stat label="My assignments" value={mine.length} />
        <Stat label="Ready for billing" value={readyForBilling.length} />
        <Stat label="Completed today" value={completedToday.length} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="mine">My assignments ({mine.length})</TabsTrigger>
          <TabsTrigger value="ready">Ready for billing ({readyForBilling.length})</TabsTrigger>
          <TabsTrigger value="done">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {pending.length === 0 ? (
            <Empty text="No orders waiting" />
          ) : (
            pending.map((o) => (
              <OrderCard key={o.id} order={o} showItems>
                <Button size="sm" disabled={busy} onClick={() => selfAssign(o.id)}>
                  Self-assign
                </Button>
              </OrderCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {mine.length === 0 ? (
            <Empty text="No orders assigned to you" />
          ) : (
            mine.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                highlight={selectedId === o.id}
                onClick={() => setSelectedId(o.id)}
                showItems
              >
                <Button size="sm" onClick={(e) => { e.stopPropagation(); setConfirmOrder(o); }}>
                  Confirm &amp; verify items
                </Button>
              </OrderCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="ready" className="mt-4 space-y-3">
          {readyForBilling.length === 0 ? (
            <Empty text="Nothing ready for billing" />
          ) : (
            readyForBilling.map((o) => (
              <OrderCard key={o.id} order={o} showItems>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                  <Button size="sm" onClick={() => (window.location.href = `/pos?product_order=${o.id}`)}>
                    Go to billing
                  </Button>
                </div>
              </OrderCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-4 space-y-3">
          {completed.length === 0 ? (
            <Empty text="No completed orders" />
          ) : (
            completed.map((o) => (
              <OrderCard key={o.id} order={o}>
                <div className="flex items-center gap-2">
                  <Badge variant={o.payment_status === "paid" ? "secondary" : "outline"}>
                    {o.payment_status === "paid" ? "Paid" : o.payment_status === "partial" ? "Part paid" : "Unpaid"}
                  </Badge>
                  <Badge variant="secondary">Completed</Badge>
                </div>
              </OrderCard>
            ))
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDispenseDialog
        order={confirmOrder}
        onClose={() => setConfirmOrder(null)}
        onDone={reload}
      />
    </div>
  );
}

/** Verify quantities and stock, write the dispensing audit rows, then hand over to billing. */
function ConfirmDispenseDialog({
  order, onClose, onDone,
}: {
  order: ProductOrder | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [stock, setStock] = useState<Record<string, { name: string; stock: number }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    setQty(Object.fromEntries(order.items.map((i) => [i.id, i.quantity])));
    const ids = order.items.map((i) => i.product_id).filter(Boolean) as string[];
    if (!ids.length) return setStock({});
    supabase
      .from("inventory")
      .select("id, name, stock")
      .in("id", ids)
      .then(({ data }) => {
        setStock(
          Object.fromEntries(
            (data ?? []).map((r) => [r.id, { name: r.name ?? "", stock: Number(r.stock ?? 0) }]),
          ),
        );
      });
  }, [order]);

  const total = useMemo(
    () =>
      order
        ? round2(order.items.reduce((s, i) => s + (qty[i.id] ?? i.quantity) * i.unit_price, 0))
        : 0,
    [order, qty],
  );

  const problems = useMemo(() => {
    if (!order) return [] as string[];
    const out: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const it of order.items) {
      const q = qty[it.id] ?? it.quantity;
      if (!Number.isFinite(q) || q <= 0) out.push(`${it.name}: enter a quantity greater than zero`);
      if (it.product_id) {
        const s = stock[it.product_id];
        if (!s) out.push(`${it.name}: product not found in inventory`);
        else if (q > s.stock) out.push(`${it.name}: only ${s.stock} in stock (needs ${q})`);
      }
      if (it.expiry_date && it.expiry_date < today) out.push(`${it.name}: batch expired on ${it.expiry_date}`);
    }
    return out;
  }, [order, qty, stock]);

  const confirm = async () => {
    if (!order || problems.length) return;
    setBusy(true);
    try {
      // Audit rows first — an order is never confirmed without its dispensing trail.
      await supabase.from("pharmacist_order_items").delete().eq("order_id", order.id);
      const rows = order.items
        .filter((it) => !!it.product_id)
        .map((it) => ({
          order_id: order.id,
          product_id: it.product_id as string,
          name: it.name,
          quantity_requested: it.quantity,
          quantity_dispensed: qty[it.id] ?? it.quantity,
          unit_price: it.unit_price,
          total_amount: round2((qty[it.id] ?? it.quantity) * it.unit_price),
          batch_no: it.batch_no ?? null,
          expiry_date: it.expiry_date ?? null,
          notes: it.notes ?? null,
          status: "confirmed",
        }));

      if (rows.length) {
        const { error } = await supabase.from("pharmacist_order_items").insert(rows);
        if (error) throw error;
      }

      const items = order.items.map((it) => ({
        ...it,
        quantity: qty[it.id] ?? it.quantity,
        total: round2((qty[it.id] ?? it.quantity) * it.unit_price),
      }));
      const { data, error } = await supabase
        .from("product_orders")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id as string,
          items_json: items,
          total_amount: total,
        })
        .eq("id", order.id)
        .eq("status", "assigned")
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("This order is no longer waiting for confirmation");

      const id = order.id;
      onClose();
      onDone();
      toast.success("Items verified — going to billing");
      window.location.href = `/pos?product_order=${id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm the order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm product dispensing</DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="font-semibold">{order.customer_name}</div>
              <div className="text-sm text-muted-foreground">{order.customer_phone || "—"}</div>
            </div>

            <div className="space-y-2">
              {order.items.map((it) => {
                const s = it.product_id ? stock[it.product_id] : undefined;
                return (
                  <div key={it.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Batch: {it.batch_no || "—"} · Expiry: {it.expiry_date || "—"}
                        {s ? ` · In stock: ${s.stock}` : ""}
                      </div>
                      {it.notes && <div className="mt-1 text-xs text-amber-600">Note: {it.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs text-muted-foreground">
                        <div>Asked: {it.quantity}</div>
                        <div>{inr2(it.unit_price)} each</div>
                      </div>
                      <Input
                        className="w-20"
                        type="number"
                        min={1}
                        value={qty[it.id] ?? it.quantity}
                        onChange={(e) =>
                          setQty((p) => ({ ...p, [it.id]: Math.max(0, Number(e.target.value) || 0) }))
                        }
                      />
                      <div className="w-24 text-right font-semibold">
                        {inr2(round2((qty[it.id] ?? it.quantity) * it.unit_price))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {order.notes && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs uppercase text-muted-foreground">Special instructions</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{order.notes}</p>
              </div>
            )}

            {problems.length > 0 && (
              <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {problems.map((p) => (
                  <div key={p} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {p}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
              <span>Order total</span>
              <span>{inr2(total)}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || problems.length > 0} onClick={confirm}>
            <Check className="mr-2 h-4 w-4" />
            {busy ? "Confirming…" : "Confirm & proceed to billing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
      <Package className="h-8 w-8 opacity-50" />
      {text}
    </Card>
  );
}

function OrderCard({
  order, children, showItems, highlight, onClick,
}: {
  order: ProductOrder;
  children?: React.ReactNode;
  showItems?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={`p-4 ${onClick ? "cursor-pointer" : ""} ${highlight ? "border-primary" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{order.customer_name}</div>
          <div className="text-sm text-muted-foreground">
            {order.customer_phone || "—"} · {order.items.length} item
            {order.items.length !== 1 ? "s" : ""} · {inr2(order.total_amount)}
          </div>
          <div className="text-xs text-muted-foreground">
            {order.receipt_no ? `${order.receipt_no} · ` : ""}
            {new Date(order.created_at).toLocaleTimeString()}
          </div>
        </div>
        {children}
      </div>
      {showItems && order.items.length > 0 && (
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          {order.items.slice(0, 3).map((it) => (
            <div key={it.id} className="flex justify-between">
              <span>
                {it.name} × {it.quantity}
              </span>
              <span>{inr2(it.total)}</span>
            </div>
          ))}
          {order.items.length > 3 && (
            <div className="text-xs text-muted-foreground">+{order.items.length - 3} more</div>
          )}
        </div>
      )}
    </Card>
  );
}
