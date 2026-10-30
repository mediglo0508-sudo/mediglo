import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayIST, ilikeOrClause } from "@/lib/utils";
import type {
  Customer,
  ServiceMaster,
  InventoryItem,
  Appointment,
  GstStateCode,
} from "@/types/domain";

/** Shared read-only lookups used across many pages - kept in one place with a
 * long staleTime since master data changes rarely relative to transactions. */

export function useServices() {
  return useQuery({
    queryKey: ["services_master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_master")
        .select("*")
        .eq("active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data as ServiceMaster[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["inventory_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .eq("is_service", false)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as InventoryItem[];
    },
    staleTime: 60_000,
  });
}

export function useGstStateCodes() {
  return useQuery({
    queryKey: ["gst_state_codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gst_state_codes").select("*").order("code");
      if (error) throw error;
      return data as GstStateCode[];
    },
    staleTime: 60 * 60_000,
  });
}

export function useCustomerSearch(query: string) {
  return useQuery({
    queryKey: ["customer_search", query],
    queryFn: async () => {
      if (!query || query.trim().length < 2) return [] as Customer[];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .or(`${ilikeOrClause("name", query)},${ilikeOrClause("phone", query)}`)
        .limit(20);
      if (error) throw error;
      return data as Customer[];
    },
    enabled: query.trim().length >= 2,
  });
}

export function useTodaysAppointments(doctorId?: string) {
  return useQuery({
    queryKey: ["appointments_today", doctorId],
    queryFn: async () => {
      const today = todayIST();
      let q = supabase.from("cos_appointments").select("*").eq("appointment_date", today).order("appointment_time");
      if (doctorId) q = q.eq("doctor_id", doctorId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Appointment[];
    },
    refetchInterval: 30_000,
  });
}
