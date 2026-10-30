-- =============================================================================
-- 0005_billing_accounting.sql
-- Invoices, invoice lines, session wallets, Tally-style vouchers, and the
-- billing audit log. Built with the fixes from invoice-edit-delete-root-
-- cause-audit.md applied from day one:
--   - invoice_lines use soft-delete (line_status), never a hard DELETE, so
--     editing a bill can never cascade-wipe service_wallets / redemptions.
--   - service_wallets -> invoice_lines FK is ON DELETE RESTRICT, not CASCADE.
--   - invoices keep a real delete policy (role-gated), not an unconditional
--     RESTRICTIVE `USING (false)` that blocks even admins.
-- =============================================================================

create type public.invoice_status as enum ('draft','pending','paid','partially_paid','void');
create type public.invoice_type as enum ('treatment','products','treatment_and_products');
create type public.payment_mode as enum ('cash','upi','card','netbanking','split');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,                 -- assigned by next_invoice_no() trigger if left blank
  customer_id uuid not null references public.customers(id) on delete restrict,

  -- audit trail links back through the clinical workflow
  quotation_id uuid references public.counselor_quotations(id) on delete set null,
  prescription_id uuid references public.doctor_prescriptions(id) on delete set null,
  encounter_id uuid references public.encounters(id) on delete set null,
  product_order_id uuid references public.product_orders(id) on delete set null,

  invoice_type public.invoice_type not null default 'treatment_and_products',
  status public.invoice_status not null default 'pending',

  subtotal numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  cgst numeric(10,2) not null default 0,
  sgst numeric(10,2) not null default 0,
  gross_total numeric(10,2) not null default 0,

  gst_mode text not null default 'exclusive' check (gst_mode in ('inclusive','exclusive')),
  payment_mode public.payment_mode not null default 'cash',
  amount_paid numeric(10,2) not null default 0,

  staff_id uuid references auth.users(id),   -- staff allocated to this sale (Module 16)
  dispensed_by uuid references auth.users(id),
  dispensed_at timestamptz,

  place_of_supply text references public.gst_state_codes(code),
  notes text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoices_customer_id on public.invoices(customer_id);
create index idx_invoices_status on public.invoices(status);
create index idx_invoices_quotation_id on public.invoices(quotation_id);
create index idx_invoices_prescription_id on public.invoices(prescription_id);
create index idx_invoices_encounter_id on public.invoices(encounter_id);
create index idx_invoices_product_order_id on public.invoices(product_order_id);
create index idx_invoices_updated_at on public.invoices(updated_at); -- sync cursor scans
create index idx_invoices_payment_mode on public.invoices(payment_mode); -- GST/ITR export hub filters

create trigger set_updated_at_invoices before update on public.invoices
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invoice lines - SOFT DELETE via line_status. Never hard-deleted by the app;
-- this is what the diff-based-upsert editor in 0008_functions.sql relies on.
-- ---------------------------------------------------------------------------
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_type text not null check (item_type in ('service','product')),
  service_id uuid references public.services_master(id),
  product_id uuid references public.inventory(id),
  inventory_id uuid references public.inventory(id), -- explicit stock-movement link (rebill_invoice_inventory keys off this)
  name text not null,
  quantity numeric(10,2) not null default 1,
  rate numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  line_amount numeric(10,2) not null default 0,
  staff_id uuid references auth.users(id),       -- per-line staff allocation

  line_status text not null default 'active' check (line_status in ('active','voided','replaced')),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  voided_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoice_lines_invoice_id on public.invoice_lines(invoice_id);
create index idx_invoice_lines_status on public.invoice_lines(line_status);
create index idx_invoice_lines_inventory_id on public.invoice_lines(inventory_id);
create index idx_invoice_lines_service_id on public.invoice_lines(service_id);

create trigger set_updated_at_invoice_lines before update on public.invoice_lines
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Service wallets - prepaid session counters. FK to invoice_lines is
-- ON DELETE RESTRICT (not CASCADE) so a line can never take wallet history
-- down with it; the app is expected to void lines, not delete them, anyway.
-- ---------------------------------------------------------------------------
create table public.service_wallets (
  id uuid primary key default gen_random_uuid(),
  invoice_line_id uuid not null unique references public.invoice_lines(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid references public.services_master(id),
  service_name text not null,
  total_sessions numeric(10,2) not null default 1,
  consumed_sessions numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active','exhausted','voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_service_wallets_customer_id on public.service_wallets(customer_id);
create index idx_service_wallets_status on public.service_wallets(status);

create trigger set_updated_at_service_wallets before update on public.service_wallets
  for each row execute function app_private.set_updated_at();

create table public.wallet_redemptions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.service_wallets(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  sessions_used numeric(10,2) not null default 1,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz not null default now(),
  notes text
);

create index idx_wallet_redemptions_wallet_id on public.wallet_redemptions(wallet_id);

-- ---------------------------------------------------------------------------
-- Tally-style accounting: ledgers, vouchers, voucher entries (double entry)
-- ---------------------------------------------------------------------------
create type public.voucher_type as enum
  ('sales','purchase','payment','receipt','contra','credit_note','debit_note');

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- 'Cash', 'ICICI Bank', 'Sales - Services', 'Sales - Products', 'GST Payable', 'Accounts Receivable', ...
  account_group text not null,        -- 'assets' | 'liabilities' | 'income' | 'expense' | 'equity'
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_type public.voucher_type not null,
  voucher_no text unique,
  voucher_date date not null default current_date,
  invoice_id uuid references public.invoices(id) on delete set null,
  narration text,
  amount numeric(10,2) not null default 0,
  cgst numeric(10,2) not null default 0,
  sgst numeric(10,2) not null default 0,
  igst numeric(10,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vouchers_invoice_id on public.vouchers(invoice_id);
create index idx_vouchers_type_date on public.vouchers(voucher_type, voucher_date);

create trigger set_updated_at_vouchers before update on public.vouchers
  for each row execute function app_private.set_updated_at();

create table public.voucher_entries (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  debit numeric(10,2) not null default 0,
  credit numeric(10,2) not null default 0,
  check (debit = 0 or credit = 0), -- one side per row, standard double-entry line
  created_at timestamptz not null default now()
);

create index idx_voucher_entries_voucher_id on public.voucher_entries(voucher_id);
create index idx_voucher_entries_ledger_account_id on public.voucher_entries(ledger_account_id);

-- ---------------------------------------------------------------------------
-- Billing audit log - who changed price/discount/status, when, and why.
-- ---------------------------------------------------------------------------
create table public.billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_label text, -- 'scheduled' for cron-triggered system actions
  entity_type text not null,   -- 'invoice' | 'invoice_line' | 'counselor_quotation' | 'appointment' | ...
  entity_id uuid not null,
  action text not null,        -- 'create' | 'update' | 'delete' | 'price_change' | 'discount_applied' | 'void'
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_billing_audit_entity on public.billing_audit_log(entity_type, entity_id);
create index idx_billing_audit_actor on public.billing_audit_log(actor_id);
create index idx_billing_audit_created_at on public.billing_audit_log(created_at);
