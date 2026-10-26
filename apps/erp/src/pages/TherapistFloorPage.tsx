import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useProducts, useCustomerSearch } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Plus, Trash2, CheckCircle2, History, Package } from "lucide-react";

interface ConsumedItem {
  inventory_id: string;
  name: string;
  qty: number;
  available_stock: number;
}

export default function TherapistFloorPage() {
  const { user, fullName } = useAuth();
  const queryClient = useQueryClient();
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>("");
  const [treatmentName, setTreatmentName] = useState("");
  const [roomName, setRoomName] = useState("Treatment Room 1");
  const [notes, setNotes] = useState("");
  const [consumedItems, setConsumedItems] = useState<ConsumedItem[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: customerResults } = useCustomerSearch(customerSearch);
  const { data: inventoryProducts } = useProducts();

  // Active wallets for the selected patient
  const { data: customerWallets } = useQuery({
    queryKey: ["customer_wallets", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const { data, error } = await supabase
        .from("service_wallets")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedCustomerId,
  });

  // Recent treatment usage logs
  const { data: recentLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["recent_therapist_usages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_ledger")
        .select("id, quantity, created_at, note, inventory:inventory_id(name, unit)")
        .eq("movement_type", "treatment_usage")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  function addConsumableItem(inventoryId: string) {
    const item = inventoryProducts?.find((p) => p.id === inventoryId);
    if (!item) return;

    if (consumedItems.some((ci) => ci.inventory_id === inventoryId)) {
      toast.info("Item already in consumption list");
      return;
    }

    setConsumedItems((prev) => [
      ...prev,
      {
        inventory_id: item.id,
        name: item.name,
        qty: 1,
        available_stock: Number(item.stock_qty),
      },
    ]);
  }

  function updateQty(inventoryId: string, delta: number) {
    setConsumedItems((prev) =>
      prev.map((ci) => {
        if (ci.inventory_id === inventoryId) {
          const next = Math.max(1, ci.qty + delta);
          return { ...ci, qty: next };
        }
        return ci;
      })
    );
  }

  function removeItem(inventoryId: string) {
    setConsumedItems((prev) => prev.filter((ci) => ci.inventory_id !== inventoryId));
  }

  async function handleCompleteSession() {
    if (!selectedCustomerId) {
      toast.error("Please select a patient first");
      return;
    }
    if (!treatmentName.trim()) {
      toast.error("Please enter the treatment or procedure name");
      return;
    }

    setSaving(true);
    try {
      // 1. Deduct each consumed item from inventory and log in inventory_ledger
      for (const item of consumedItems) {
        // Fetch fresh current stock with update lock
        const { data: invRow, error: fetchErr } = await supabase
          .from("inventory")
          .select("stock_qty")
          .eq("id", item.inventory_id)
          .single();

        if (fetchErr) throw fetchErr;

        const currentStock = Number(invRow.stock_qty);
        const newStock = Math.max(0, currentStock - item.qty);

        // Deduct from inventory
        const { error: updErr } = await supabase
          .from("inventory")
          .update({ stock_qty: newStock })
          .eq("id", item.inventory_id);

        if (updErr) throw updErr;

        // Record in inventory_ledger
        const { error: ledgErr } = await supabase.from("inventory_ledger").insert({
          inventory_id: item.inventory_id,
          movement_type: "treatment_usage",
          quantity: -item.qty,
          reference_type: "treatment_session",
          note: `Used for ${selectedCustomerName} (${treatmentName}) by ${fullName || "Therapist"} in ${roomName}${notes ? `: ${notes}` : ""}`,
        });

        if (ledgErr) throw ledgErr;
      }

      toast.success(
        `Treatment completed! ${consumedItems.length > 0 ? `${consumedItems.length} inventory item(s) deducted.` : ""}`
      );

      // Reset form
      setConsumedItems([]);
      setTreatmentName("");
      setNotes("");
      setSelectedCustomerId(null);
      setSelectedCustomerName("");
      setCustomerSearch("");

      // Refresh cache
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
      queryClient.invalidateQueries({ queryKey: ["customer_wallets"] });
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to log treatment consumption");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Therapist Floor & Treatment Room
          </h1>
          <p className="text-sm text-muted-foreground">
            Execute treatment procedures, redeem package sessions, and track real-time clinical consumables usage.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Patient & Procedure details */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Select Patient & Procedure</CardTitle>
              <CardDescription>Search by patient name or phone number</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative space-y-1">
                <Label>Patient Search</Label>
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Type patient name or 10-digit phone..."
                />
                {customerSearch.length >= 2 && (customerResults ?? []).length > 0 && !selectedCustomerId && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md divide-y max-h-48 overflow-y-auto">
                    {(customerResults ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex justify-between items-center"
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setSelectedCustomerName(c.name);
                          setCustomerSearch(c.name);
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCustomerId && (
                <div className="rounded-md bg-accent/40 p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{selectedCustomerName}</div>
                    <div className="text-xs text-muted-foreground">Patient Selected</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setSelectedCustomerName("");
                      setCustomerSearch("");
                    }}
                  >
                    Change
                  </Button>
                </div>
              )}

              {/* Patient Active Packages / Wallets */}
              {selectedCustomerId && (customerWallets ?? []).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Active Service Packages</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(customerWallets ?? []).map((w: any) => {
                      const remaining = Math.max(0, Number(w.total_sessions) - Number(w.consumed_sessions));
                      return (
                        <div
                          key={w.id}
                          className="border rounded p-2 text-xs flex justify-between items-center bg-card hover:border-primary cursor-pointer"
                          onClick={() => setTreatmentName(w.service_name)}
                        >
                          <div>
                            <div className="font-medium">{w.service_name}</div>
                            <div className="text-muted-foreground">
                              {w.consumed_sessions} of {w.total_sessions} sessions used
                            </div>
                          </div>
                          <Badge variant={remaining > 0 ? "default" : "destructive"}>{remaining} left</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Procedure / Treatment Name</Label>
                  <Input
                    value={treatmentName}
                    onChange={(e) => setTreatmentName(e.target.value)}
                    placeholder="e.g. Laser Hair Reduction, Carbon Laser, Peel..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Treatment Room</Label>
                  <Select value={roomName} onValueChange={setRoomName}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Treatment Room 1">Treatment Room 1 (Laser)</SelectItem>
                      <SelectItem value="Treatment Room 2">Treatment Room 2 (Facial & Peels)</SelectItem>
                      <SelectItem value="Treatment Room 3">Treatment Room 3 (Doctor OPD)</SelectItem>
                      <SelectItem value="Therapy Suite">Therapy Suite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Clinical & Observation Notes (Optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Skin reaction, settings used (J/cm2), patient feedback..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Consumed Inventory Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>2. Clinical Consumables & Medication Usage</span>
                <Select onValueChange={addConsumableItem}>
                  <SelectTrigger className="w-56 text-xs h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span>+ Add Consumable Item</span>
                  </SelectTrigger>
                  <SelectContent>
                    {(inventoryProducts ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={Number(p.stock_qty) <= 0}>
                        {p.name} ({p.stock_qty} in stock)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardTitle>
              <CardDescription>
                Items listed here will be instantly deducted from the central inventory database with an audit ledger entry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {consumedItems.length === 0 ? (
                <div className="border border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                  No inventory consumables added yet for this session. Use "+ Add Consumable Item" above if needles, serums, or cartridges were consumed.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="w-28 text-center">Available</TableHead>
                      <TableHead className="w-36 text-center">Consumed Qty</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consumedItems.map((item) => (
                      <TableRow key={item.inventory_id}>
                        <TableCell className="font-medium text-xs">{item.name}</TableCell>
                        <TableCell className="text-center text-xs">
                          <Badge variant="outline">{item.available_stock}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => updateQty(item.inventory_id, -1)}
                            >
                              -
                            </Button>
                            <span className="text-xs font-semibold w-6 text-center">{item.qty}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => updateQty(item.inventory_id, 1)}
                            >
                              +
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive"
                            onClick={() => removeItem(item.inventory_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  size="default"
                  disabled={saving || !selectedCustomerId || !treatmentName.trim()}
                  onClick={handleCompleteSession}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "Recording & Deducting Stock..." : "Complete Session & Deduct Stock"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Real-time inventory usage stream */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Real-Time Consumption Stream
              </CardTitle>
              <CardDescription>Live audit ledger of items deducted on the treatment floor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(recentLogs ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">No recent treatment usages recorded.</div>
              ) : (
                (recentLogs ?? []).map((log) => (
                  <div key={log.id} className="border-b pb-2 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>{log.inventory?.name || "Consumable Item"}</span>
                      <span className="text-destructive font-semibold">{log.quantity} {log.inventory?.unit || "units"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">{log.note}</div>
                    <div className="text-[10px] text-muted-foreground/70">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
