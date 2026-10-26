# Verify the clinic workflow, and add patient check-in

The uploaded document describes the Doctor → Counselor → Reception workflow that is already built. This plan does not rebuild it. It does two things: a full working check of the live flow, and the one piece the document asks for that is genuinely missing — an explicit patient check-in.

## 1. Patient check-in in the Doctor room

Today a patient's arrival is only implied by the queue. Add a clear check-in step:

- Each waiting patient card in the Doctor room gets a "Check in" button.
- Pressing it stamps the arrival time and who checked the patient in, and marks the patient as checked in.
- The card then shows a "Checked in HH:MM" badge instead of the button.
- Starting the consultation stamps the start time, and sending the patient onward stamps completion — as it already does.
- Nothing else in the queue, routing or billing changes.

## 2. End-to-end working check

I run the whole path in the live app and report what I find, fixing anything broken along the way:

1. Appointment on the calendar, including a colour tag showing in day and month views.
2. Patient appears in the Doctor room, check-in works and the time is recorded.
3. Doctor builds a recommendation from the catalogue (treatments and products, sessions/quantity, suggested price, urgency, notes) and sends to Counselor 1 or 2.
4. Counselor sees the same items priced, can change prices, add a discount with a reason, see live totals, save a draft, finalise (gets a quotation number and a 7-day validity) and print the quotation.
5. Reception's billing screen arrives pre-filled from the accepted quotation; the saved bill records which recommendation and quotation it came from.
6. Package/session history stays intact after billing, and the quotation is marked converted.
7. Each role only sees what it should — a counselor cannot write a doctor's recommendation, and vice versa.

I report the result of each step, with anything that fails fixed or, if it needs your decision, listed clearly.

## Technical notes

- Check-in reuses the existing `markEncounter` server function with stage `checked_in`; no schema change is required — `encounters` already stores `checked_in_at` / `checked_in_by`.
- The Doctor room card in `src/routes/_authenticated/consultation.tsx` gains the button and badge; encounter state is read through `getVisitWorkflow`.
- Verification is done by driving the running app with Playwright as a signed-in user, plus direct database reads to confirm rows are written correctly.
- No changes to `edit_invoice()`, bill numbering, or existing accounting logic.
