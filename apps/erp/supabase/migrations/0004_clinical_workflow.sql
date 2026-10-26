-- =============================================================================
-- 0004_clinical_workflow.sql
-- Doctor -> Counselor -> Reception/Pharmacist, as structured records instead
-- of free-text notes. Consolidates comprehensive-clinic-workflow-architecture
-- -audit.md, lovable-implementation-prompt-complete.md and
-- PHASE-2-PHARMACIST-IMPLEMENTATION-SPEC.md into one coherent schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Doctor prescriptions - ONE structured recommendation per encounter.
-- Immutable once sent to a counselor (enforced in 0008_functions.sql via a
-- trigger, not just app-level convention).
-- ---------------------------------------------------------------------------
create type public.prescription_status as enum ('draft','sent_to_counselor','finalized','voided');

create table public.doctor_prescriptions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  doctor_id uuid not null references auth.users(id),

  diagnosis text,
  clinical_notes text,

  status public.prescription_status not null default 'draft',
  sent_to_counselor_at timestamptz,
  sent_to_counselor_id uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index idx_doctor_prescriptions_customer_id on public.doctor_prescriptions(customer_id);
create index idx_doctor_prescriptions_doctor_id on public.doctor_prescriptions(doctor_id);
create index idx_doctor_prescriptions_encounter_id on public.doctor_prescriptions(encounter_id);
create index idx_doctor_prescriptions_status on public.doctor_prescriptions(status);

create trigger set_updated_at_doctor_prescriptions before update on public.doctor_prescriptions
  for each row execute function app_private.set_updated_at();

create table public.doctor_prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.doctor_prescriptions(id) on delete cascade,
  item_type text not null check (item_type in ('service','product')),
  service_id uuid references public.services_master(id),
  product_id uuid references public.inventory(id),
  name text not null,                       -- snapshot, survives master renames
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  doctor_suggested_price numeric(10,2) not null default 0,
  doctor_notes text,
  created_at timestamptz not null default now()
);

create index idx_prescription_items_prescription_id on public.doctor_prescription_items(prescription_id);

-- ---------------------------------------------------------------------------
-- Counselor quotations - single pricing box: items + discount + GST + total.
-- ---------------------------------------------------------------------------
create type public.quotation_status as enum
  ('draft','sent_to_patient','accepted','rejected','converted_to_invoice','expired');

create type public.transaction_type as enum
  ('treatment','products_only','billing_only','treatment_and_products');

create table public.counselor_quotations (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  prescription_id uuid references public.doctor_prescriptions(id) on delete set null,
  counselor_id uuid not null references auth.users(id),

  quotation_number text unique,
  items_json jsonb not null default '[]'::jsonb,

  subtotal numeric(10,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  discount_reason text,
  discount_approved_by uuid references auth.users(id),

  cgst numeric(10,2) not null default 0,
  sgst numeric(10,2) not null default 0,
  net_total numeric(10,2) not null default 0,

  transaction_type public.transaction_type not null default 'treatment_and_products',
  status public.quotation_status not null default 'draft',

  validity_days int not null default 7 check (validity_days > 0),
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index idx_counselor_quotations_customer_id on public.counselor_quotations(customer_id);
create index idx_counselor_quotations_counselor_id on public.counselor_quotations(counselor_id);
create index idx_counselor_quotations_status on public.counselor_quotations(status);
create index idx_counselor_quotations_encounter_id on public.counselor_quotations(encounter_id);

create trigger set_updated_at_counselor_quotations before update on public.counselor_quotations
  for each row execute function app_private.set_updated_at();

comment on column public.counselor_quotations.items_json is
  'Array of {id, type, service_id|product_id, name, quantity, doctor_suggested_price, '
  'counselor_quoted_price, discount_applied, discount_percent, final_amount, notes}. '
  'Doctor''s suggested price is preserved alongside the counselor''s quote for audit.';

-- ---------------------------------------------------------------------------
-- Pharmacist product-order pipeline (Phase 2 spec) - products-only path that
-- skips counselor pricing and goes straight to a pharmacist queue.
-- ---------------------------------------------------------------------------
create type public.product_order_status as enum
  ('pending','assigned','confirmed','ready_for_pickup','completed','cancelled');

create table public.product_orders (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  quotation_id uuid references public.counselor_quotations(id) on delete set null,

  assigned_to uuid references auth.users(id),
  assigned_at timestamptz,

  status public.product_order_status not null default 'pending',
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),

  items_json jsonb not null default '[]'::jsonb,
  total_amount numeric(10,2) not null default 0,
  payment_method text,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','partial','failed')),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_orders_customer_id on public.product_orders(customer_id);
create index idx_product_orders_assigned_to on public.product_orders(assigned_to);
create index idx_product_orders_status on public.product_orders(status);

create trigger set_updated_at_product_orders before update on public.product_orders
  for each row execute function app_private.set_updated_at();

create table public.pharmacist_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.product_orders(id) on delete cascade,
  product_id uuid not null references public.inventory(id) on delete restrict,
  quantity_requested numeric(10,2) not null check (quantity_requested > 0),
  quantity_dispensed numeric(10,2),
  quantity_returned numeric(10,2) not null default 0,
  unit_price numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  batch_no text,
  expiry_date date,
  status text not null default 'pending' check (status in ('pending','confirmed','dispensed','returned','damaged')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_pharmacist_items_order_id on public.pharmacist_order_items(order_id);
create index idx_pharmacist_items_product_id on public.pharmacist_order_items(product_id);

create table public.pharmacist_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  can_view_treatment_pricing boolean not null default false,
  can_approve_discounts boolean not null default false,
  max_discount_percent int not null default 0,
  max_discount_amount numeric(10,2) not null default 0,
  can_modify_product_prices boolean not null default false,
  can_adjust_inventory boolean not null default false,
  can_process_returns boolean not null default false,
  can_write_off_damaged boolean not null default false,
  is_senior_pharmacist boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create trigger set_updated_at_pharmacist_permissions before update on public.pharmacist_permissions
  for each row execute function app_private.set_updated_at();
