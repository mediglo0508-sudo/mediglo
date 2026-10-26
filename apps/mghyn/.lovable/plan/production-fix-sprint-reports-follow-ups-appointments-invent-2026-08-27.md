# Production Fix Sprint — Reports, Follow-Ups, Appointments, Inventory, Invoices, Pharmacist Role

Nine work items, grouped into five deliverable phases. Each phase touches schema, backend logic and UI together so nothing is left half-wired.

## Phase 1 — Financial drill-down reports

- Make every dashboard metric card clickable: Total Collection, Product Sales, Service & Treatments, Doctor Consultation, Gross Sale, Pending Due, GST. Today only Collection and Product Sales open a breakdown; the rest are static.
- One reusable report view (`/reports/$metric`) driven by the active date range, showing the invoice/line rows behind the number, with subtotals.
- Export buttons on every report view: Excel (.xlsx via the exceljs already in the project) and PDF (print-layout renderer already used for invoices).
- Every row in a report links straight to the full invoice drawer for that invoice — no searching.

## Phase 2 — Follow-Up Desk: assignment, notes, scheduled recurrence

- Follow-up records gain: assigned marketing staff, discussion notes log (append-only entries, not a single overwritten field), next follow-up date, and an auto-retrigger date.
- Assignment control on every follow-up card; a staff filter so a marketing member sees their own queue by default, while admin/marketing head see all.
- Automatic resurfacing: a follow-up reappears in the due bucket on its follow-up date, and again 3 days after that date if it has not been closed.
- Session-gap follow-ups (clients with unused package/wallet sessions and a long gap since the last visit) become real, assignable follow-up records rather than a read-only computed list, so notes and dates stick to them.
- Entering an expected visit date on a session follow-up creates a confirmed appointment in the calendar under that client's name, linked back to the follow-up.

## Phase 3 — Appointment edit form

- Edit modal exposes and persists every field: date, time (start and end), concern/service, status, notes, follow-up note. Time inputs are currently missing from the edit path.
- Saving writes all fields in one update and refreshes calendar, reception and client-drawer views.

## Phase 4 — Inventory and invoice integrity

- Audit the stock pipeline end to end: billing deduction, invoice revision, line-item edits, and the batch/ledger triggers. Fix double-deduction, negative stock, and stale stock levels; add a guard so stock can never go below zero and every movement is written to the inventory ledger exactly once.
- Invoice revision pipeline: ensure edits reliably persist all lines, recompute item quantities, service totals, GST, dues and the customer balance atomically, and reverse the prior invoice's stock movements before applying new ones.
- "Mark Service as Consumed Today" is shown only for service/treatment lines; hidden and non-functional for product/medicine lines.
- Invoice deletion becomes a controlled void-and-archive instead of a hard delete: invoice, its lines, vouchers, ledger and audit rows stay intact and reports stay reconcilable. Deleting from the list marks the invoice voided with a reason and reverses its financial and stock effects.

## Phase 5 — Pharmacist role and dashboard

- New `pharmacist` role in the role enum, role labels, and the assignment UI.
- Access scoped to Inventory, Product POS billing, Purchases, Expenses and in-house product management; all clinical, marketing and finance-wide screens hidden and blocked by policy.
- Dedicated pharmacist dashboard: today's product sales, low-stock and expiry alerts, purchase logging shortcut, expense entry, and a quick product-POS launcher.

## Technical notes

- Schema changes: `cos_follow_ups` gains assignment/notes/date columns plus a notes-history table; `service_wallets`-derived session follow-ups get persisted rows; new `pharmacist` value on `app_role`; RLS policies and GRANTs updated for the new role and new tables.
- Invoice delete path moves from `DELETE` to the existing void/replace routine in `app_private`, with cascade rules reviewed so audit and voucher rows are preserved.
- Stock corrections run through `app_private.deduct_inventory_stock` and the batch-sync trigger; a reversal function is added for revisions and voids.
- Follow-up recurrence is evaluated on read (due-date + 3-day rule) so no external scheduler is required.
- Exports reuse the existing exceljs dependency and the shared print layout; no new heavy dependencies.
