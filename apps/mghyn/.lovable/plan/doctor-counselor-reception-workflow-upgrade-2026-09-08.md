# Doctor → Counselor → Reception workflow upgrade

The clinic already routes patients Doctor → Counselor → Billing through the existing visit queue, and billing already has protected invoice edit/void. This plan keeps that queue as the backbone and adds the missing pieces from the brief on top of it, in phases, so nothing currently working is replaced.

Decisions taken from your answers: extend the existing queue, no approval gate on counselor discounts, quotations expire after 7 days.

## Phase 1 — Data groundwork and integrity fixes

New records, all additive:

- **Visit encounter details** — check-in / start / completion times and who did each, linked to the existing visit and appointment.
- **Doctor recommendation** — a structured list of suggested treatments and products (item, sessions/quantity, doctor's suggested price, urgency, notes) plus diagnosis and instructions, replacing the current free-text handover while keeping the old text field intact.
- **Counselor quotation** — quotation number, line items with quoted price and discount, subtotal, discount and reason, GST, net total, status (draft, sent, accepted, rejected, converted, expired), validity of 7 days with automatic expiry.
- **Appointment colours** — colour tag and optional custom colour on appointments.
- **Invoice links** — each bill can reference the recommendation and quotation it came from, for a full audit trail.

Integrity fixes included:

- Session/package history can no longer be wiped by deleting a bill line (the link is protected instead of cascading).
- Bill lines get a cancelled/replaced marker instead of being hard-deleted.
- Bill-number generation permission fix.
- Dues sync race condition fix.

Access rules: doctors write their own recommendations; counselors write their own quotations; admin, accountant and reception can read them. Nothing existing is loosened.

## Phase 2 — Doctor room

- Structured recommendation form inside the existing Doctor room: pick services/products from the catalogue, set sessions or quantity, optional suggested price, urgency and notes.
- "Send to Counselor 1 / 2" keeps working exactly as today, but now carries the structured recommendation with it.
- Existing prescription text and photo capture stay.

## Phase 3 — Counselor room

- Counselor sees the doctor's recommendation as an editable priced worksheet.
- Per-line quoted price and discount, plus an overall discount with reason. No approval gate.
- Live subtotal, discount, GST and net total.
- Save as draft, finalise (gets a quotation number and a 7-day expiry), mark accepted/rejected.
- Sends to Reception exactly through the current queue step.

## Phase 4 — Reception / billing

- When a visit arrives with an accepted quotation, the billing screen pre-fills lines, prices and discount from it; staff can still adjust before saving.
- The saved bill records which recommendation and quotation it came from.
- New-bill creation, duplicate-bill check, receipt mode and the existing bill-edit flow are untouched.

## Phase 5 — Quotation printing

- Printable quotation with clinic header, patient details, itemised treatments, discount, GST, net total, validity date and terms — same print approach as the existing bill print.

## Phase 6 — Appointment colours

- Colour picker on the appointment dialog (Google-Calendar style preset palette plus custom colour).
- Calendar and day views render the chosen colour, with the current status colours as the default.

## Phase 7 — Verification

- End-to-end run: appointment → check-in → doctor recommendation → counselor quotation → reception bill → package sessions intact.
- Confirm each role sees only what it should, expiry works, and existing accounting totals are unchanged.

## Technical notes

- New tables: `encounters`, `doctor_prescriptions`, `doctor_prescription_items`, `counselor_quotations`; additive columns on `cos_appointments`, `invoices`, `invoice_lines`; `service_wallets.invoice_line_id` FK changed to `ON DELETE RESTRICT`.
- Every new table gets GRANTs, RLS enabled and role-scoped policies in the same migration; `has_role()` is reused rather than inlining `user_roles` subqueries.
- The existing `patient_visits` row remains the queue record; new tables reference it so the current Doctor/Counselor routing code keeps working.
- Reads/writes go through TanStack server functions with the signed-in user's token so RLS applies; no service-role access for these screens.
- Quotation numbers come from a sequence-backed function (not a `COUNT(*)`), to avoid duplicate numbers under concurrency.
- Expiry is enforced by a check at read/convert time plus a stored `expires_at`, not a CHECK constraint.
- Bill edit continues to go through the deployed `edit_invoice()` RPC; this plan does not modify it.
