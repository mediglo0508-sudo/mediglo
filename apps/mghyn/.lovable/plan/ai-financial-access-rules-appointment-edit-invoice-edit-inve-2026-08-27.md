# AI Financial-Access Rules, Appointment Edit, Invoice Edit ↔ Inventory

Three independent fixes. Findings below are from reading the current code.

## 1. AI Manager — restrict finance, open up general ERP info

Today the AI's role sets are coarse: `low_stock` needs an "inventory" role, `client_lookup` returns full invoice money to everyone, and there is no way to ask for a product MRP or a service price at all.

Changes (all server-side, in the AI tool layer — not the chat UI):

- New `finance` role set = **admin, accountant, pharmacist** only. It gates: collection summary, pending dues, revenue/gross/net figures, GST figures, doctor-consultation and service/product collection totals, financial reports, invoice diagnostics.
- Non-financial tools become available to every authorized ERP role, still subject to existing database access rules: stock/low-stock/availability, product details and MRP, service and treatment prices, customer profile, appointments, follow-ups, pending sessions.
- New `catalog_lookup` tool: product name, brand, MRP/price, current stock; service name, category and price. Open to all roles.
- `client_lookup` is split by permission: everyone authorized sees profile, wallets/sessions, appointments and visit history; the invoice amounts, paid, pending dues and outstanding balance block is returned only to finance roles, and is replaced by a short access-denied note otherwise.
- The AI's system rules are updated so it cannot work around the tools: it must never state, summarise, table or derive a restricted financial figure, and must not compute one indirectly from allowed data. It states the access limit plainly instead.
- Tests: run the same finance and non-finance questions as a marketing user and as an accountant, confirming refusal vs. answer, plus MRP/stock/service-price/customer questions answered for both.

Note: reception and counselor currently have finance access in the AI layer; per this directive they lose AI access to financial totals (their ERP screens are untouched).

## 2. Appointment Edit — full details, including date and time

The Edit dialog only loads concern, status, notes and follow-up note. Date, time, service, doctor/therapist and room are missing entirely, which is why changed timings never appear.

- Extend the existing Edit dialog (no new workflow) with: client name (read-only reference), date, start time, end time, service/treatment, doctor, therapist, room, concern, status, notes, follow-up note.
- All existing stored values are loaded into the form when it opens.
- Saving writes every field in one update, re-runs the existing slot/concurrency validation, and refreshes the calendar, reception view and client drawer so the new date/time shows immediately.
- Test: open an appointment, confirm all values load, change date and time, save, confirm the calendar and the database both show the new slot.

## 3. Invoice Edit and inventory synchronisation

Root cause found: on save, the server routine `revise_invoice` already reverses the old bill's stock and applies the revised bill's stock exactly once, and then the POS screen **also** runs `deductProductLines(...)` for the same lines. Every edit therefore deducts product stock a second time. A repeat edit compounds it.

- Remove the duplicate client-side deduction in the edit path. Stock movement for a revision stays entirely inside the single transactional server routine, so the invoice and the stock ledger can never disagree or half-apply.
- Keep the optimistic on-screen stock drop for a **new** bill; for an edit, the screen refreshes from the server result instead.
- Because the routine reverses the original invoice in full and then applies the newly saved invoice in full, the net effect is exactly the difference for every case in the directive: quantity up, quantity down, line removed, line added, product swapped, and no product change at all (net zero, no extra deduction).
- A guard is added so a revision can never drive stock below zero; every movement continues to write one ledger entry.
- Invoice void/cancel: verify the void path reverses the original bill's stock the same audited way, and fix it if it does not.
- Products/medicines keep deducting by billed quantity; "Mark Service as Consumed Today" stays limited to service/treatment lines and is never triggered by product lines.
- Edit form hydration is verified end to end: header, all line items with quantity, price, discount and category, per-service consumables, payment mode, paid amount and split payments.
- After save, the invoice list, invoice drawer, dashboard figures, customer ledger and every inventory screen are refreshed so nothing stale remains.

### Test matrix

Increase quantity · decrease quantity · remove a product line · add a new product · swap one product for another · edit only non-product fields · save with no change · edit the same invoice twice in a row. Each is checked against the invoice row, the invoice lines, the stock quantity and the stock ledger.

## Technical notes

- AI: role sets and per-tool gating in the server-only AI tool module; new catalog tool; `client_lookup` money block gated; system prompt hardened against indirect disclosure.
- Appointments: the existing edit dialog and its single update statement are extended; concurrency guard already exists in the database and is reused.
- Invoices: the duplicate `deductProductLines` call in the revise branch of POS is deleted; the database revision routine remains the sole stock authority, with a non-negative stock guard added.
- No new dependencies, no schema redesign, no unrelated behaviour changes.
