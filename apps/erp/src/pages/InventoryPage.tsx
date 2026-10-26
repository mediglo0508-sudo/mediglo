import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatINR } from "@/lib/utils";
import type { InventoryItem, ServiceMaster } from "@/types/domain";
import { Pencil, Save, X, Plus, Search, PackageSearch } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Inventory & Master Data</h1>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products tab (public.inventory where is_service = false)
// ---------------------------------------------------------------------------

function ProductsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<InventoryItem>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["inventory_products_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .eq("is_service", false)
        .order("name");
      if (error) throw error;
      return data as InventoryItem[];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = products ?? [];
    if (!q) return rows;
    return rows.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  function startEdit(p: InventoryItem) {
    setEditingId(p.id);
    setDraft({ ...p });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit(id: string) {
    const original = (products ?? []).find((p) => p.id === id);
    const stockQty = Number(draft.stock_qty ?? 0);
    const reorderLevel = Number(draft.reorder_level ?? 0);
    const costPrice = Number(draft.cost_price ?? 0);
    const salePrice = Number(draft.sale_price ?? 0);
    const gstRate = Number(draft.gst_rate ?? 0);

    if (!draft.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (stockQty < 0 || reorderLevel < 0 || costPrice < 0 || salePrice < 0) {
      toast.error("Stock, reorder level, and prices cannot be negative");
      return;
    }
    if (gstRate < 0 || gstRate > 100) {
      toast.error("GST % must be between 0 and 100");
      return;
    }

    setSavingId(id);
    try {
      // Stock quantity changes are routed through adjust_stock() rather than a
      // direct UPDATE so every manual correction leaves an inventory_ledger
      // audit row (who changed it, when, by how much) - the same trail every
      // other stock movement (dispense, sale) already produces. Other field
      // edits (name, price, GST, etc.) stay a plain update since they don't
      // affect stock and adjust_stock() doesn't touch them.
      if (original && stockQty !== Number(original.stock_qty)) {
        const { error: stockErr } = await supabase.rpc("adjust_stock", {
          p_inventory_id: id,
          p_new_qty: stockQty,
          p_reason: "Manual correction via Inventory page",
        });
        if (stockErr) throw stockErr;
      }

      const { error } = await supabase
        .from("inventory")
        .update({
          name: draft.name,
          category: draft.category ?? null,
          sku: draft.sku ?? null,
          unit: draft.unit,
          reorder_level: reorderLevel,
          cost_price: costPrice,
          sale_price: salePrice,
          gst_rate: gstRate,
          active: draft.active,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Product updated");
      setEditingId(null);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["inventory_products_admin"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update product");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(p: InventoryItem) {
    if (togglingId) return; // guard against a double-click firing two overlapping requests
    setTogglingId(p.id);
    try {
      const { error } = await supabase.from("inventory").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
      toast.success(p.active ? "Product deactivated" : "Product activated");
      queryClient.invalidateQueries({ queryKey: ["inventory_products_admin"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  }

  async function deactivateSelected() {
    setDeactivating(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("inventory").update({ active: false }).in("id", ids);
      if (error) throw error;
      toast.success(`Deactivated ${ids.length} product(s)`);
      setSelected(new Set());
      setConfirmDeactivate(false);
      queryClient.invalidateQueries({ queryKey: ["inventory_products_admin"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to deactivate products");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Product
        </Button>
      </div>

      {selected.size > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDeactivate(true)}>
              Deactivate Selected
            </Button>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Deactivating hides an item from new bills without breaking past invoice history.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                <TableHead className="text-right">GST %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    <PackageSearch className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    No products found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => {
                const isEditing = editingId === p.id;
                const lowStock = p.stock_qty <= p.reorder_level;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} />
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          className="min-w-[10rem]"
                          value={draft.name ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                      ) : (
                        <span className="font-medium">{p.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={draft.category ?? ""} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                      ) : (
                        p.category ?? "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={draft.sku ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} />
                      ) : (
                        p.sku ?? "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-24 text-right"
                          value={draft.stock_qty ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, stock_qty: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {p.stock_qty} {p.unit}
                          {lowStock && <Badge variant="destructive">Low stock</Badge>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-20 text-right"
                          value={draft.reorder_level ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, reorder_level: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        p.reorder_level
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-24 text-right"
                          value={draft.cost_price ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, cost_price: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        formatINR(p.cost_price)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-24 text-right"
                          value={draft.sale_price ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, sale_price: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        formatINR(p.sale_price)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-16 text-right"
                          value={draft.gst_rate ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, gst_rate: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        `${p.gst_rate}%`
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Switch checked={!!draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} />
                      ) : (
                        <Badge
                          variant={p.active ? "success" : "outline"}
                          className={togglingId === p.id ? "cursor-wait opacity-60" : "cursor-pointer"}
                          onClick={() => toggleActive(p)}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="success" disabled={savingId === p.id} onClick={() => saveEdit(p.id)}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" disabled={savingId === p.id} onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="icon" variant="ghost" onClick={() => startEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selected.size} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivated products are hidden from new bills but past invoices referencing them are unaffected. This does not delete
              any data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deactivating} onClick={deactivateSelected}>
              {deactivating ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddProductDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    sku: "",
    unit: "pcs",
    stock_qty: "0",
    reorder_level: "0",
    cost_price: "0",
    sale_price: "0",
    gst_rate: "5",
  });

  function reset() {
    setForm({ name: "", category: "", sku: "", unit: "pcs", stock_qty: "0", reorder_level: "0", cost_price: "0", sale_price: "0", gst_rate: "5" });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const stockQty = Number(form.stock_qty) || 0;
    const reorderLevel = Number(form.reorder_level) || 0;
    const costPrice = Number(form.cost_price) || 0;
    const salePrice = Number(form.sale_price) || 0;
    const gstRate = Number(form.gst_rate) || 0;
    if (stockQty < 0 || reorderLevel < 0 || costPrice < 0 || salePrice < 0) {
      toast.error("Stock, reorder level, and prices cannot be negative");
      return;
    }
    if (gstRate < 0 || gstRate > 100) {
      toast.error("GST % must be between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("inventory").insert({
        name: form.name.trim(),
        category: form.category.trim() || null,
        sku: form.sku.trim() || null,
        is_service: false,
        unit: form.unit.trim() || "pcs",
        stock_qty: stockQty,
        reorder_level: reorderLevel,
        cost_price: costPrice,
        sale_price: salePrice,
        gst_rate: gstRate,
        active: true,
      });
      if (error) throw error;
      toast.success("Product added");
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["inventory_products_admin"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          <Input placeholder="Unit (pcs, box...)" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          <Input
            type="number"
            placeholder="Opening stock"
            value={form.stock_qty}
            onChange={(e) => setForm((f) => ({ ...f, stock_qty: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="Reorder level"
            value={form.reorder_level}
            onChange={(e) => setForm((f) => ({ ...f, reorder_level: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="Cost price"
            value={form.cost_price}
            onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="Sale price"
            value={form.sale_price}
            onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="GST %"
            value={form.gst_rate}
            onChange={(e) => setForm((f) => ({ ...f, gst_rate: e.target.value }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Add Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Services tab (public.services_master)
// ---------------------------------------------------------------------------

function ServicesTab() {
  const { access } = useAuth();
  // services_master_write RLS only permits admin/accountant, unlike the
  // broader admin/accountant/reception/pharmacist set that inventory_write
  // allows (and that this page's own route permits). Reception/pharmacist
  // can reach this tab but any write they attempt here would be silently
  // rejected by RLS, so the write UI is hidden for them rather than shown
  // and failing.
  const canManage = !!access?.can_view_finance;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ServiceMaster>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: services, isLoading } = useQuery({
    queryKey: ["services_master_admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services_master").select("*").order("name");
      if (error) throw error;
      return data as ServiceMaster[];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = services ?? [];
    if (!q) return rows;
    return rows.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.sac_code ?? "").toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q)
    );
  }, [services, search]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  }

  function startEdit(s: ServiceMaster) {
    if (!canManage) return;
    setEditingId(s.id);
    setDraft({ ...s });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit(id: string) {
    if (!draft.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    const defaultPrice = Number(draft.default_price ?? 0);
    const gstRate = Number(draft.gst_rate ?? 0);
    const defaultSessions = Number(draft.default_sessions ?? 1);
    if (defaultPrice < 0) {
      toast.error("Default price cannot be negative");
      return;
    }
    if (gstRate < 0 || gstRate > 100) {
      toast.error("GST % must be between 0 and 100");
      return;
    }
    if (defaultSessions < 1) {
      toast.error("Sessions must be at least 1");
      return;
    }

    setSavingId(id);
    try {
      const { error } = await supabase
        .from("services_master")
        .update({
          name: draft.name,
          category: draft.category ?? null,
          sac_code: draft.sac_code ?? null,
          default_price: defaultPrice,
          gst_rate: gstRate,
          default_sessions: defaultSessions,
          active: draft.active,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Service updated");
      setEditingId(null);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["services_master_admin"] });
      queryClient.invalidateQueries({ queryKey: ["services_master"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update service");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(s: ServiceMaster) {
    if (!canManage || togglingId) return; // guard against a double-click firing two overlapping requests
    setTogglingId(s.id);
    try {
      const { error } = await supabase.from("services_master").update({ active: !s.active }).eq("id", s.id);
      if (error) throw error;
      toast.success(s.active ? "Service deactivated" : "Service activated");
      queryClient.invalidateQueries({ queryKey: ["services_master_admin"] });
      queryClient.invalidateQueries({ queryKey: ["services_master"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  }

  async function deactivateSelected() {
    if (!canManage) return;
    setDeactivating(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("services_master").update({ active: false }).in("id", ids);
      if (error) throw error;
      toast.success(`Deactivated ${ids.length} service(s)`);
      setSelected(new Set());
      setConfirmDeactivate(false);
      queryClient.invalidateQueries({ queryKey: ["services_master_admin"] });
      queryClient.invalidateQueries({ queryKey: ["services_master"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to deactivate services");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search services..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex-1" />
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Service
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          You have read-only access to services. Adding, editing, or deactivating services requires an admin or accountant.
        </p>
      )}

      {canManage && selected.size > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDeactivate(true)}>
              Deactivate Selected
            </Button>
          </CardContent>
        </Card>
      )}
      {canManage && (
        <p className="text-xs text-muted-foreground">
          Deactivating hides a service from new quotations without breaking past invoice history.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>SAC Code</TableHead>
                <TableHead className="text-right">Default Price</TableHead>
                <TableHead className="text-right">GST %</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 7} className="py-8 text-center text-sm text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 7} className="py-8 text-center text-sm text-muted-foreground">
                    <PackageSearch className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    No services found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <TableRow key={s.id}>
                    {canManage && (
                      <TableCell>
                        <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleOne(s.id)} aria-label={`Select ${s.name}`} />
                      </TableCell>
                    )}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          className="min-w-[10rem]"
                          value={draft.name ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                      ) : (
                        <span className="font-medium">{s.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={draft.category ?? ""} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                      ) : (
                        s.category ?? "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={draft.sac_code ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sac_code: e.target.value }))} />
                      ) : (
                        s.sac_code ?? "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-24 text-right"
                          value={draft.default_price ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, default_price: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        formatINR(s.default_price)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-16 text-right"
                          value={draft.gst_rate ?? 0}
                          onChange={(e) => setDraft((d) => ({ ...d, gst_rate: Number(e.target.value) || 0 }))}
                        />
                      ) : (
                        `${s.gst_rate}%`
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="w-16 text-right"
                          value={draft.default_sessions ?? 1}
                          onChange={(e) => setDraft((d) => ({ ...d, default_sessions: Number(e.target.value) || 1 }))}
                        />
                      ) : (
                        s.default_sessions
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Switch checked={!!draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} />
                      ) : (
                        <Badge
                          variant={s.active ? "success" : "outline"}
                          className={canManage ? (togglingId === s.id ? "cursor-wait opacity-60" : "cursor-pointer") : undefined}
                          onClick={canManage ? () => toggleActive(s) : undefined}
                        >
                          {s.active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="success" disabled={savingId === s.id} onClick={() => saveEdit(s.id)}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="outline" disabled={savingId === s.id} onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => startEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selected.size} service(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivated services are hidden from new quotations but past invoices referencing them are unaffected. This does not
              delete any data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deactivating} onClick={deactivateSelected}>
              {deactivating ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddServiceDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddServiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    sac_code: "",
    default_price: "0",
    gst_rate: "5",
    default_sessions: "1",
  });

  function reset() {
    setForm({ name: "", category: "", sac_code: "", default_price: "0", gst_rate: "5", default_sessions: "1" });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const defaultPrice = Number(form.default_price) || 0;
    const gstRate = Number(form.gst_rate) || 0;
    const defaultSessions = Number(form.default_sessions) || 1;
    if (defaultPrice < 0) {
      toast.error("Default price cannot be negative");
      return;
    }
    if (gstRate < 0 || gstRate > 100) {
      toast.error("GST % must be between 0 and 100");
      return;
    }
    if (defaultSessions < 1) {
      toast.error("Sessions must be at least 1");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("services_master").insert({
        name: form.name.trim(),
        category: form.category.trim() || null,
        sac_code: form.sac_code.trim() || null,
        default_price: defaultPrice,
        gst_rate: gstRate,
        default_sessions: defaultSessions,
        active: true,
      });
      if (error) throw error;
      toast.success("Service added");
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["services_master_admin"] });
      queryClient.invalidateQueries({ queryKey: ["services_master"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add service");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Service</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <Input placeholder="SAC code" value={form.sac_code} onChange={(e) => setForm((f) => ({ ...f, sac_code: e.target.value }))} />
          <Input
            type="number"
            placeholder="Default price"
            value={form.default_price}
            onChange={(e) => setForm((f) => ({ ...f, default_price: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="GST %"
            value={form.gst_rate}
            onChange={(e) => setForm((f) => ({ ...f, gst_rate: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="Default sessions"
            value={form.default_sessions}
            onChange={(e) => setForm((f) => ({ ...f, default_sessions: e.target.value }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Add Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
