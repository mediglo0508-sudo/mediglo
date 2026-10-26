# Payment modes: CNH, Save In and EMI, plus "Add New Payment Mode"

## What you will get

- **CNH** and **Save In and EMI** show up in every payment dropdown: POS Billing (single and split payments), Edit Invoice, Vouchers, the Counselor deal-closure screen, and the Export filter.
- A **"+ Add New Payment Mode"** button next to each payment dropdown. Admins and accountants type a name and save it. The new mode shows up right away everywhere and stays after a refresh or a new login.
- The payment modes you already have, and all past bills, stay exactly as they are.

## Where the list is stored

- The existing settings table gets one new entry called `payment_modes` that holds the list of custom mode names. No new table is needed, and no existing data changes.
- One small permission change is needed. Right now only admins can read settings, so other staff couldn't see the custom modes. The change:
  - Every signed-in staff member can **read** the `payment_modes` entry.
  - Admins and accountants can **add** to it.
  - All other settings keep their current admin-only rules.

## How the new modes behave

- **Bills and payment records:** the mode is saved as text on the invoice and its payment splits, so new modes save as they are.
- **Accounting entries (vouchers):**
  - CNH is treated as Cash, so it posts to the Cash account.
  - "Save In and EMI" posts to the Finance Receivable account.
  - Any other custom mode posts to a holding account (Suspense) for the accountant to review, never to the wrong ledger.
- **Reports and Export:** the Export payment filter includes the built-in modes, any custom modes, and any mode found in past bills, so nothing gets left out of a filter.
- **Spreadsheet import:** "cnh" is recognised as CNH, and "save in and emi" as Save In and EMI.

## Technical details

- Migration (permissions only, no data changes): `app_settings_select_payment_modes` (key='payment_modes' AND has_any_role) for SELECT, plus INSERT/UPDATE policies for key='payment_modes' limited to admin and accountant.
- `src/lib/constants.ts`: add `CNH` and `Save In and EMI` to `PAYMENT_MODES` and `DEAL_PAYMENT_MODES`, and widen `PaymentMode` to `string`. Extend `normalizePaymentMode`.
- New `src/lib/payment-modes.ts`: a `usePaymentModes(base)` React Query hook (key `["payment_modes"]`) that merges the built-in modes with the custom ones and removes duplicates case-insensitively. Also an `addPaymentMode(name)` helper that trims the name, checks it is 1–40 characters, rejects duplicates, and upserts the entry.
- New `src/components/PaymentModeSelect.tsx`: wraps the existing Select and adds an "Add New Payment Mode" button and dialog. The button only shows for admins and accountants (`useAuth().hasRole`).
- Swap it in at:
  - `pos.tsx` (the single selector and each split row)
  - `InvoiceEditDialog.tsx` (keeping its local "Split Payment" option)
  - `vouchers.tsx`
  - `consultation.tsx`
  - `export.tsx` (the filter list comes from the hook)
- `src/lib/voucher.functions.ts`: in `ledgerFor`, map "cnh" to the Cash account, and match "save in and emi" to Finance before the SaveIn check.
- Verify:
  - Type check.
  - Playwright: add a mode on POS, refresh, and confirm it is still there; confirm it shows up in Vouchers and Export.
  - Create a test bill with CNH.
  - Update the existing payment mode implementation plan and implement the following requirements in my existing MediGlo Harmony software. Do not rebuild the application or remove existing functionality.
    ## 1. Required Payment Modes
    Add these as four distinct options wherever payment modes are used:
    1. Credit Card EMI
    2. Save In
    3. CNH
    4. + Add New Payment Mode
    Important: Credit Card EMI, Save In, and CNH must be separate payment modes, not combined into one option such as "Save In and EMI". Preserve any existing payment modes.
    ## 2. Add New Payment Mode
    Add an "+ Add New Payment Mode" option next to the payment mode dropdown. Admins and accountants should be able to enter a custom payment mode name and save it. Validate the name, prevent duplicate names ignoring letter case and extra spaces, and make the saved mode available immediately throughout the software. Store custom modes persistently in the existing settings/database system so they remain available after refresh and relogin.
    ## 3. Separate Calculations for Each Payment Mode
    This is a critical requirement. Every payment mode must retain its own correct calculation and transaction handling, consistent with the existing software's previous behavior. Do not merge different payment modes into one calculation or change their financial meaning.
    - Credit Card EMI: Maintain separate identification and calculation for Credit Card EMI. Preserve the existing EMI amount, installment/tenure, processing fee, interest, or other charges wherever those fields and rules already exist. Do not invent fees or installment rules if they are not configured.
    - Save In: Treat Save In as its own distinct payment mode, with its own transaction amount, records, and existing calculation/accounting behavior.
    - CNH: Treat CNH as its own distinct payment mode, with its own transaction amount, records, and existing calculation/accounting behavior.
    - Other custom payment modes: Save the exact selected mode and amount independently. Do not automatically apply Credit Card EMI, Save In, or CNH rules to an unrelated custom mode.
    For split payments, calculate and record each payment component separately according to its selected mode. The sum of split payments must reconcile with the invoice amount according to the existing billing rules. Prevent duplicate counting, missing amounts, and incorrect totals.
    ## 4. Update All Relevant Screens
    Make the modes available consistently in:
    - POS Billing, including single and split payments
    - Edit Invoice and invoice payment records
    - Vouchers and accounting entries
    - Counselor deal-closure/consultation screens
    - Export filters and reports
    - Spreadsheet import and payment mode normalization
    - Any other existing screen where a payment mode is selected, displayed, calculated, or saved
    ## 5. Accounting and Ledger Mapping
    Inspect the existing ledger and accounting logic before making changes. Preserve the existing mapping for current payment modes.
    - CNH: Map to the Cash ledger only if this matches the intended accounting policy.
    - Save In: Preserve its existing Save In ledger/accounting logic.
    - Credit Card EMI: Use the appropriate existing EMI/finance receivable ledger, if configured.
    - Other custom modes: Never silently post them to an incorrect ledger. Use the existing configured mapping or a clearly identified suspense/holding account pending accountant review.
    Do not merge Credit Card EMI with Save In. They must remain distinguishable in bills, vouchers, reports, and exports.
    ## 6. Database and Permissions
    Reuse the existing settings table and project architecture where appropriate. Persist custom payment modes without altering historical invoices or payment records. Allow signed-in staff to read the payment mode list as required, while restricting adding new modes to admins and accountants. Do not weaken permissions for unrelated settings.
    ## 7. Reports and Historical Data
    Keep existing transactions, invoices, payment splits, and reports intact. Include built-in modes, custom modes, and modes found in historical transactions in relevant filters. Normalize import values carefully so Credit Card EMI, Save In, and CNH are recognized as separate modes.
    ## 8. Implementation and Testing
    First inspect the current codebase and existing payment mode calculations, especially the logic used before this change. Update the existing plan and implement the complete feature, rather than stopping at analysis.
    Test the following:
    1. Credit Card EMI, Save In, and CNH appear as three separate selectable options.
    2. A custom payment mode can be added, saved, and remains available after refresh and relogin.
    3. Each mode retains its own calculations and accounting behavior.
    4. Split payments record each mode and amount correctly, with no double counting.
    5. Vouchers, invoices, counselor screens, exports, and reports show the correct payment mode.
    6. Existing payment modes and historical records continue working.
    7. Run type checks and available automated tests, and report any remaining issues.
    IMPORTANT: Do not assume that making the payment mode field free text is sufficient. The dropdown, persistence, calculations, accounting mapping, split payments, and reporting must all work correctly. Do not overwrite existing business logic without first inspecting it. If the current code does not reveal the previous calculation rules for a mode, identify the gap and ask for clarification instead of inventing financial behavior.
  - &nbsp;