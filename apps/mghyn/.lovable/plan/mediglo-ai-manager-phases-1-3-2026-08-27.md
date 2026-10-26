# Mediglo AI Manager — Phases 1–3

An AI assistant built into the ERP that answers questions from live clinic data and performs a small, tightly controlled set of actions through the ERP's own rules — never around them.

## What already exists (verified)

- Auth + roles: `user_roles` table with `app_role` enum, `app_private.has_role`, `AuthProvider` in `src/lib/auth.tsx`, protected `_authenticated` routes.
- Server RPC pattern: `createServerFn` + `requireSupabaseAuth` (bearer attached in `src/start.ts`), used by `voucher.functions.ts`, `performance.functions.ts`, etc.
- Business logic already centralised in the database: `app_private.revise_invoice`, `void_invoice`, `deduct_inventory_stock`, `restock_inventory`, `invoice_stock_items`, wallet triggers, `check_duplicate_bill`, billing lock and maintenance guards.
- Follow-Up Desk: `cos_follow_ups` (+ new `expected_visit_date`, `appointment_id`, `kind`, `source_key`, `last_contacted_at`) and the new `cos_follow_up_notes` log; auto queue computed in `src/lib/followup-queue.ts`.
- Calendar: `appointments` + `SmartCalendar.tsx`; wallets: `service_wallets` / `wallet_redemptions`.
- `LOVABLE_API_KEY` is provisioned, so the AI runs through Lovable AI — no third-party key needed.

Nothing in the AI layer exists yet; it will be added, not retrofitted.

## Phase 1 — AI Manager UI + read-only tools

- New floating AI drawer (`AIManagerDrawer`) mounted in the authenticated shell, styled with the existing VVIP tokens; opens from a header button, keyboard-dismissable, remembers open state per session.
- Chat streams from a server route `src/routes/api/ai-manager.ts` using the AI SDK against Lovable AI. The route resolves the caller's Supabase session and roles server-side; anonymous or role-less callers are rejected.
- Read-only tools, each a thin wrapper over the existing queries/logic (no new maths):
  - `pending_sessions` / `treatment_gap_clients` — reuses the follow-up queue rules (wallet sessions left, days since last visit).
  - `todays_appointments` — from `appointments`.
  - `todays_collection` — gross / net / GST / consultation / services / products, computed from `invoices` + `invoice_lines` using the same category rules as `src/lib/item-category.ts` so the numbers match the dashboard exactly.
  - `pending_dues` — outstanding invoices and customer balances.
  - `low_stock` / `inventory_alerts` — from `inventory` and batches, including expiry.
  - `client_lookup` — client, wallet, visit and invoice history for one person.
- Results render as compact tables/cards in the chat, with rows linking into the real ERP screen (invoice drawer, client timeline, calendar day).

## Phase 2 — AI actions through existing workflows

- `schedule_follow_up` — resolves the client from live data, writes a `cos_follow_ups` row (assigned staff, notes, follow-up date, `expected_visit_date`) and creates the matching `appointments` row under the client's name. De-duplicated by `source_key` and by an existing-appointment check on the same client/date, so repeated instructions don't pile up.
- `assign_follow_up` / `add_follow_up_note` — uses the same assignment and notes log the Follow-Up Desk uses.
- Due-today and the 3-day re-trigger are computed on read (due when the date has arrived; re-surfaced 3 days after it if still open), so the desk and the AI always agree. The Follow-Up Desk UI gains the assignment, notes and expected-visit-date controls that these tools write to, so nothing the AI creates is invisible or uneditable in the app.
- `invoice_diagnostics` — read-only integrity report: header vs line totals, GST split, missing lines, paid/pending mismatches, orphaned or duplicated numbers. Reports only; any correction is handed off to the existing edit workflow (`revise_invoice`), never a raw write.
- `inventory_diagnostics` — compares billed product lines against `inventory_ledger` movements and current stock to flag missing, doubled or unexpected deductions. Product/medicine lines are explicitly excluded from anything service-consumption related; the "Mark Service as Consumed Today" path stays service-only, and that guard is also enforced in POS so products can never take it.

## Phase 3 — Authorization, safety, consistency, testing

- Every tool declares the roles it needs and the server checks the caller's roles from the database before execution: marketing tools for admin / marketing / marketing_head / caller, inventory and purchase tools for admin / accountant / pharmacist, invoice tools for admin / accountant / reception. Denials come back as a clear message, not a silent empty result.
- The AI never touches raw SQL. Writes go only through the whitelisted server functions, which run as the signed-in user so RLS, billing lock, maintenance mode and duplicate-bill guards all still apply. No deletes, no stock overrides, no direct invoice-row edits.
- After a successful action the drawer invalidates the affected query keys (follow-ups, appointments, ledger, inventory), so the calendar, desk and dashboards update without a manual refresh.
- Testing against live data: run each read tool and compare its numbers with the corresponding ERP screen; create a follow-up + appointment end to end and confirm it appears in the desk and calendar under the right client; attempt a marketing action as a non-marketing role and confirm refusal; run both diagnostics and confirm findings match a manual query.

## Technical notes

- Server route: `src/routes/api/ai-manager.ts` (streaming chat, tools defined server-side); client hook in `src/lib/ai-manager.ts`; UI in `src/components/AIManagerDrawer.tsx`.
- Tool implementations live in `src/lib/ai-tools.server.ts` and reuse existing helpers (`item-category`, `followup-queue`, `gst`, wallet helpers) rather than re-deriving figures.
- Packages to add: `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`. Model: a current Gemini Flash model for latency, via Lovable AI.
- No mock data anywhere; every tool queries the live database with the caller's own privileges.
