import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/realtime";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Boxes } from "lucide-react";

/** Stock threshold below which an item is flagged Low (but not Out). */
export const LOW_STOCK_THRESHOLD = 10;

interface StockItem {
  id: string;
  name: string;
  category: string;
  stock: number;
}

type StockState = "available" | "low" | "out";

function stateOf(qty: number): StockState {
  if (qty <= 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "available";
}

function StockBadge({ qty }: { qty: number }) {
  const state = stateOf(qty);
  if (state === "out") {
    return (
      <span className="rounded-full bg-cos-due px-2 py-0.5 text-[11px] font-bold text-white">
        Out of Stock
      </span>
    );
  }
  if (state === "low") {
    return (
      <span className="cos-flash rounded-full bg-cos-warn px-2 py-0.5 text-[11px] font-bold text-black">
        Low · {qty}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-cos-open px-2 py-0.5 text-[11px] font-semibold text-white">
      In Stock · {qty}
    </span>
  );
}

/**
 * Live inventory counter grid for the Doctor / Counsellor panels.
 * Recomputes state on every render and refreshes instantly via realtime,
 * so a stock change reflects without navigating away from the patient file.
 */
export function InventoryVisibilityGrid({ title = "Live Stock Monitor" }: { title?: string }) {
  const [q, setQ] = useState("");
  useRealtimeSync(["inventory"], ["inventory-live"]);

  const { data: items } = useQuery({
    queryKey: ["inventory-live"],
    queryFn: async () =>
      ((await supabase
        .from("inventory")
        .select("id, name, category, stock")
        .eq("active", true)
        .order("stock", { ascending: true })).data ?? []) as StockItem[],
  });

  const list = (items ?? []).filter((i) =>
    `${i.name} ${i.category}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Boxes className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Check a product's stock during consultation…"
          className="h-9 pl-8"
        />
      </div>
      <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {list.map((i) => (
          <div
            key={i.id}
            className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{i.category}</p>
            </div>
            <div className="shrink-0">
              <StockBadge qty={Number(i.stock)} />
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            {q ? "No items match your search." : "No active inventory items."}
          </p>
        )}
      </div>
    </Card>
  );
}
