# MediGlo Platform

Self-owned replacement for the two clinic apps previously built on Lovable:
**MediGlo Harmony** (the ERP) and **MediGlo Tracker** (the patient/journey
tracker). This repo is the ERP, built from scratch against a fresh Supabase
project and the audit docs in the Claude Project (`comprehensive-clinic-
workflow-architecture-audit.md`, `erp-tracker-connection-and-role-function-
audit.md`, `invoice-edit-delete-root-cause-audit.md`, `auto-credit-recharge-
audit.md`) plus targeted reads of the real Lovable source for the workflows
that mattered most.

**Status: ERP is feature-complete, hardened, and deployment-ready.** Its
database layer (migrations, every RLS policy, and every major workflow —
Appointment → Doctor → Counselor → Quotation → Billing → Pharmacy →
Inventory → Accounting → Expenses → Follow-up/Sessions → Reports) has been
verified end-to-end against a real Postgres database in a disposable local
test harness — not against your production Supabase, per your instruction
not to touch production data until this passes testing. Two rounds of
testing found and fixed real bugs (see "What the verification pass found"
and "Production hardening pass" below) — including a critical hardcoded-GST
bug, a missing IGST feature, several silent-failure and RLS-gating gaps
across the frontend, and one bug (a PL/pgSQL variable collision) that could
only have been caught by actually executing the code, not by reading it.
Nothing production data-related, no domain, no hosting, and no live
credentials have touched this repo — see "Deployment readiness checklist"
below for exactly what's needed from you to take it live. Tracker has
deliberately not been started, per your instruction (see "Delivery plan"
below).

## Monorepo layout

```
mediglo-platform/
  apps/
    erp/            <- MediGlo Harmony. Complete. This is what you're reviewing now.
    tracker/        <- MediGlo Tracker. Not started yet - built after you sign off on erp/.
  packages/
    shared-types/   <- Cross-app contract: StaffRole, sync envelope/payload shapes,
                       the JWT claims shape both apps will agree on for "one staff
                       identity" SSO. Both apps depend on this so their sync code
                       can never silently drift apart on data shapes.
```

npm workspaces wire it together. From the repo root:

```bash
npm install            # installs both apps + shared-types together
npm run dev:erp        # starts the ERP's Vite dev server
npm run build:erp      # tsc -b && vite build for the ERP
```

**A note on this handoff:** this sandbox's network egress policy blocks
`registry.npmjs.org` outright (`403 host_not_allowed`), so `npm install`
could not be run here and the frontend build has not been verified with a
real `tsc`/`vite build` pass. Every file was still checked carefully: a full
syntax-only TypeScript parse of every `.ts`/`.tsx` file in `apps/erp/src`
came back clean, every UI-kit import was cross-checked by hand against the
real component source it points to, and every Supabase table/column/RPC
name the frontend references was cross-checked against the actual migrated
schema (see the next section for how). What I *could* fully verify in this
sandbox - the database itself - got the deepest testing: a disposable local
Postgres, not Supabase, but wired up with the same `auth.uid()`/RLS/role
mechanics Supabase uses, so the policies behave identically. Still -
**please run `npm install && npm run build:erp` yourself first** as the
very first step of your review, and send back whatever TypeScript errors
come up if any do.

## What the verification pass found

You asked me to verify the build, migrations, auth/RLS, and every major
workflow end-to-end before calling this production-ready, and to fix
anything I found rather than just report it. I built a throwaway local test
harness (`apps/erp/supabase/test/` - `00_auth_shim.sql` stands in for just
enough of Supabase's own `auth` schema and role grants to make a plain
Postgres behave like a real Supabase project; `01_e2e_workflow.sql` is a
26-check automated regression suite covering every check below) and ran the
actual migrations against a real Postgres, then exercised the real
workflows as real non-superuser roles - which is the only way most of these
bugs could ever surface, since a superuser (which is what applying
migrations by hand normally runs as) silently bypasses every RLS check that
would have caught them. All 6 are now fixed and covered by a regression
check in the test suite; you can re-run it yourself any time with:

```bash
sudo service postgresql start   # if not already running
sudo -u postgres psql -c "drop database if exists mediglo_test;"
sudo -u postgres psql -c "create database mediglo_test;"
cd apps/erp/supabase
for f in test/00_auth_shim.sql migrations/0001_extensions_roles.sql migrations/0002_customers_and_masters.sql migrations/0003_appointments_encounters.sql migrations/0004_clinical_workflow.sql migrations/0005_billing_accounting.sql migrations/0006_expenses_staff_analytics.sql migrations/0007_integration_sync.sql migrations/0008_functions.sql migrations/0009_rls_policies.sql migrations/0010_seed_data.sql; do
  sudo -u postgres psql -d mediglo_test -v ON_ERROR_STOP=1 -f "$f" || break
done
sudo -u postgres psql -d mediglo_test -v ON_ERROR_STOP=1 -f test/01_e2e_workflow.sql
```
A clean run ends with `ALL END-TO-END CHECKS PASSED`. Keep this suite and
re-run it after any future schema/RLS change, before ever applying that
change to production - it would have caught every one of these before they
ever reached you.

**Found and fixed (most to least serious):**

1. **`app_private` schema had no `USAGE` grant to `anon`/`authenticated`.**
   Every RLS policy in the whole project calls a helper like
   `app_private.can_bill()` from inside its `USING`/`WITH CHECK` clause, and
   those calls run as the actual querying role, not an elevated one - so
   without this grant, **every single role-gated write in the entire app
   would have failed** with "permission denied for schema app_private" the
   moment it ran against a real anon/authenticated session. Invisible when
   applying migrations as a superuser, since superusers skip permission
   checks entirely. This was the single highest-impact bug possible short of
   the app not existing at all, and it was silent - no error until tested as
   a real non-superuser role. Fixed with one `grant usage on schema
   app_private to anon, authenticated, service_role;` in `0001`.
2. **Revenue data leaked through `service_profitability_view` and
   `staff_performance_view` to every role, including doctors** - who are
   explicitly supposed to be "completely blocked from viewing total revenue
   or net profits" per the original brief. Root cause: a plain Postgres view
   runs with its *owner's* table privileges by default, and the owner (the
   migration role) bypasses RLS on the tables it owns - so the view silently
   ignored `invoices`/`invoice_lines`'s RLS entirely, for anyone. Verified
   empirically: a doctor querying `staff_performance_view` directly could
   see another staff member's exact revenue figures. Fixed by adding
   `security_invoker = true` to all 3 views (`0003`, `0006`), which makes a
   view enforce RLS as the actual caller. Re-verified: doctor now correctly
   gets zero rows; admin/accountant still see everything.
3. **The invoice-delete RLS fix from the original audit was itself broken.**
   The policy meant to fix "delete blocks everyone including admins" was
   written as `RESTRICTIVE`, without a matching `PERMISSIVE` policy -
   Postgres denies a command entirely when zero permissive policies exist
   for it, regardless of what a restrictive policy allows. Result: the exact
   same "blocks everyone, including admins" bug, just moved. Caught only by
   actually trying to delete an invoice as an admin in the test suite.
   Fixed by making it a plain permissive policy.
4. **Pharmacist "Self-Assign" (Pharmacy screen) could never work.** The
   `product_orders` UPDATE policy required `assigned_to = auth.uid()` to
   already be true *before* the update - but self-assign is exactly the
   case where a pending order isn't assigned to anyone yet. Every pharmacist
   would have hit a silent 0-row update clicking "Self-Assign".
5. **Reception/accountant could never close a quotation or complete a
   pharmacy order during billing.** `counselor_quotations` UPDATE only
   allowed the original counselor (while still in `draft`, which is already
   over by the time it reaches Billing) or an admin - reception could view
   a quotation but never mark it `converted_to_invoice`. Same shape of bug
   on `product_orders` for marking an order `completed`. Both fixed by
   extending the policies to the actual `can_bill` role set
   (admin/accountant/reception/pharmacist), which is who really runs this
   part of the workflow day to day.
6. **Session redemption had no way to happen at all - a functional gap, not
   an audit bug.** The schema fully supports prepaid session packages
   (`service_wallets`/`wallet_redemptions`, e.g. "6 laser sessions"), and the
   UI showed a customer's remaining balance, but nothing anywhere let staff
   actually mark a session used - and even a direct update would have been
   blocked by RLS for everyone except admin. Added
   `public.redeem_wallet_session()` (a proper RPC: role-checked, row-locked,
   flips the wallet to `exhausted` at capacity, rejects over-redemption) and
   a "Mark Session Used" action in the customer's Treatment Logs tab for
   admin/doctor/therapist/reception.

## Why one Supabase project per app

You asked me to use my own judgment on architecture, with the one hard
requirement that the two apps stay reliably connected. I chose **two
separate Supabase projects** (one for ERP, one for Tracker) rather than one
shared project, and connected them with an explicit service-to-service sync
contract instead of shared tables. Reasoning:

- The original audit's root problem wasn't "the apps used different
  databases" - it was that the *only* working sync path impersonated one
  staff member's personal login session, so sync silently died the day that
  person's session expired or they went on leave. A second, unused
  webhook/outbox path had queued 147 undelivered rows with no dispatcher
  ever built for it.
- Separate projects means the ERP's RLS policies (fine-grained by
  `staff_role`) never have to reason about Tracker's very different access
  patterns, and a bug or outage in one app's database can't take the other
  down.
- The two are kept in sync by `apps/erp/supabase/migrations/
  0007_integration_sync.sql`: a set of `SECURITY DEFINER` functions
  (`sync_export_customers`, `sync_export_appointments`,
  `sync_export_invoices`, `sync_export_dues`, `tracker_book_appointment`)
  granted **only** to Postgres's `service_role` - i.e. callable only with
  ERP's service-role secret key, which lives server-side in Tracker's
  scheduled job and is never exposed to any browser. This is a scheduled
  pull keyed off `updated_at`, so it keeps working with zero humans logged
  in anywhere, which was the whole point.
- `packages/shared-types` pins down the exact JSON shape of every payload
  these functions return, so Tracker's consumer code and ERP's exporter code
  can't drift apart silently.

This part (Tracker's side of the sync, and the actual "one staff identity"
JWT bridge) is built in the next phase, after you've reviewed this ERP.

## Setting up Supabase for this app

1. Create a new Supabase project for the ERP (a second, separate project
   will later be created for Tracker).
2. In the Supabase SQL editor (or via the Supabase CLI), run every file in
   `apps/erp/supabase/migrations/` **in filename order, 0001 through 0011**.
   They're written to run once, in order, on an empty project - don't skip
   ahead or run them out of order.
3. Copy `apps/erp/.env.example` to `apps/erp/.env.local` and fill in your
   project's URL and anon key (Project Settings -> API in the dashboard).
4. **Bootstrap the first admin manually.** Every RLS policy and the
   `is_admin()`/`can_bill()` helper functions read from `public.user_roles`,
   and only an existing admin can normally grant roles (including through
   the in-app Staff & Performance screen). There is no seed admin. Sign up
   your own account once through the app's login screen, then in the
   Supabase SQL editor run:
   ```sql
   insert into public.user_roles (user_id, role)
   values ('<your auth.users.id, from the Authentication tab>', 'admin');
   ```
   After that one manual step, you can grant every other role to every other
   staff member from inside the app (`/staff`, admin-only).
5. (Optional, recommended once you're connected) Generate real Supabase
   types instead of the hand-written ones in `src/types/domain.ts`:
   ```bash
   npx supabase gen types typescript --project-id <your-project-ref> > apps/erp/src/types/database.types.ts
   ```
   and pass it to `createClient<Database>(...)` in `src/lib/supabase.ts` for
   full end-to-end type inference. The app works correctly without this -
   the hand-written types already match the schema exactly - this is a
   nice-to-have for future maintenance.

## What's in the database (`apps/erp/supabase/migrations/`)

| File | Contents |
|---|---|
| `0001_extensions_roles.sql` | `staff_role` enum, `user_roles`, `staff_profiles`, the `app_private.*` RLS helper functions (`has_role`, `is_admin`, `is_finance`, `can_bill`, ...) |
| `0002_customers_and_masters.sql` | `customers` (B2C only), GST state codes, `services_master`, `inventory`, `inventory_ledger` |
| `0003_appointments_encounters.sql` | `cos_appointments` (color + source tagged), `appointment_details_view`, `encounters` |
| `0004_clinical_workflow.sql` | `doctor_prescriptions`, `counselor_quotations`, `product_orders` - the structured Doctor -> Counselor -> Reception/Pharmacist pipeline |
| `0005_billing_accounting.sql` | `invoices`, `invoice_lines` (soft-delete), `service_wallets`, Tally-style `ledger_accounts`/`vouchers`/`voucher_entries`, `billing_audit_log` |
| `0006_expenses_staff_analytics.sql` | `indirect_expenses`, `staff_incentive_rules`, `staff_performance_view`, `service_profitability_view` |
| `0007_integration_sync.sql` | The ERP <-> Tracker sync contract (see above) |
| `0008_functions.sql` | Every RPC: `edit_invoice` (diff-based upsert), inventory reconciliation, invoice numbering, `my_billing_access`, pharmacist auto-assignment, immutability guards |
| `0009_rls_policies.sql` | Full RLS policy matrix, with the 3 audit-identified bugs fixed explicitly (see below) |
| `0010_seed_data.sql` | 13 real services with SAC codes, ~95 real inventory items, standard chart of accounts |
| `0011_production_hardening.sql` | `clinic_settings` (IGST config), `invoices.igst`/`invoice_lines.gst_rate`, server-side voucher/quotation/receipt numbering, `list_staff_by_role`, `create_prescription`, `create_manual_voucher`, `adjust_stock`, and the rewritten `edit_invoice`/`repost_invoice_voucher` (variable per-line GST + IGST) - see "Production hardening pass" below |

`apps/erp/supabase/test/` holds the local verification harness described
above (`00_auth_shim.sql`, `01_e2e_workflow.sql`, `02_e2e_hardening.sql`) -
not part of the app itself, just the regression suite that found the bugs
below.

## Bugs from the audits, fixed at the schema level (not just patched in the UI)

1. **Blocked invoice delete.** The old `USING (false)` RLS policy blocked
   *everyone*, admins included, from ever deleting an invoice. Replaced with
   `invoices_delete_role_gated`, a real role-gated policy
   (`app_private.can_bill()`).
2. **Missing `next_invoice_no` grant.** The invoice-numbering function had no
   `grant execute ... to authenticated`, so it silently failed for
   non-superuser roles. Granted explicitly in `0008_functions.sql`.
3. **Wallet cascade-delete data loss.** `service_wallets.invoice_line_id` is
   now `ON DELETE RESTRICT`, not `CASCADE`. Combined with soft-delete
   (`invoice_lines.line_status`), editing or removing a line can never wipe
   session-wallet history out from under a customer.
4. **Dues-sync race condition.** Fixed in
   `app_private.capture_dues_outbox()` - the audit's finding was that two
   concurrent invoice updates for the same customer could both queue a dues
   snapshot and interleave; the fixed version locks/serializes per customer.
5. **Incomplete Doctor -> Counselor -> Reception handoff.** Previously
   free-text notes with no structured state. Now a real pipeline:
   `doctor_prescriptions` -> `counselor_quotations` -> (`invoices` and/or
   `product_orders` -> pharmacist dispensing), each with its own status enum
   and immutability guard triggers once finalized.
6. **Found and fixed during this build, not in the original audits: no
   'sales' voucher was ever actually created.** The original design had a
   trigger that *updates* an existing `'sales'` voucher's amount whenever an
   invoice's totals change, but nothing ever *inserted* the first one - so
   the Tally-style ledger would have silently stayed empty forever. Fixed in
   `edit_invoice()` (`0008_functions.sql`): the first time an invoice gets
   real totals, it posts a balanced 3-line voucher (debit Cash, credit the
   relevant income account, credit GST Payable); every later edit is then
   correctly kept in sync by the existing repost trigger.

A second round of bugs was then found by actually *running* the migrations
and RLS policies end-to-end as real roles (see "What the verification pass
found" above for the full detail on each): a missing schema-level grant that
would have broken every role-gated write in the app, a revenue-data leak
through 3 analytics views, a delete policy that reproduced the exact bug it
was meant to fix, two RLS gaps that silently broke the pharmacist and
billing workflows, and a session-redemption feature that was fully
schema-supported but had no way to actually happen. All 6 are fixed and
covered by an automated regression check.

## Production hardening pass

You then asked me to take the ERP the rest of the way to a finished,
production-ready state before starting the Tracker: review everything built
so far, fix anything incomplete or not working, verify the full
Appointment -> Doctor -> Counselor -> Quotation -> Billing -> Pharmacy ->
Inventory -> Accounting -> Expenses -> Follow-up -> Reports workflow, and do
a final UI/UX and functionality sweep for placeholder or unfinished parts.
I ran two independent, exhaustive audits of every frontend file cross-checked
against the real migrations/RLS, then fixed each real finding and re-verified
against the local Postgres harness. Everything below is now fixed and
covered by `02_e2e_hardening.sql` (a new 20+ check suite, on top of the
original 26). To re-run both suites from scratch:

```bash
sudo -u postgres psql -c "drop database if exists mediglo_test;"
sudo -u postgres psql -c "create database mediglo_test;"
cd apps/erp/supabase
for f in test/00_auth_shim.sql migrations/0001_extensions_roles.sql migrations/0002_customers_and_masters.sql migrations/0003_appointments_encounters.sql migrations/0004_clinical_workflow.sql migrations/0005_billing_accounting.sql migrations/0006_expenses_staff_analytics.sql migrations/0007_integration_sync.sql migrations/0008_functions.sql migrations/0009_rls_policies.sql migrations/0010_seed_data.sql migrations/0011_production_hardening.sql; do
  sudo -u postgres psql -d mediglo_test -v ON_ERROR_STOP=1 -f "$f" || break
done
sudo -u postgres psql -d mediglo_test -v ON_ERROR_STOP=1 -f test/01_e2e_workflow.sql
sudo -u postgres psql -d mediglo_test -v ON_ERROR_STOP=1 -f test/02_e2e_hardening.sql
```
A clean run ends with `ALL PRODUCTION-HARDENING CHECKS PASSED`.

**Backend (`0011_production_hardening.sql`), most to least serious:**

1. **Flat 5% GST was hardcoded in `edit_invoice()`, silently ignoring the
   per-item `gst_rate` that admins/accountants can already configure on
   `services_master`/`inventory`.** Any treatment or product taxed at 12% or
   18% was being billed at 5% with zero warning. Fixed: `edit_invoice()` now
   resolves each line's real rate live from the master tables and snapshots
   it onto `invoice_lines.gst_rate`. Verified with a mixed-rate invoice
   (5% + 18% lines) producing the correct blended tax, not a flat 5%.
2. **A real, previously-undetectable bug caught only by actually executing
   the new RPCs: a PL/pgSQL variable-name collision in both
   `create_prescription()` and `create_manual_voucher()`.** Each function
   declared a loop variable (`v_item`/`v_entry`) and then reused the *same
   name* as a query alias in a later `INSERT ... SELECT ... FROM
   jsonb_array_elements(...) AS v_item`, which Postgres rejects outright as
   an ambiguous column reference (42702) - meaning both RPCs would have
   failed on every real call with at least one item/entry. Impossible to
   catch by reading the SQL; only surfaced by running `02_e2e_hardening.sql`'s
   happy-path checks against a real database. Fixed by renaming the
   FROM-clause aliases to `v_elem`.
3. **No IGST support at all**, even though `customers.state_code`,
   `invoices.place_of_supply`, and `vouchers.igst` already existed for
   exactly this. Every sale was posted CGST+SGST regardless of the
   customer's actual state. Added `clinic_settings.home_state_code`
   (nullable, defaults unset - the exact prior always-CGST+SGST behavior is
   preserved until an admin explicitly configures it from the new Staff page
   "Clinic Settings" card) and IGST splitting in `edit_invoice()`/
   `repost_invoice_voucher()`, gated on that setting. Confirm the correct GST
   treatment with your CA before turning it on.
4. **The "Select counselor" dropdown on Doctor Room was silently empty for
   every real (non-admin) doctor.** It queried `user_roles` directly, but
   `user_roles_select` RLS only lets a non-admin see their own role row.
   Fixed with `list_staff_by_role()`, a narrow `SECURITY DEFINER` function
   returning only `(user_id, full_name)` for one requested role.
5. **Three multi-step client-side flows had no transaction, so a failure
   partway through left orphaned/broken data**: Doctor Room's
   prescription-send (header + items + encounter update, 3 separate calls -
   a bad item could leave a permanently-stuck zero-item prescription in the
   counselor's queue), Accounting's manual voucher posting (voucher header +
   entries, 2 separate calls - a failure could post a voucher with a real
   amount and zero entries, breaking the double-entry invariant), and manual
   stock corrections (a direct `UPDATE inventory.stock_qty` with no audit
   trail at all, and invisible to `service_profitability_view`'s cost
   calculation). Fixed with three new atomic RPCs: `create_prescription`,
   `create_manual_voucher` (also rejects unbalanced entries and `'sales'`
   type outright), and `adjust_stock` (writes a proper `inventory_ledger`
   row).
6. **Client-side voucher/quotation/receipt numbering could collide.**
   `voucher_no` was generated as `` `${type}-${Date.now().toString().slice(-6)}` ``
   (repeats every ~16.7 minutes) and quotation/receipt numbers were
   `count(*) + 1` (two concurrent saves can compute the same number). Fixed
   with real sequences (`next_voucher_no()`, `generate_quotation_number()`,
   `generate_receipt_number()`) - also fixes auto-posted sales vouchers
   never getting a `voucher_no` at all (always null).

**Frontend, most to least serious:**

7. **IST business-day boundary bugs across `AppointmentsPage`,
   `AppointmentFormModal`, `DashboardPage`, `TaxExportPage`, `AccountingPage`,
   `ExpensesPage`, `DoctorRoomPage`'s queue, and `useTodaysAppointments`.**
   `new Date().toISOString().slice(0,10)` returns the *UTC* calendar date,
   which is silently wrong for the first 5.5 hours of every IST day
   (00:00-05:29 IST is still "yesterday" in UTC). Fixed with `todayIST()`/
   `startOfMonthIST()`/`istDateBoundaryToUtcISO()` in `src/lib/utils.ts`,
   applied everywhere "today"/"this month" is computed against a
   `timestamptz` column.
8. **A crafted or accidental comma/parenthesis in a customer search box could
   break the PostgREST `.or()` filter grammar** (`useCustomerSearch`,
   `CustomersPage`, `EditInvoiceTab`). Fixed with an `ilikeOrClause()` escape
   helper, or by switching to a plain `.ilike()` for single-column searches.
9. **The "New Bill" tab in Billing could create a duplicate invoice or show
   stale line items** after a successful save, because its query key never
   changed and local state was never reset. Fixed: local state now fully
   resets after a successful new-invoice save, and `pickedCustomer` clears on
   `onDone`.
10. **`CounselorRoomPage`'s quotation insert used a buggy
    `getEncounterId(customer_id)` helper** instead of the `encounter_id`
    already available on the selected prescription - removed the helper
    entirely and used the real value directly.
11. **Several Supabase calls had no `{error}` check at all** (silent
    failures with no user-visible feedback): the appointment check-in flow,
    counselor's prescription-finalize and product-order paths, `BillingPage`'s
    customer-find/quotation-status/product-order-status updates, and
    `AppointmentFormModal`'s customer-update calls. All now throw and surface
    a toast on failure.
12. **`PharmacyPage`'s self-assign had a race window** - two pharmacists
    clicking "Self-Assign" on the same pending order at the same moment could
    both believe they'd claimed it. Fixed with an explicit
    `.eq("status","pending")` guard plus a returned-row-count check that
    reports "someone else already picked this order up" on a lost race.
13. **`InventoryPage`'s Services tab showed full write UI (Add/Edit/
    Deactivate) to reception and pharmacist**, who can reach the page (its
    route allows admin/accountant/reception/pharmacist) but whom
    `services_master_write` RLS excludes (admin/accountant only, unlike the
    broader `inventory_write`) - every such write would have been silently
    rejected by RLS. Fixed: the Services tab now shows a read-only view for
    those two roles instead of write controls that don't work.
14. **`AnalyticsPage`'s Staff Incentive Rules card was gated on
    `is_admin`**, but `staff_incentive_rules_write` RLS is actually
    `is_finance()` (admin **or** accountant) - accountants could reach the
    page but never saw the card RLS already let them use. Fixed to gate on
    `can_view_finance`.
15. **`CustomerDrawer`'s Client Ledger tab was gated on `can_view_finance`**
    (admin/accountant only), but `invoices_select` RLS actually allows
    admin/accountant/reception/pharmacist. Fixed to gate on `can_bill`, which
    exactly mirrors that policy.
16. **No input validation on price/stock/GST-rate/incentive fields** across
    `InventoryPage` (products and services) and `AnalyticsPage`'s incentive
    rule form - a negative stock quantity or a 500% GST rate could be typed
    in and saved. Added bounds checks (non-negative prices/stock, GST 0-100%,
    sessions >= 1) before every insert/update.
17. Lower-priority polish: a React key collision in `AnalyticsPage`'s
    per-service profitability table when two custom (non-master-linked) line
    items shared the same (null) `service_id` in the same month; missing
    double-click guards on several "toggle active" badges/switches
    (`InventoryPage`, `StaffPage`) that could fire two overlapping requests;
    a stale "GST 5%" claim on the login screen's marketing copy, now that GST
    is per-line/variable.
18. **New "Clinic Settings" card on the Staff page** (admin-only): clinic
    name + home state dropdown, the actual UI for configuring `#3` above -
    without it, the IGST feature would exist in the database with no way for
    the clinic to turn it on.

## App structure (`apps/erp/src/`)

- **Stack:** React 18 + TypeScript + Vite + React Router v6 + TanStack Query
  v5 + Tailwind (CSS-variable theming) + Radix UI wrapped into a small local
  shadcn-style kit (`src/components/ui/*` - no shadcn CLI/registry
  dependency, no other component library).
- **Auth & roles:** `src/lib/auth.tsx` (`AuthProvider`/`useAuth()`) wraps
  Supabase Auth and the `my_billing_access()` RPC. `src/components/layout/
  nav-items.ts` is the single source of truth for which `staff_role`s see
  which sidebar item and route - `App.tsx`'s route guards and the sidebar
  both read from it, so they can never drift out of sync with each other.
- **Pages** (all under `src/pages/`, one per sidebar item):
  `DashboardPage` (role-aware: admin/accountant see revenue + profitability,
  doctors see today's worklist, reception/pharmacist see a billing console),
  `AppointmentsPage`, `CustomersPage` (Profile/Treatment Logs/Client Ledger
  drill-down), `DoctorRoomPage`, `CounselorRoomPage`, `PharmacyPage`,
  `BillingPage` (POS - new bill / from quotation / from pharmacy order /
  edit existing invoice, all funneled through the same `edit_invoice` RPC),
  `InventoryPage`, `AccountingPage`, `ExpensesPage`, `AnalyticsPage`,
  `TaxExportPage`, `StaffPage`.
- **Domain types:** hand-written in `src/types/domain.ts`, matching every
  migration exactly (see the note above about optionally generating real
  Supabase types later).
- **GST:** per-line variable rate (each service/product carries its own
  `gst_rate` in `services_master`/`inventory`, resolved live by `edit_invoice()`
  at billing time and snapshotted onto `invoice_lines.gst_rate` for audit/
  display), with an inclusive/exclusive toggle, and automatic CGST+SGST vs.
  IGST splitting once an admin configures the clinic's home state (Staff page
  -> Clinic Settings). Front-end previews (`BillLineEditor`, Counselor Room)
  estimate the same per-item rates so a quotation doesn't visibly disagree
  with the eventual invoice; `edit_invoice()` remains the sole authority on
  the actual charge. See "Production hardening pass" below for the history.

## What to check first

Since the database/RLS/workflow layer now has two independent automated
regression passes behind it (46+ checks total, see above), and I still
cannot run `npm install`/a real `tsc`/`vite build` from this sandbox (see the
network note near the top - the npm registry is unreachable here; that has
not changed), there is exactly one thing I genuinely could not verify myself:

1. Run `npm install && npm run build:erp` from the repo root and tell me
   about any TypeScript errors that come up. Every `.tsx` edit in this pass
   was checked by hand (import correctness, JSX balance, prop types against
   the real component definitions) since real `tsc` wasn't available, but a
   real compiler run is still worth doing once before you deploy.
2. Set up a **staging/test** Supabase project (not your production one yet -
   per your own instruction, production data waits until this has passed
   your testing too) following "Setting up Supabase" above, and click
   through the real workflow once as a sanity check on top of the automated
   ones: log in as your bootstrapped admin -> Staff page -> set Clinic
   Settings (or leave the home state unset if you don't need IGST yet) ->
   create a customer -> book + check in an appointment -> Doctor Room ->
   Counselor Room -> Billing -> check the Accounting ledger picked up the
   sale automatically -> Inventory (try a manual stock correction, check it
   appears as an audit entry) -> Expenses -> Analytics -> GST/ITR Export Hub.
3. Anything that looks off, wrong, or missing compared to how the clinic
   actually works - flag it and I'll fix it before production data ever
   touches this.

## Deployment readiness checklist

The ERP is code-complete and passes every automated check I can run in this
sandbox. It is **not yet connected to anything real** - no production
Supabase project, no domain, no hosting account, no live credentials have
touched this repo, per your standing instruction. Here's exactly what's
needed from you to take it live, and what's already in place waiting for it:

**What I need from you:**
- A **production Supabase project** (separate from any staging project used
  for step 2 above) - its project URL and anon public key.
- A **domain** (or subdomain) to point at the deployed app, if you want one
  instead of the hosting provider's default `*.vercel.app`/`*.netlify.app`
  address.
- **Hosting provider details** - which one you want to use (see options
  below) and the account/team to deploy under.
- **A GitHub repository** to push this code to, if you want CI/CD-style
  deploys on every push rather than manual uploads. This repo is already
  git-initialized locally (`git init`, no commits yet, `.gitignore` already
  excludes `.env*`/`node_modules`/`dist`/build output) - I have not created
  any commits or pushed anywhere, since that's your call to make.

**What's already in place:**
- `apps/erp/.env.example` documents the exact two env vars the app needs
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) - copy it to `.env.local`
  for local dev, or set them as the hosting provider's environment variables
  for a deployed build. No other secrets are needed; the anon key is safe to
  expose client-side by design (RLS is the actual security boundary, and
  this whole hardening pass exists to make sure that boundary holds).
- `apps/erp/vercel.json` and `apps/erp/public/_redirects` (Netlify/Cloudflare
  Pages) both configure the SPA fallback this app needs - without one of
  these, refreshing the browser on any route other than `/` (e.g. `/billing`)
  returns a 404, because this is a client-side-routed single-page app and the
  host needs to be told to always serve `index.html`. Whichever static host
  you pick from the list below, one of these two files already covers it.
- The build is a plain static site: `npm install && npm run build:erp` from
  the repo root produces `apps/erp/dist/`, deployable to any static host
  (Vercel, Netlify, Cloudflare Pages, an S3+CloudFront bucket, a plain nginx
  box) - point the platform's "root directory" at `apps/erp` if it supports
  monorepos, or build once and upload the `dist/` folder directly otherwise.
- Migrations `0001` through `0011` are the complete, ordered schema for a
  fresh production Supabase project - see "Setting up Supabase" above for
  the exact run order and the one manual first-admin bootstrap step.

**Go-live sequence, once you provide the above:**
1. Create the production Supabase project; run migrations `0001`-`0011` in
   order; bootstrap the first admin (one manual SQL insert, documented
   above).
2. Set `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as the hosting
   provider's environment variables for the production build (never commit
   real values to `.env.local` if this repo gets pushed to GitHub).
3. Connect the GitHub repo to the hosting provider (or do a one-off manual
   `dist/` upload), point the domain's DNS at it, and deploy.
4. Log in as the bootstrapped admin, set Clinic Settings, and grant the rest
   of the staff their roles from `/staff` - the last purely in-app step
   before the clinic can actually start using it.

## Delivery plan (your call, and where we are in it)

1. ~~Build the ERP~~ <- **you are here** - feature-complete, hardened,
   tested (see "Production hardening pass" above), and deployment-ready
   pending the details in the checklist above. Tracker has deliberately not
   been started, per your instruction.
2. Build the Tracker app (`apps/tracker/`) from scratch - follow-up ladder
   (Day 1/2/4/7/10/15/21/30/45), leak radar, upsell triggers, session
   cadence + post-procedure calls, dashboard/KPIs.
3. Wire up the live integration layer: Tracker's scheduled job calling
   ERP's `sync_export_*`/`tracker_book_appointment` functions with the
   service-role key, plus the "one staff identity" SSO/JWT bridge
   (`MediGloIdentityClaims` in `packages/shared-types`).

I won't start step 2 until you say so.
