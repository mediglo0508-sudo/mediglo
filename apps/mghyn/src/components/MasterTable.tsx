import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, Check, X, Trash2, Plus, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export interface Column {
  key: string;
  label: string;
  type?: "text" | "number";
  readOnly?: boolean;
  width?: string;
  /** Computed, non-editable display derived from the row (e.g. Net Profit). */
  derive?: (row: Record<string, unknown>) => string;
}

interface Props {
  table: string;
  queryKey: string;
  columns: Column[];
  orderBy?: string;
  newRow: () => Record<string, unknown>;
  searchKeys?: string[];
  /** Server-side filter applied to fetched rows, e.g. { key: "kind", value: "product" } */
  filterEq?: { key: string; value: unknown };
  /** Rows fetched per page (server-side pagination). */
  pageSize?: number;
}

export function MasterTable({
  table, queryKey, columns, orderBy = "name", newRow, searchKeys = ["name"], filterEq, pageSize = 50,
}: Props) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);

  // Debounced search — one request per pause, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [queryKey, filterEq?.value ?? null, debounced, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from(table as never)
        .select("*", { count: "exact" })
        .order(orderBy as never)
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (filterEq) q = q.eq(filterEq.key as never, filterEq.value as never);
      if (debounced) {
        const esc = debounced.replace(/[,()]/g, " ");
        q = q.or(searchKeys.map((k) => `${k}.ilike.%${esc}%`).join(","));
      }
      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as Record<string, unknown>[], count: count ?? 0 };
    },
  });

  const filtered = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const refresh = useCallback(() => { qc.invalidateQueries({ queryKey: [queryKey] }); }, [qc, queryKey]);

  const startEdit = useCallback((row: Record<string, unknown>) => {
    setEditId(String(row.id));
    setDraft({ ...row });
  }, []);

  const cancelEdit = useCallback(() => setEditId(null), []);


  async function saveEdit() {
    if (!editId) return;
    const patch: Record<string, unknown> = {};
    for (const c of columns) if (!c.readOnly && !c.derive) patch[c.key] = draft[c.key];
    if ("name" in patch && !String(patch.name ?? "").trim()) return toast.error("Item name cannot be blank.");
    const { error } = await supabase.from(table as never).update(patch as never).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditId(null);
    refresh();
  }

  async function addRow() {
    const seed = newRow();
    if ("name" in seed && !String(seed.name ?? "").trim()) {
      return toast.error("Item name is required.");
    }
    setAdding(true);
    const { error } = await supabase.from(table as never).insert(seed as never);
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("Row added");
    refresh();
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected row(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const { data: removed, error } = await supabase
      .from(table as never)
      .delete()
      .in("id", ids)
      .select("id");
    if (error) return toast.error(error.message);
    const count = (removed ?? []).length;
    if (count === 0) {
      return toast.error("Nothing was deleted — your role does not have delete permission on this table.");
    }
    toast.success(`Deleted ${count} row(s)`);
    setSelected(new Set());
    await qc.invalidateQueries({ queryKey: [queryKey] });
  }

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(String(r.id)));


  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 max-w-xs" />
        <div className="ml-auto flex gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={deleteSelected}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete Selected ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={addRow} disabled={adding}>
            {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Add
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) =>
                    setSelected(c ? new Set(filtered.map((r) => String(r.id))) : new Set())
                  }
                />
              </th>
              {columns.map((c) => <th key={c.key} className="p-3 font-medium" style={{ width: c.width }}>{c.label}</th>)}
              <th className="w-24 p-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={columns.length + 2} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={columns.length + 2} className="p-8 text-center text-muted-foreground">No records.</td></tr>}
            {filtered.map((row) => {
              const id = String(row.id);
              return (
                <MasterRow
                  key={id}
                  row={row}
                  columns={columns}
                  editing={editId === id}
                  draft={draft}
                  selected={selected.has(id)}
                  onToggle={toggle}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSave={saveEdit}
                  onDraftChange={setDraft}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
        <span>
          {total === 0 ? "0 records" : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} of ${total}`}
          {isFetching && !isLoading ? " · syncing…" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>Page {page + 1} / {pageCount}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Memoized row — only re-renders when its own data, edit or selection state changes. */
const MasterRow = memo(function MasterRow({
  row, columns, editing, draft, selected, onToggle, onStartEdit, onCancelEdit, onSave, onDraftChange,
}: {
  row: Record<string, unknown>;
  columns: Column[];
  editing: boolean;
  draft: Record<string, unknown>;
  selected: boolean;
  onToggle: (id: string) => void;
  onStartEdit: (row: Record<string, unknown>) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDraftChange: (fn: (d: Record<string, unknown>) => Record<string, unknown>) => void;
}) {
  const id = String(row.id);
  return (
    <tr className={selected ? "bg-accent/40" : "hover:bg-muted/30"}>
      <td className="p-3"><Checkbox checked={selected} onCheckedChange={() => onToggle(id)} /></td>
      {columns.map((c) => (
        <td key={c.key} className="p-3">
          {c.derive ? (
            <span className="font-medium">{c.derive(editing ? draft : row)}</span>
          ) : editing && !c.readOnly ? (
            <Input
              className="h-8"
              type={c.type === "number" ? "number" : "text"}
              value={String(draft[c.key] ?? "")}
              onChange={(e) =>
                onDraftChange((d) => ({ ...d, [c.key]: c.type === "number" ? Number(e.target.value) : e.target.value }))
              }
            />
          ) : (
            <span>{String(row[c.key] ?? "")}</span>
          )}
        </td>
      ))}
      <td className="p-3 text-right">
        {editing ? (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" aria-label="Save changes" className="h-8 w-8 text-primary" onClick={onSave}><Check className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Cancel editing" className="h-8 w-8" onClick={onCancelEdit}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button size="icon" variant="ghost" aria-label="Edit row" className="h-8 w-8" onClick={() => onStartEdit(row)}><Pencil className="h-4 w-4" /></Button>
        )}
      </td>
    </tr>
  );
});

