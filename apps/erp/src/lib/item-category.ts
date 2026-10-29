// ============================================================================
// Item categorisation — invoice_lines has no category column, so a line is
// classified by matching its description against the live masters:
//   • inventory (pharmacy / products / consumables) → "product"
//   • services_master with a consultation category / name → "consultation"
//   • every other service master row → "service"
// Shared by the Dashboard product ledger and the Invoices tab filters so both
// screens always agree on what counts as a product.
//
// The pure rules live in `item-category.core.ts` so server code / AI tools can
// reuse them without pulling in React Query or the browser Supabase client.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildCatalogIndex, type CatalogIndex } from "./item-category.core";

export * from "./item-category.core";

/** Cached masters + a ready-to-use classifier index. */
export function useCatalogIndex() {
  return useQuery({
    queryKey: ["catalog-index"],
    staleTime: 60_000,
    queryFn: async (): Promise<CatalogIndex> => {
      const [prodRes, svcRes] = await Promise.all([
        supabase.from("inventory").select("name").eq("active", true),
        supabase.from("services_master").select("name, category, sac_code").eq("active", true),
      ]);
      return buildCatalogIndex(prodRes.data ?? [], svcRes.data ?? []);
    },
  });
}
