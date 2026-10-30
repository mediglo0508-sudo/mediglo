-- =============================================================================
-- 0006_expenses_staff_analytics.sql
-- Indirect expense tracker (Module 17), staff performance/incentive tracking
-- (Module 16), and the per-service net profitability analytics engine
-- (Module 18): revenue minus direct product cost minus an allocated share of
-- overhead.
-- =============================================================================

create table public.indirect_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,         -- 'rent' | 'electricity' | 'cleaning_supplies' | 'machine_maintenance' | 'salary_advance' | 'reimbursement' | 'other'
  description text,
  amount numeric(10,2) not null,
  paid_to text,                    -- e.g. 'Vikas Sir', 'Gourav Sir', vendor name
  payment_mode public.payment_mode not null default 'cash',
  expense_date date not null default current_date,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_indirect_expenses_date on public.indirect_expenses(expense_date);
create index idx_indirect_expenses_category on public.indirect_expenses(category);

create trigger set_updated_at_indirect_expenses before update on public.indirect_expenses
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff allocation & performance - who was assigned to a sale/treatment row,
-- rolled up into a leaderboard the admin dashboard can render.
-- ---------------------------------------------------------------------------
create table public.staff_incentive_rules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid references public.services_master(id),
  incentive_percent numeric(5,2) not null default 0,
  incentive_flat numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_staff_incentive_rules_staff_id on public.staff_incentive_rules(staff_id);

-- A materialized-friendly view (not an actual MATERIALIZED VIEW so it never
-- goes stale) aggregating invoice_lines by the staff_id assigned on each line.
--
-- security_invoker = true is not optional here. Found during this build's
-- verification pass: a plain Postgres view runs with its OWNER's table
-- privileges by default (the migration role, which owns and therefore
-- bypasses RLS on invoices/invoice_lines) - so WITHOUT this option, any
-- authenticated user of ANY role (a doctor, explicitly meant to be
-- "completely blocked from viewing total revenue or net profits" per the
-- original brief) could read full staff revenue/incentive figures straight
-- through this view via the REST API, even though `invoices_select` and
-- `invoice_lines_select` correctly block them from the base tables. Verified
-- with a local test harness: without security_invoker, a doctor querying
-- this view saw another staff member's revenue; with it, they correctly get
-- zero rows. Same fix applied to service_profitability_view below and to
-- appointment_details_view in 0003.
create or replace view public.staff_performance_view
  with (security_invoker = true) as
select
  il.staff_id,
  sp.full_name as staff_name,
  date_trunc('month', i.created_at) as month,
  count(distinct i.id) as invoice_count,
  sum(il.line_amount) filter (where il.line_status = 'active') as revenue_generated,
  sum(
    coalesce(sir.incentive_flat, 0)
    + (il.line_amount * coalesce(sir.incentive_percent, 0) / 100.0)
  ) filter (where il.line_status = 'active') as incentive_earned
from public.invoice_lines il
join public.invoices i on i.id = il.invoice_id
left join public.staff_profiles sp on sp.user_id = il.staff_id
left join public.staff_incentive_rules sir
  on sir.staff_id = il.staff_id
  and (sir.service_id = il.service_id or sir.service_id is null)
  and sir.active
where il.staff_id is not null
group by il.staff_id, sp.full_name, date_trunc('month', i.created_at);

-- ---------------------------------------------------------------------------
-- Per-service net profitability:
--   revenue (active invoice lines for that service)
--   - direct product cost consumed for that treatment (inventory_ledger 'sale' rows tied to the same invoice)
--   - an even share of the period's indirect_expenses, split across all services sold that period
-- ---------------------------------------------------------------------------
create or replace view public.service_profitability_view
  with (security_invoker = true) as
with revenue as (
  select
    il.service_id,
    coalesce(s.name, il.name) as service_name,
    date_trunc('month', i.created_at) as month,
    sum(il.line_amount) as gross_revenue,
    count(*) as line_count
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  left join public.services_master s on s.id = il.service_id
  where il.item_type = 'service' and il.line_status = 'active'
  group by il.service_id, coalesce(s.name, il.name), date_trunc('month', i.created_at)
),
direct_cost as (
  select
    il.service_id,
    date_trunc('month', i.created_at) as month,
    sum(coalesce(ledg.unit_cost, 0) * abs(ledg.quantity)) as product_cost
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  join public.inventory_ledger ledg
    on ledg.reference_type = 'invoice_line' and ledg.reference_id = il.id
  where il.line_status = 'active'
  group by il.service_id, date_trunc('month', i.created_at)
),
monthly_overhead as (
  select date_trunc('month', expense_date) as month, sum(amount) as total_overhead
  from public.indirect_expenses
  group by date_trunc('month', expense_date)
),
monthly_service_count as (
  select month, count(*) as service_count from revenue group by month
)
select
  r.service_id,
  r.service_name,
  r.month,
  r.gross_revenue,
  coalesce(dc.product_cost, 0) as product_cost,
  coalesce(
    mo.total_overhead / nullif(msc.service_count, 0),
    0
  ) as allocated_overhead,
  r.gross_revenue
    - coalesce(dc.product_cost, 0)
    - coalesce(mo.total_overhead / nullif(msc.service_count, 0), 0)
    as net_profit
from revenue r
left join direct_cost dc on dc.service_id = r.service_id and dc.month = r.month
left join monthly_overhead mo on mo.month = r.month
left join monthly_service_count msc on msc.month = r.month
order by r.month desc, net_profit desc;
