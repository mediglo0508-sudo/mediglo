/**
 * Hand-written types matching supabase/migrations/*.sql. Kept in one place so
 * every hook and component in this app agrees on the shape of a row. See the
 * note in src/lib/supabase.ts about optionally replacing this with a
 * generated Database type once a real Supabase project is connected.
 */

import type { StaffRole } from "@mediglo/shared-types";

export type { StaffRole };

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  age: number | null;
  dob: string | null;
  address: string | null;
  city: string | null;
  state_code: string | null;
  referral_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceMaster {
  id: string;
  name: string;
  category: string | null;
  sac_code: string | null;
  default_price: number;
  gst_rate: number;
  default_sessions: number;
  active: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  is_service: boolean;
  unit: string;
  stock_qty: number;
  reorder_level: number;
  cost_price: number;
  sale_price: number;
  gst_rate: number;
  active: boolean;
}

export type AppointmentStatus =
  | "scheduled"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type AppointmentSource =
  | "manual"
  | "google_calendar"
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "phone_call"
  | "walk_in"
  | "tracker"
  | "other";

export const APPOINTMENT_COLORS = [
  { value: "default", label: "Default", hex: "#9ca3af" },
  { value: "cyan", label: "Cyan", hex: "#039be5" },
  { value: "emerald", label: "Emerald", hex: "#33b679" },
  { value: "purple", label: "Purple", hex: "#8e24aa" },
  { value: "coral", label: "Coral", hex: "#e67c73" },
  { value: "gold", label: "Gold", hex: "#f6bf26" },
  { value: "lime", label: "Lime", hex: "#7cb342" },
  { value: "pink", label: "Pink", hex: "#f06292" },
] as const;

export interface Appointment {
  id: string;
  customer_id: string;
  doctor_id: string | null;
  service_id: string | null;
  service_name: string | null;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  appointment_source: AppointmentSource;
  appointment_source_metadata: Record<string, unknown>;
  color_tag: string | null;
  color_hex: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentDetailsView {
  appointment_id: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  appointment_source: AppointmentSource;
  appointment_source_metadata: Record<string, unknown>;
  color_tag: string | null;
  color_hex: string | null;
  notes: string | null;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_age: number | null;
  customer_gender: string | null;
  customer_address: string | null;
  customer_city: string | null;
  doctor_name: string | null;
}

export type EncounterType = "consultation" | "follow_up" | "treatment" | "direct_treatment" | "checkout";
export type EncounterStatus = "scheduled" | "checked_in" | "in_progress" | "completed" | "cancelled";

export interface Encounter {
  id: string;
  appointment_id: string | null;
  customer_id: string;
  encounter_type: EncounterType;
  status: EncounterStatus;
  checked_in_at: string | null;
  checked_in_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PrescriptionItem {
  id: string;
  type: "service" | "product";
  service_id?: string;
  product_id?: string;
  name: string;
  quantity: number;
  doctor_suggested_price: number;
  doctor_notes: string;
}

export interface DoctorPrescription {
  id: string;
  encounter_id: string;
  customer_id: string;
  doctor_id: string;
  diagnosis: string | null;
  clinical_notes: string | null;
  status: "draft" | "sent_to_counselor" | "finalized" | "voided";
  sent_to_counselor_at: string | null;
  sent_to_counselor_id: string | null;
  created_at: string;
}

export interface QuotationItem {
  id: string;
  type: "service" | "product";
  service_id?: string;
  product_id?: string;
  name: string;
  quantity: number;
  doctor_suggested_price: number;
  counselor_quoted_price: number;
  discount_applied: number;
  discount_percent: number;
  final_amount: number;
  notes?: string;
  /** GST% resolved from services_master/inventory at quote time, for an
   * accurate preview total - see the CartLine.gst_rate comment in
   * BillLineEditor.tsx for why edit_invoice() re-resolves this live anyway. */
  gst_rate?: number;
}

export type QuotationStatus = "draft" | "sent_to_patient" | "accepted" | "rejected" | "converted_to_invoice" | "expired";
export type TransactionType = "treatment" | "products_only" | "billing_only" | "treatment_and_products";

export interface CounselorQuotation {
  id: string;
  encounter_id: string;
  customer_id: string;
  prescription_id: string | null;
  counselor_id: string;
  quotation_number: string | null;
  items_json: QuotationItem[];
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  discount_reason: string | null;
  cgst: number;
  sgst: number;
  net_total: number;
  transaction_type: TransactionType;
  status: QuotationStatus;
  validity_days: number;
  expires_at: string | null;
  created_at: string;
}

export interface ProductOrderItem {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  batch_no?: string;
  expiry_date?: string;
  notes?: string;
}

export type ProductOrderStatus = "pending" | "assigned" | "confirmed" | "ready_for_pickup" | "completed" | "cancelled";

export interface ProductOrder {
  id: string;
  encounter_id: string;
  customer_id: string;
  quotation_id: string | null;
  assigned_to: string | null;
  status: ProductOrderStatus;
  items_json: ProductOrderItem[];
  total_amount: number;
  payment_status: "pending" | "paid" | "partial" | "failed";
  notes: string | null;
  created_at: string;
}

export type InvoiceStatus = "draft" | "pending" | "paid" | "partially_paid" | "void";
export type InvoiceType = "treatment" | "products" | "treatment_and_products";
export type PaymentMode = "cash" | "upi" | "card" | "netbanking" | "split";

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  item_type: "service" | "product";
  service_id: string | null;
  product_id: string | null;
  inventory_id: string | null;
  name: string;
  quantity: number;
  rate: number;
  discount_amount: number;
  line_amount: number;
  staff_id: string | null;
  line_status: "active" | "voided" | "replaced";
  /** Resolved live from services_master/inventory.gst_rate at billing time; null until the line has been through edit_invoice(). */
  gst_rate: number | null;
}

export interface Invoice {
  id: string;
  invoice_no: string | null;
  customer_id: string;
  quotation_id: string | null;
  prescription_id: string | null;
  encounter_id: string | null;
  product_order_id: string | null;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  subtotal: number;
  discount_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  gross_total: number;
  gst_mode: "inclusive" | "exclusive";
  payment_mode: PaymentMode;
  amount_paid: number;
  staff_id: string | null;
  place_of_supply: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  invoice_lines?: InvoiceLine[];
}

export interface ServiceWallet {
  id: string;
  invoice_line_id: string;
  customer_id: string;
  service_id: string | null;
  service_name: string;
  total_sessions: number;
  consumed_sessions: number;
  status: "active" | "exhausted" | "voided";
}

export interface IndirectExpense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  paid_to: string | null;
  payment_mode: PaymentMode;
  expense_date: string;
}

export interface BillingAccess {
  can_bill: boolean;
  can_view_finance: boolean;
  is_admin: boolean;
  roles: StaffRole[];
}

export interface GstStateCode {
  code: string;
  name: string;
}

export interface ClinicSettings {
  clinic_name: string | null;
  /** GST state code (public.gst_state_codes) of the clinic's own registered
   * location. Left null until an admin sets it - see clinic_settings in
   * 0011_production_hardening.sql for why that's the safe default. */
  home_state_code: string | null;
}
