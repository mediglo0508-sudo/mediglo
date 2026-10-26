import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveWallet {
  id: string;
  service_name: string;
  total_sessions: number;
  consumed_sessions: number;
  remaining: number;
  customer_name: string | null;
  customer_phone: string | null;
}

/** Live active wallets for a given customer (by name, case-insensitive). */
export function useActiveWallets(customerName: string | null | undefined) {
  const key = (customerName ?? "").trim();
  return useQuery({
    queryKey: ["active-wallets", key.toLowerCase()],
    enabled: key.length > 1,
    queryFn: async (): Promise<ActiveWallet[]> => {
      const { data } = await supabase
        .from("service_wallets")
        .select("id, service_name, total_sessions, consumed_sessions, customer_name, customer_phone, status")
        .ilike("customer_name", key)
        .eq("status", "active");
      return (data ?? [])
        .map((w) => ({
          id: w.id,
          service_name: w.service_name ?? "Service",
          total_sessions: Number(w.total_sessions) || 0,
          consumed_sessions: Number(w.consumed_sessions) || 0,
          remaining: Math.max(0, (Number(w.total_sessions) || 0) - (Number(w.consumed_sessions) || 0)),
          customer_name: w.customer_name ?? null,
          customer_phone: w.customer_phone ?? null,
        }))
        .filter((w) => w.remaining > 0);
    },
    staleTime: 30_000,
  });
}

/** Global pending-wallet queue (dashboard alerts). */
export function useAllPendingWallets() {
  return useQuery({
    queryKey: ["all-pending-wallets"],
    queryFn: async (): Promise<ActiveWallet[]> => {
      const { data } = await supabase
        .from("service_wallets")
        .select("id, service_name, total_sessions, consumed_sessions, customer_name, customer_phone, status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? [])
        .map((w) => ({
          id: w.id,
          service_name: w.service_name ?? "Service",
          total_sessions: Number(w.total_sessions) || 0,
          consumed_sessions: Number(w.consumed_sessions) || 0,
          remaining: Math.max(0, (Number(w.total_sessions) || 0) - (Number(w.consumed_sessions) || 0)),
          customer_name: w.customer_name ?? null,
          customer_phone: w.customer_phone ?? null,
        }))
        .filter((w) => w.remaining > 0);
    },
    staleTime: 30_000,
  });
}
