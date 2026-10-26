import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_MODES } from "@/lib/constants";

const KEY = "payment_modes";
export const normModeKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function mergeModes(...lists: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lists) for (const m of l) {
    const clean = String(m ?? "").trim().replace(/\s+/g, " ");
    const k = clean.toLowerCase();
    if (!clean || seen.has(k)) continue;
    seen.add(k); out.push(clean);
  }
  return out;
}

async function fetchCustomModes(): Promise<string[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const v = (data?.value as { modes?: unknown } | null)?.modes;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Built-in modes (base) + persisted custom modes, de-duplicated case-insensitively. */
export function usePaymentModes(base: readonly string[] = PAYMENT_MODES) {
  const { data: custom = [] } = useQuery({ queryKey: ["payment_modes"], queryFn: fetchCustomModes, staleTime: 60_000 });
  return { modes: mergeModes(base, custom), custom };
}

export function useAddPaymentMode() {
  const qc = useQueryClient();
  return async (raw: string, existing: string[]): Promise<string> => {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 40) throw new Error("Name must be 1–40 characters");
    if (!/^[\p{L}\p{N} &/().+-]+$/u.test(name)) throw new Error("Use letters, numbers and & / ( ) . + - only");
    if (existing.some((m) => normModeKey(m) === normModeKey(name))) throw new Error(`"${name}" already exists`);
    const custom = await fetchCustomModes();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert(
      { key: KEY, value: { modes: mergeModes(custom, [name]) }, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["payment_modes"] });
    return name;
  };
}
