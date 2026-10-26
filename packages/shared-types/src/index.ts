/**
 * @mediglo/shared-types
 *
 * The contract shared between MediGlo Harmony (ERP) and MediGlo Tracker.
 * Both apps import this package so the sync payloads, roles, and entity
 * shapes can never silently drift apart between the two codebases.
 *
 * This package has NO runtime code and NO dependency on either app's
 * Supabase project - it only describes the shapes that cross the wire
 * between them (via the sync edge functions / outbox tables).
 */

// ---------------------------------------------------------------------------
// Shared staff roles (one staff identity, one role vocabulary, both apps)
// ---------------------------------------------------------------------------

export const STAFF_ROLES = [
  "admin",
  "doctor",
  "reception",
  "accountant",
  "counselor",
  "therapist",
  "pharmacist",
  "marketing",
  "marketing_head",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles that may view financial/profitability data. */
export const FINANCE_ROLES: StaffRole[] = ["admin", "accountant"];

/** Roles allowed to edit or delete a finalized invoice (per the fixed RLS policy). */
export const INVOICE_WRITE_ROLES: StaffRole[] = [
  "admin",
  "accountant",
  "reception",
  "pharmacist",
];

// ---------------------------------------------------------------------------
// Sync entity envelope
// ---------------------------------------------------------------------------

export type SyncEntityType =
  | "customer"
  | "appointment"
  | "invoice"
  | "dues"
  | "patient_journey_event";

export type SyncDirection = "erp_to_tracker" | "tracker_to_erp";

export type SyncOperation = "created" | "updated" | "deleted";

/** One row of the outbox/inbox queue, as it crosses the wire. */
export interface SyncEnvelope<TPayload = unknown> {
  id: string;
  direction: SyncDirection;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  payload: TPayload;
  /** Monotonic per-source cursor (source's updated_at or a sequence) used for incremental pulls. */
  cursor: string;
  created_at: string;
  claimed_at: string | null;
  delivered_at: string | null;
  last_error: string | null;
  attempt_count: number;
}

// ---------------------------------------------------------------------------
// Payload shapes - ERP is the source of truth for these
// ---------------------------------------------------------------------------

export interface HarmonyCustomerPayload {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  age: number | null;
  address: string | null;
  city: string | null;
  state_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface HarmonyAppointmentPayload {
  id: string;
  customer_id: string;
  doctor_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: "scheduled" | "checked_in" | "in_progress" | "completed" | "cancelled" | "no_show";
  appointment_source: string;
  color_tag: string | null;
  service_name: string | null;
  notes: string | null;
  updated_at: string;
}

export interface HarmonyInvoicePayload {
  id: string;
  invoice_no: string;
  customer_id: string;
  gross_total: number;
  cgst: number;
  sgst: number;
  payment_mode: string;
  status: string;
  invoice_type: string;
  created_at: string;
  updated_at: string;
}

export interface HarmonyDuesPayload {
  customer_id: string;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  as_of: string;
}

// ---------------------------------------------------------------------------
// Payload shapes - Tracker originates these, ERP applies them
// ---------------------------------------------------------------------------

export interface TrackerBookAppointmentRequest {
  tracker_journey_id: string;
  harmony_customer_id: string | null;
  new_customer?: {
    name: string;
    phone: string;
  };
  requested_date: string;
  requested_time: string;
  service_name: string;
  notes: string | null;
  requested_by_staff_id: string;
}

export interface TrackerLinkPatientRequest {
  tracker_journey_id: string;
  harmony_customer_id: string;
}

// ---------------------------------------------------------------------------
// Identity bridge (single staff login across both apps)
// ---------------------------------------------------------------------------

/** Claims embedded in the shared identity token exchanged between the two apps. */
export interface MediGloIdentityClaims {
  sub: string; // Harmony auth.users.id - the one canonical staff id
  email: string;
  full_name: string;
  roles: StaffRole[];
  iss: "mediglo-harmony";
  aud: "mediglo-tracker";
  iat: number;
  exp: number;
}
