import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { inr2 } from "@/lib/gst";

export interface ServiceRow {
  id: string;
  name: string;
  sac_code: string | null;
  default_price: number | null;
  gst_rate: number | null;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  sale_price: number | null;
  cost_price: number | null;
  stock_qty: number | null;
}

/** Live service catalog (clinic core service master). */
export function useServiceCatalog() {
  return useQuery({
    queryKey: ["catalog-services"],
    queryFn: async (): Promise<ServiceRow[]> =>
      (
        await supabase
          .from("services_master")
          .select("id, name, sac_code, default_price, gst_rate")
          .eq("active", true)
          .order("name")
      ).data ?? [],
    staleTime: 60_000,
  });
}

/** Live unified inventory (pharmacy / products / consumables). */
export function useProductCatalog() {
  return useQuery({
    queryKey: ["catalog-products"],
    queryFn: async (): Promise<ProductRow[]> =>
      (
        (
          await supabase
            .from("inventory")
            .select("id, name, category, rate, stock")
            .eq("active", true)
            .order("name")
        ).data ?? []
      ).map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        sale_price: r.rate,
        cost_price: r.rate,
        stock_qty: r.stock,
      })),
    staleTime: 60_000,
  });
}

export function serviceOptions(rows: ServiceRow[] = []): AutocompleteOption[] {
  return rows.map((s) => ({
    value: s.id,
    label: s.name,
    sublabel: `${s.sac_code ? `SAC ${s.sac_code} · ` : ""}${s.default_price != null ? inr2(Number(s.default_price)) : ""}`.trim(),
  }));
}

export function productOptions(rows: ProductRow[] = []): AutocompleteOption[] {
  return rows.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: `${p.category ? `${p.category} · ` : ""}stk ${Number(p.stock_qty ?? 0)}${p.sale_price != null ? ` · ${inr2(Number(p.sale_price))}` : ""}`,
  }));
}
