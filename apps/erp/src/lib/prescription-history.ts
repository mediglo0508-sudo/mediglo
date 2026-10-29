import { supabase } from "@/integrations/supabase/client";

export interface RxLineSnapshot {
  kind: "service" | "product";
  name: string;
  qty?: number;
  sessions?: number;
  rate?: number;
  line_total?: number;
}

export interface RxHistoryInsert {
  visit_id?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  doctor_notes?: string | null;
  counselor_notes?: string | null;
  services?: RxLineSnapshot[];
  products?: RxLineSnapshot[];
  recorded_role?: string | null;
}

/**
 * Append-only snapshot of the current clinical state. Called before any
 * status transition so notes/products survive downstream view unmounts.
 */
export async function recordPrescriptionSnapshot(input: RxHistoryInsert) {
  const user = (await supabase.auth.getUser()).data.user;
  const payload = {
    visit_id: input.visit_id ?? null,
    patient_id: input.patient_id ?? null,
    patient_name: input.patient_name ?? null,
    doctor_notes: input.doctor_notes ?? null,
    counselor_notes: input.counselor_notes ?? null,
    services: (input.services ?? []) as unknown as never,
    products: (input.products ?? []) as unknown as never,
    recorded_role: input.recorded_role ?? null,
    recorded_by: user?.id ?? null,
  };
  const { error } = await supabase.from("prescription_history").insert(payload);
  if (error) console.warn("[prescription_history] insert failed:", error.message);
}


export interface RxComposite {
  patient_name: string;
  doctor_notes: string;
  counselor_notes: string;
  services: RxLineSnapshot[];
  products: RxLineSnapshot[];
  last_updated: string | null;
}

/**
 * Merge the latest non-null values of each field across all history rows for
 * a patient. Guarantees therapist / reception always see the most recent
 * doctor + counselor notes together.
 */
export async function loadCompositePrescription(patientName: string): Promise<RxComposite | null> {
  const { data } = await supabase
    .from("prescription_history")
    .select("*")
    .ilike("patient_name", patientName)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return null;

  const composite: RxComposite = {
    patient_name: patientName,
    doctor_notes: "",
    counselor_notes: "",
    services: [],
    products: [],
    last_updated: (data[0] as { created_at: string }).created_at,
  };
  for (const row of data as Array<{
    doctor_notes: string | null;
    counselor_notes: string | null;
    services: RxLineSnapshot[] | null;
    products: RxLineSnapshot[] | null;
  }>) {
    if (!composite.doctor_notes && row.doctor_notes) composite.doctor_notes = row.doctor_notes;
    if (!composite.counselor_notes && row.counselor_notes) composite.counselor_notes = row.counselor_notes;
    if (composite.services.length === 0 && Array.isArray(row.services) && row.services.length > 0)
      composite.services = row.services;
    if (composite.products.length === 0 && Array.isArray(row.products) && row.products.length > 0)
      composite.products = row.products;
    if (composite.doctor_notes && composite.counselor_notes && composite.services.length && composite.products.length)
      break;
  }
  return composite;
}
