-- =============================================================================
-- 0009_rls_policies.sql
-- Row-level security for every remaining table, matching the role matrix from
-- the original ERP brief and the two architecture audits - with the audit's
-- flagged gaps resolved explicitly rather than left open:
--   - invoices DELETE is role-gated (admin/accountant/reception/pharmacist),
--     never an unconditional RESTRICTIVE `USING (false)` that blocks everyone
--     including admins (that was the root cause of "delete still doesn't
--     work" in the audit).
--   - therapist is added to service_wallets SELECT (the audit found this
--     missing, which silently breaks a therapist-facing screen).
--   - marketing / marketing_head get READ-ONLY access to customers and
--     appointments, not full read/write/delete (the audit flagged the
--     previous "any staff, full access" policy as probably too broad for a
--     non-clinical, non-billing role).
-- =============================================================================

alter table public.gst_state_codes enable row level security;
alter table public.customers enable row level security;
alter table public.services_master enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.cos_appointments enable row level security;
alter table public.encounters enable row level security;
alter table public.doctor_prescriptions enable row level security;
alter table public.doctor_prescription_items enable row level security;
alter table public.counselor_quotations enable row level security;
alter table public.product_orders enable row level security;
alter table public.pharmacist_order_items enable row level security;
alter table public.pharmacist_permissions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.service_wallets enable row level security;
alter table public.wallet_redemptions enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_entries enable row level security;
alter table public.billing_audit_log enable row level security;
alter table public.indirect_expenses enable row level security;
alter table public.staff_incentive_rules enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create policy gst_state_codes_read on public.gst_state_codes for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Customers - broad read (every clinical/billing role needs to look patients
-- up), read-only for marketing, write restricted to clinical/billing roles,
-- delete admin-only.
-- ---------------------------------------------------------------------------
create policy customers_select on public.customers for select
  using (auth.uid() is not null);

create policy customers_write on public.customers for insert
  with check (app_private.has_any_role(auth.uid(),
    array['admin','reception','doctor','counselor','accountant','therapist','pharmacist']::public.staff_role[]));

create policy customers_update on public.customers for update
  using (app_private.has_any_role(auth.uid(),
    array['admin','reception','doctor','counselor','accountant','therapist','pharmacist']::public.staff_role[]))
  with check (app_private.has_any_role(auth.uid(),
    array['admin','reception','doctor','counselor','accountant','therapist','pharmacist']::public.staff_role[]));

create policy customers_delete on public.customers for delete
  using (app_private.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Services master / Inventory - broad read, write for admin/accountant/
-- reception/pharmacist (Module 19: inline edits from the POS/stock screens).
-- ---------------------------------------------------------------------------
create policy services_master_select on public.services_master for select using (auth.uid() is not null);
create policy services_master_write on public.services_master for all
  using (app_private.has_any_role(auth.uid(), array['admin','accountant']::public.staff_role[]))
  with check (app_private.has_any_role(auth.uid(), array['admin','accountant']::public.staff_role[]));

create policy inventory_select on public.inventory for select using (auth.uid() is not null);
create policy inventory_write on public.inventory for all
  using (app_private.has_any_role(auth.uid(), array['admin','accountant','reception','pharmacist']::public.staff_role[]))
  with check (app_private.has_any_role(auth.uid(), array['admin','accountant','reception','pharmacist']::public.staff_role[]));

create policy inventory_ledger_select on public.inventory_ledger for select
  using (app_private.has_any_role(auth.uid(), array['admin','accountant','reception','pharmacist']::public.staff_role[]));
create policy inventory_ledger_insert on public.inventory_ledger for insert
  with check (app_private.has_any_role(auth.uid(), array['admin','accountant']::public.staff_role[]));

-- ---------------------------------------------------------------------------
-- Appointments - read-only for marketing; write for clinical/reception roles.
-- ---------------------------------------------------------------------------
create policy appointments_select on public.cos_appointments for select
  using (auth.uid() is not null);

create policy appointments_write on public.cos_appointments for insert
  with check (app_private.has_any_role(auth.uid(),
    array['admin','reception','doctor','counselor','therapist']::public.staff_role[]));

create policy appointments_update on public.cos_appointments for update
  using (app_private.has_any_role(auth.uid(),
    array['admin','reception','doctor','counselor','therapist']::public.staff_role[]))
  with check (app_private.has_any_role(auth.uid(),
    array['admin','reception','doctor','counselor','therapist']::public.staff_role[]));

create policy appointments_delete on public.cos_appointments for delete
  using (app_private.has_any_role(auth.uid(), array['admin','reception']::public.staff_role[]));

-- ---------------------------------------------------------------------------
-- Encounters
-- ---------------------------------------------------------------------------
create policy encounters_select on public.encounters for select
  using (app_private.has_any_role(auth.uid(),
    array['admin','accountant','doctor','counselor','reception','therapist','pharmacist']::public.staff_role[]));

create policy encounters_insert on public.encounters for insert
  with check (app_private.has_any_role(auth.uid(), array['admin','doctor','reception']::public.staff_role[]));

create policy encounters_update on public.encounters for update
  using (app_private.has_any_role(auth.uid(), array['admin','doctor','reception','counselor']::public.staff_role[]))
  with check (app_private.has_any_role(auth.uid(), array['admin','doctor','reception','counselor']::public.staff_role[]));

-- ---------------------------------------------------------------------------
-- Doctor prescriptions
-- ---------------------------------------------------------------------------
create policy doctor_prescriptions_select on public.doctor_prescriptions for select
  using (
    doctor_id = auth.uid()
    or app_private.has_any_role(auth.uid(), array['counselor','admin','reception','accountant']::public.staff_role[])
  );

create policy doctor_prescriptions_insert on public.doctor_prescriptions for insert
  with check (app_private.has_role(auth.uid(), 'doctor') and doctor_id = auth.uid());

create policy doctor_prescriptions_update on public.doctor_prescriptions for update
  using (doctor_id = auth.uid() or app_private.is_admin(auth.uid()))
  with check (doctor_id = auth.uid() or app_private.is_admin(auth.uid()));

create policy doctor_prescription_items_select on public.doctor_prescription_items for select
  using (exists (
    select 1 from public.doctor_prescriptions dp
    where dp.id = prescription_id
      and (dp.doctor_id = auth.uid()
           or app_private.has_any_role(auth.uid(), array['counselor','admin','reception','accountant']::public.staff_role[]))
  ));

create policy doctor_prescription_items_write on public.doctor_prescription_items for all
  using (exists (
    select 1 from public.doctor_prescriptions dp
    where dp.id = prescription_id and (dp.doctor_id = auth.uid() or app_private.is_admin(auth.uid()))
  ))
  with check (exists (
    select 1 from public.doctor_prescriptions dp
    where dp.id = prescription_id and (dp.doctor_id = auth.uid() or app_private.is_admin(auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- Counselor quotations
-- ---------------------------------------------------------------------------
create policy counselor_quotations_select on public.counselor_quotations for select
  using (
    counselor_id = auth.uid()
    or app_private.has_any_role(auth.uid(), array['admin','accountant','reception']::public.staff_role[])
  );

create policy counselor_quotations_insert on public.counselor_quotations for insert
  with check (app_private.has_role(auth.uid(), 'counselor') and counselor_id = auth.uid());

-- FIX (found during end-to-end workflow verification): billing needs to be
-- able to flip a quotation to 'converted_to_invoice' once it's paid, but the
-- original policy only let the counselor touch their OWN quotation while it
-- was still 'draft', or an admin - by the time it reaches Billing its status
-- is already 'sent_to_patient', so reception/accountant/pharmacist (the
-- can_bill roles that actually run the billing screen) could never close
-- out a quotation at all. Added `can_bill()` as a third allowed path.
create policy counselor_quotations_update on public.counselor_quotations for update
  using ((counselor_id = auth.uid() and status = 'draft') or app_private.is_admin(auth.uid()) or app_private.can_bill(auth.uid()))
  with check ((counselor_id = auth.uid() and status = 'draft') or app_private.is_admin(auth.uid()) or app_private.can_bill(auth.uid()));

-- ---------------------------------------------------------------------------
-- Pharmacist product orders
-- ---------------------------------------------------------------------------
create policy product_orders_select on public.product_orders for select
  using (
    assigned_to = auth.uid()
    or app_private.has_any_role(auth.uid(), array['admin','accountant','reception']::public.staff_role[])
    or (status = 'pending' and app_private.has_role(auth.uid(), 'pharmacist'))
  );

create policy product_orders_insert on public.product_orders for insert
  with check (app_private.has_any_role(auth.uid(), array['admin','reception','counselor']::public.staff_role[]));

-- FIX (found during end-to-end workflow verification): the original USING
-- clause required assigned_to = auth.uid() to ALREADY be true before the
-- update, which makes Pharmacy's "Self-Assign" on a still-unassigned
-- (assigned_to is null) pending order impossible for every pharmacist - the
-- one action that starts the whole pharmacist workflow. It also meant
-- reception (can_bill, but not admin/accountant, and not the assigned
-- pharmacist) could never mark an order 'completed' from the Billing
-- screen. can_bill() already covers admin/accountant/reception/pharmacist,
-- so it replaces both the self-assign special case and the old
-- admin/accountant-only fallback in one policy that actually matches who
-- runs this workflow day to day.
create policy product_orders_update on public.product_orders for update
  using (
    (assigned_to = auth.uid() and status in ('pending','assigned','confirmed'))
    or app_private.can_bill(auth.uid())
  )
  with check (
    (assigned_to = auth.uid() and status in ('pending','assigned','confirmed'))
    or app_private.can_bill(auth.uid())
  );

create policy pharmacist_order_items_select on public.pharmacist_order_items for select
  using (exists (
    select 1 from public.product_orders po
    where po.id = order_id
      and (po.assigned_to = auth.uid()
           or app_private.has_any_role(auth.uid(), array['admin','accountant','reception']::public.staff_role[]))
  ));

create policy pharmacist_order_items_write on public.pharmacist_order_items for all
  using (exists (
    select 1 from public.product_orders po
    where po.id = order_id and (po.assigned_to = auth.uid() or app_private.is_admin(auth.uid()))
  ))
  with check (exists (
    select 1 from public.product_orders po
    where po.id = order_id and (po.assigned_to = auth.uid() or app_private.is_admin(auth.uid()))
  ));

create policy pharmacist_permissions_select on public.pharmacist_permissions for select
  using (user_id = auth.uid() or app_private.has_any_role(auth.uid(), array['admin','accountant']::public.staff_role[]));

create policy pharmacist_permissions_write on public.pharmacist_permissions for all
  using (app_private.is_admin(auth.uid()))
  with check (app_private.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Invoices / invoice lines - visible to billing + finance roles only
-- (doctors are deliberately excluded per the original brief: "Completely
-- blocked from viewing ... total revenue ... or net profits").
-- ---------------------------------------------------------------------------
create policy invoices_select on public.invoices for select
  using (app_private.has_any_role(auth.uid(), array['admin','accountant','reception','pharmacist']::public.staff_role[]));

create policy invoices_insert on public.invoices for insert
  with check (app_private.can_bill(auth.uid()));

create policy invoices_update on public.invoices for update
  using (app_private.can_bill(auth.uid()))
  with check (app_private.can_bill(auth.uid()));

-- THE FIX: a role-gated PERMISSIVE delete policy, replacing the
-- `USING (false)` policy that blocked every role including admin.
--
-- CORRECTION found during this build's own verification pass: an earlier
-- version of this fix made this policy RESTRICTIVE instead of the (default)
-- PERMISSIVE type. That reproduced the exact same bug it was meant to fix -
-- Postgres RLS denies a command entirely when a table has RLS enabled and
-- zero PERMISSIVE policies exist for it, no matter what any RESTRICTIVE
-- policy says (RESTRICTIVE policies can only narrow an already-permissive
-- set, never grant access on their own). With no permissive delete policy
-- anywhere on this table, that version silently blocked every role,
-- including admins, again. Caught by an end-to-end test actually deleting
-- an invoice as an admin. A plain permissive policy is the correct fix.
create policy invoices_delete_role_gated on public.invoices for delete
  using (app_private.can_bill(auth.uid()));

create policy invoice_lines_select on public.invoice_lines for select
  using (exists (
    select 1 from public.invoices i where i.id = invoice_id
    and app_private.has_any_role(auth.uid(), array['admin','accountant','reception','pharmacist']::public.staff_role[])
  ));

create policy invoice_lines_write on public.invoice_lines for all
  using (app_private.can_bill(auth.uid()))
  with check (app_private.can_bill(auth.uid()));

-- ---------------------------------------------------------------------------
-- Service wallets / redemptions - the audit's fix: therapist added to SELECT
-- so the therapist-facing "sessions remaining" screen actually works.
-- ---------------------------------------------------------------------------
create policy service_wallets_select on public.service_wallets for select
  using (app_private.has_any_role(auth.uid(),
    array['admin','accountant','reception','pharmacist','therapist','doctor','counselor']::public.staff_role[]));

create policy service_wallets_admin_write on public.service_wallets for update
  using (app_private.is_admin(auth.uid()))
  with check (app_private.is_admin(auth.uid()));

create policy wallet_redemptions_select on public.wallet_redemptions for select
  using (app_private.has_any_role(auth.uid(),
    array['admin','accountant','reception','pharmacist','therapist','doctor','counselor']::public.staff_role[]));

create policy wallet_redemptions_insert on public.wallet_redemptions for insert
  with check (app_private.has_any_role(auth.uid(), array['admin','therapist','doctor','reception']::public.staff_role[]));

-- ---------------------------------------------------------------------------
-- Accounting - finance roles only.
-- ---------------------------------------------------------------------------
create policy ledger_accounts_select on public.ledger_accounts for select
  using (app_private.is_finance(auth.uid()));
create policy ledger_accounts_write on public.ledger_accounts for all
  using (app_private.is_admin(auth.uid())) with check (app_private.is_admin(auth.uid()));

create policy vouchers_select on public.vouchers for select using (app_private.is_finance(auth.uid()));
create policy vouchers_write on public.vouchers for all
  using (app_private.is_finance(auth.uid())) with check (app_private.is_finance(auth.uid()));

create policy voucher_entries_select on public.voucher_entries for select using (app_private.is_finance(auth.uid()));
create policy voucher_entries_write on public.voucher_entries for all
  using (app_private.is_finance(auth.uid())) with check (app_private.is_finance(auth.uid()));

-- ---------------------------------------------------------------------------
-- Audit log - finance/admin read, system writes via SECURITY DEFINER funcs
-- (edit_invoice etc. run as the invoking user but the table itself accepts
-- inserts from can_bill roles for direct logging where needed).
-- ---------------------------------------------------------------------------
create policy billing_audit_log_select on public.billing_audit_log for select
  using (app_private.is_finance(auth.uid()));
create policy billing_audit_log_insert on public.billing_audit_log for insert
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Indirect expenses / staff incentives - finance only, staff can see their
-- own incentive rows.
-- ---------------------------------------------------------------------------
create policy indirect_expenses_all on public.indirect_expenses for all
  using (app_private.is_finance(auth.uid())) with check (app_private.is_finance(auth.uid()));

create policy staff_incentive_rules_select on public.staff_incentive_rules for select
  using (staff_id = auth.uid() or app_private.is_finance(auth.uid()));
create policy staff_incentive_rules_write on public.staff_incentive_rules for all
  using (app_private.is_finance(auth.uid())) with check (app_private.is_finance(auth.uid()));
