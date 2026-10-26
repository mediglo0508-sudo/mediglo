-- =============================================================================
-- 0002_customers_and_masters.sql
-- Customers (B2C only - no GSTIN/B2B fields, per the original ERP brief),
-- the GST Place-of-Supply lookup, services master (SAC-coded), and inventory.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GST state codes (India, 2-digit) - locked dropdown source, replaces free
-- text state/city entry so Place-of-Supply always matches GSTR-1 Table 7.
-- ---------------------------------------------------------------------------
create table public.gst_state_codes (
  code text primary key,        -- '07'
  name text not null unique     -- 'Delhi'
);

insert into public.gst_state_codes (code, name) values
  ('01','Jammu and Kashmir'),('02','Himachal Pradesh'),('03','Punjab'),
  ('04','Chandigarh'),('05','Uttarakhand'),('06','Haryana'),('07','Delhi'),
  ('08','Rajasthan'),('09','Uttar Pradesh'),('10','Bihar'),('11','Sikkim'),
  ('12','Arunachal Pradesh'),('13','Nagaland'),('14','Manipur'),('15','Mizoram'),
  ('16','Tripura'),('17','Meghalaya'),('18','Assam'),('19','West Bengal'),
  ('20','Jharkhand'),('21','Odisha'),('22','Chhattisgarh'),('23','Madhya Pradesh'),
  ('24','Gujarat'),('26','Dadra and Nagar Haveli and Daman and Diu'),
  ('27','Maharashtra'),('29','Karnataka'),('30','Goa'),('31','Lakshadweep'),
  ('32','Kerala'),('33','Tamil Nadu'),('34','Puducherry'),('35','Andaman and Nicobar Islands'),
  ('36','Telangana'),('37','Andhra Pradesh'),('38','Ladakh'),('97','Other Territory');

-- ---------------------------------------------------------------------------
-- Customers - pure B2C profile
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  gender text check (gender in ('male','female','other') or gender is null),
  age int check (age is null or (age >= 0 and age <= 120)),
  dob date,
  address text,
  city text,
  state_code text references public.gst_state_codes(code),
  referral_source text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_phone on public.customers(phone);
create index idx_customers_name_trgm on public.customers using gin (name gin_trgm_ops);
create unique index idx_customers_phone_unique on public.customers(phone) where phone is not null and phone <> '';

create trigger set_updated_at_customers before update on public.customers
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Services master - seeded from MediGlo_Services_SAC_Master_List, flat 5% GST
-- ---------------------------------------------------------------------------
create table public.services_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,               -- e.g. 'Laser Hair Removal', 'Medi Facials', 'IV Drips'
  sac_code text,                -- e.g. '999313'
  default_price numeric(10,2) not null default 0,
  gst_rate numeric(5,2) not null default 5.00,  -- flat 5%, module 4 override
  default_sessions int default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_services_master_active on public.services_master(active);

create trigger set_updated_at_services before update on public.services_master
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory - product stock master (skincare, injectables, consumables)
-- ---------------------------------------------------------------------------
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,                -- 'skincare_topical' | 'injectable_consumable' | ...
  sku text,
  is_service boolean not null default false, -- false = physical product
  unit text not null default 'unit',
  stock_qty numeric(10,2) not null default 0,
  reorder_level numeric(10,2) not null default 5,
  cost_price numeric(10,2) not null default 0,
  sale_price numeric(10,2) not null default 0,
  gst_rate numeric(5,2) not null default 5.00,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inventory_active on public.inventory(active);
create index idx_inventory_name_trgm on public.inventory using gin (name gin_trgm_ops);

create trigger set_updated_at_inventory before update on public.inventory
  for each row execute function app_private.set_updated_at();

-- Cost-tracking ledger - one row per stock movement (purchase, sale, adjustment)
create table public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase','sale','adjustment','return','write_off')),
  quantity numeric(10,2) not null,     -- positive = stock in, negative = stock out
  unit_cost numeric(10,2),
  reference_type text,                 -- 'invoice_line' | 'voucher' | 'manual'
  reference_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_inventory_ledger_inventory_id on public.inventory_ledger(inventory_id);
create index idx_inventory_ledger_reference on public.inventory_ledger(reference_type, reference_id);
