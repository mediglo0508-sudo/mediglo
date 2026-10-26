// ============================================================================
// Doctor → Counselor → Reception workflow.
//
// Sits on top of the existing patient_visits queue: a visit gains an encounter,
// a structured doctor recommendation and a priced counselor quotation.
// Everything runs as the signed-in user, so RLS decides who may read or write.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RxItemType = "service" | "product";
export type Urgency = "low" | "normal" | "high" | "urgent";

export interface RecommendationItemInput {
  item_type: RxItemType;
  service_id?: string | null;
  inventory_id?: string | null;
  name: string;
  sessions?: number;
  quantity?: number;
  suggested_price?: number;
  urgency?: Urgency;
  notes?: string | null;
}

export interface RecommendationInput {
  visit_id: string;
  customer_name: string;
  customer_id?: string | null;
  diagnosis?: string | null;
  instructions?: string | null;
  clinical_notes?: string | null;
  finalize?: boolean;
  items: RecommendationItemInput[];
}

export interface QuotationItem {
  id: string;
  item_type: RxItemType;
  service_id?: string | null;
  inventory_id?: string | null;
  name: string;
  quantity: number;
  doctor_suggested_price: number;
  quoted_price: number;
  discount_amount: number;
  final_amount: number;
  notes?: string | null;
}

export interface QuotationInput {
  visit_id: string;
  customer_name: string;
  customer_id?: string | null;
  prescription_id?: string | null;
  items: QuotationItem[];
  subtotal: number;
  discount_amount: number;
  discount_reason?: string | null;
  cgst: number;
  sgst: number;
  net_total: number;
  transaction_type: "treatment" | "products_only" | "billing_only" | "treatment_and_products";
  finalize?: boolean;
}

const VALIDITY_DAYS = 7;

/* --------------------------------- reads --------------------------------- */

export const getVisitWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { visit_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: rx } = await supabase
      .from("doctor_prescriptions")
      .select("*")
      .eq("visit_id", data.visit_id)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const items = rx
      ? ((
          await supabase
            .from("doctor_prescription_items")
            .select("*")
            .eq("prescription_id", rx.id)
            .order("sort_order")
        ).data ?? [])
      : [];

    const { data: quote } = await supabase
      .from("counselor_quotations")
      .select("*")
      .eq("visit_id", data.visit_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const expired =
      quote &&
      quote.expires_at != null &&
      new Date(quote.expires_at).getTime() < Date.now() &&
      !["converted_to_invoice", "rejected", "expired"].includes(quote.status);

    if (expired && quote) {
      await supabase.from("counselor_quotations").update({ status: "expired" }).eq("id", quote.id);
      quote.status = "expired";
    }

    return { prescription: rx ?? null, items, quotation: quote ?? null };
  });

/* -------------------------- doctor recommendation ------------------------- */

export const saveRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: RecommendationInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("doctor_prescriptions")
      .select("id")
      .eq("visit_id", data.visit_id)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const header = {
      visit_id: data.visit_id,
      customer_name: data.customer_name,
      customer_id: data.customer_id ?? null,
      diagnosis: data.diagnosis ?? null,
      instructions: data.instructions ?? null,
      clinical_notes: data.clinical_notes ?? null,
      status: data.finalize ? "finalized" : "draft",
      finalized_at: data.finalize ? new Date().toISOString() : null,
      doctor_id: userId,
    };

    let prescriptionId = existing?.id ?? null;
    if (prescriptionId) {
      const { error } = await supabase.from("doctor_prescriptions").update(header).eq("id", prescriptionId);
      if (error) throw new Error(error.message);
      await supabase.from("doctor_prescription_items").delete().eq("prescription_id", prescriptionId);
    } else {
      const { data: created, error } = await supabase
        .from("doctor_prescriptions")
        .insert(header)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      prescriptionId = created.id;
    }

    if (data.items.length) {
      const rows = data.items.map((it, i) => ({
        prescription_id: prescriptionId!,
        item_type: it.item_type,
        service_id: it.service_id ?? null,
        inventory_id: it.inventory_id ?? null,
        name: it.name,
        sessions: Math.max(1, Number(it.sessions ?? 1)),
        quantity: Math.max(0.01, Number(it.quantity ?? 1)),
        suggested_price: Math.max(0, Number(it.suggested_price ?? 0)),
        urgency: it.urgency ?? "normal",
        notes: it.notes ?? null,
        sort_order: i,
      }));
      const { error } = await supabase.from("doctor_prescription_items").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { prescription_id: prescriptionId! };
  });

/* ---------------------------- counselor quotation ------------------------- */

export const saveQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: QuotationInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("counselor_quotations")
      .select("id, quotation_number, status")
      .eq("visit_id", data.visit_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && ["converted_to_invoice", "rejected"].includes(existing.status)) {
      throw new Error("This quotation is already closed and can no longer be changed.");
    }

    // The quotation number is assigned automatically by the database when the
    // quotation leaves draft state, so nothing privileged is called from here.
    let quotationNumber = existing?.quotation_number ?? null;


    const now = new Date();
    const payload = {
      visit_id: data.visit_id,
      customer_name: data.customer_name,
      customer_id: data.customer_id ?? null,
      prescription_id: data.prescription_id ?? null,
      counselor_id: userId,
      status: data.finalize ? "sent_to_patient" : "draft",
      quotation_number: quotationNumber,
      items_json: data.items as unknown as never,
      subtotal: data.subtotal,
      discount_amount: data.discount_amount,
      discount_reason: data.discount_reason ?? null,
      cgst: data.cgst,
      sgst: data.sgst,
      net_total: data.net_total,
      transaction_type: data.transaction_type,
      validity_days: VALIDITY_DAYS,
      expires_at: data.finalize
        ? new Date(now.getTime() + VALIDITY_DAYS * 86_400_000).toISOString()
        : null,
      finalized_at: data.finalize ? now.toISOString() : null,
    };

    if (existing) {
      const { data: updated, error } = await supabase
        .from("counselor_quotations")
        .update(payload)
        .eq("id", existing.id)
        .select("id, quotation_number")
        .single();
      if (error) throw new Error(error.message);
      return { quotation_id: existing.id, quotation_number: updated?.quotation_number ?? quotationNumber };
    }

    const { data: created, error } = await supabase
      .from("counselor_quotations")
      .insert(payload)
      .select("id, quotation_number")
      .single();
    if (error) throw new Error(error.message);
    return { quotation_id: created.id, quotation_number: created.quotation_number ?? quotationNumber };

  });

export const setQuotationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { quotation_id: string; status: "accepted" | "rejected" | "sent_to_patient" | "converted_to_invoice" }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("counselor_quotations")
      .update({ status: data.status })
      .eq("id", data.quotation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- encounter ------------------------------- */

export const markEncounter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      visit_id: string;
      customer_name: string;
      customer_id?: string | null;
      stage: "checked_in" | "in_progress" | "completed";
      encounter_type?: "consultation" | "follow_up" | "treatment" | "direct_treatment" | "checkout";
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("encounters")
      .select("id")
      .eq("visit_id", data.visit_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const stagePatch =
      data.stage === "checked_in"
        ? { checked_in_at: now, checked_in_by: userId }
        : data.stage === "in_progress"
          ? { started_at: now, started_by: userId }
          : { completed_at: now, completed_by: userId };

    if (existing) {
      const { error } = await supabase
        .from("encounters")
        .update({ status: data.stage, ...stagePatch })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { encounter_id: existing.id };
    }

    const { data: created, error } = await supabase
      .from("encounters")
      .insert({
        visit_id: data.visit_id,
        customer_name: data.customer_name,
        customer_id: data.customer_id ?? null,
        encounter_type: data.encounter_type ?? "consultation",
        status: data.stage,
        ...stagePatch,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { encounter_id: created.id };
  });
