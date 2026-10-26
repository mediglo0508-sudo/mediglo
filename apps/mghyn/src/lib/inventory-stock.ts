import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StockDeductionItem {
  inventory_id: string;
  qty: number;
  batch_id?: string | null;
}

export type MovementType = "POS Sales" | "Service Consumed" | "Internal Consumption";

/**
 * Single source of truth for stock movement.
 * Deducts FIFO across `inventory_batches` (nearest expiry first) and writes an
 * append-only `inventory_ledger` entry for every movement. Runs server-side in
 * one transactional routine — a partial deduction can never be persisted.
 */
export async function deductStock(
  items: StockDeductionItem[],
  movementType: MovementType,
  source: string,
  note?: string | null,
) {
  const payload = items
    .filter((i) => i.inventory_id && Number(i.qty) > 0)
    .map((i) => ({ inventory_id: i.inventory_id, qty: Number(i.qty), batch_id: i.batch_id ?? null }));
  if (!payload.length) return null;

  const { data, error } = await supabase.rpc("deduct_inventory_stock", {
    p_items: payload,
    p_movement_type: movementType,
    p_source: source,
    p_note: note ?? undefined,
  });
  if (error) throw error;
  return data;
}

/**
 * Query keys that render live stock anywhere in the app.
 * NOTE: Master Inventory uses per-category keys (`inventory_Retail`, …), which is
 * why invalidation below matches by PREFIX instead of exact key equality.
 */
export const INVENTORY_QUERY_KEYS = [
  "inventory",
  "inventory-pos",
  "inventory_Retail",
  "inventory_Injectable",
  "inventory_In-house",
  "catalog-products",
  "duty-inventory",
  "inventory_batches",
  "inventory-ledger",
];

/** True for any query key that renders stock numbers. */
function isStockQueryKey(key: readonly unknown[]) {
  const head = String(key[0] ?? "");
  return head.startsWith("inventory") || head === "catalog-products" || head === "duty-inventory";
}

/** Refresh every stock-aware screen immediately after a movement. */
export function invalidateInventory(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => isStockQueryKey(q.queryKey) });
}

type StockRow = Record<string, unknown> & { id?: unknown };

/**
 * Optimistic UI: instantly subtract the quantities from every cached stock list
 * so the number on screen drops the moment the user hits Save — before the
 * network round-trip. Returns a rollback that restores the exact snapshots.
 */
export function applyOptimisticStock(qc: QueryClient, items: StockDeductionItem[]) {
  const wanted = new Map<string, number>();
  for (const i of items) {
    if (!i.inventory_id || Number(i.qty) <= 0) continue;
    wanted.set(i.inventory_id, (wanted.get(i.inventory_id) ?? 0) + Number(i.qty));
  }
  if (!wanted.size) return () => {};

  const snapshots = qc.getQueriesData({ predicate: (q) => isStockQueryKey(q.queryKey) });

  for (const [key, data] of snapshots) {
    if (!Array.isArray(data)) continue;
    let touched = false;
    const next = (data as StockRow[]).map((row) => {
      if (!row || typeof row !== "object") return row;
      const qty = wanted.get(String(row.id ?? ""));
      if (!qty) return row;
      touched = true;
      const patched: StockRow = { ...row };
      if (typeof row.stock === "number") patched.stock = Math.max(0, row.stock - qty);
      if (typeof row.stock_qty === "number") patched.stock_qty = Math.max(0, row.stock_qty - qty);
      if (typeof row.quantity === "number") patched.quantity = Math.max(0, row.quantity - qty);
      return patched;
    });
    if (touched) qc.setQueryData(key, next);
  }

  return () => {
    for (const [key, data] of snapshots) qc.setQueryData(key, data);
  };
}

/**
 * The one call every screen should use for a stock movement:
 * optimistic UI → server FIFO deduction → rollback on failure → resync on settle.
 */
export async function commitStockMovement(
  qc: QueryClient,
  items: StockDeductionItem[],
  movementType: MovementType,
  source: string,
  note?: string | null,
) {
  const rollback = applyOptimisticStock(qc, items);
  try {
    return await deductStock(items, movementType, source, note);
  } catch (e) {
    rollback();
    throw e;
  } finally {
    invalidateInventory(qc);
  }
}
