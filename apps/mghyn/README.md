# MediGlo Harmony

INITIALIZE BRAND-NEW COMPREHENSIVE CLINIC ERP ARCHITECTURE: 20-MODULE COMPLIANCE ENGINE



Act as a Principal Full-Stack Software Architect and Lead Financial Systems Auditor specializing in Enterprise Resource Planning (ERP), Tally Prime accounting frameworks, and Indian GST/ITR protocols. Build a brand-new, enterprise-grade, fully interactive, secure multi-user ERP software from absolute scratch for "MediGlo Clinic". The entire software ecosystem must be natively engineered around the provided files: "may.xlsx", "june.xlsx", and "MediGlo_Services_SAC_Master_List.pdf".



---



### MODULE 1: COMPREHENSIVE MULTI-ROLE LOGIN & SESSION MANAGER (MINIMUM 10 LOGINS)

- Build a secure, credential-based authentication system supporting a minimum of 10 concurrent active logins partitioned across 4 strict professional hierarchical roles:

  1. **Admin / Director (Owner - Charan Singh):** Unrestricted 100% root access across all system nodes, clinical views, financial data, and system logs.

  2. **Doctors / Consultants:** Access to the Patient Digital Prescription Pad, Camera Capture API, Medical Notes, and individual performance logs. Completely blocked from viewing global clinic expenses, total revenue collection, net profits, or vendor purchase documents.

  3. **Front-Desk / Billing Operator (Reception):** Access to the Point of Sale (POS) direct billing screen, invoice creation, package session counters, and customer profile generation. Locked out of viewing global business profitability reports, backend expense matrix adjustments, or database deletion tools.

  4. **Accountant / Finance Team (Himanshu Yadav):** Access to Tally-style multi-voucher ledger modules, GST tables, selective cash filter panels, and tax reporting hubs. Restricted from modifying patient clinical/medical charts or clinical prescription logs.

- Session Management: Implement explicit user-login session tracking. The dashboard state must dynamically mutate based on the authorized username/role logged in.



### MODULE 2: ROLE-BASED VISUAL DASHBOARDS & PRIVACY ISOLATION

- Create distinct interface routing arrays matching user roles:

  * **Admin Overview Canvas:** High-fidelity graphical widgets rendering Total Gross Sales, Payment Mode Splits, Per-Service Profitability, and Real-time Cash vs Bank Balance.

  * **Staff/Doctor Portal View:** Clean clinical worklist tracking assigned patients, pending appointments, historical patient treatment logs, and prescription creation prompts.

  * **Billing Console View:** High-speed inventory checkout counter grid maximizing billing efficiency for walk-in transactions.

- **Strict Data Redaction Rules**: If a user without an 'Admin' or 'Accountant' security token attempts to access financial ledger directories, route them to a secure "Access Denied" view. Never leak financial data through client-side inspector bundles.



### MODULE 3: TALLY-STYLE MULTI-VOUCHER ACCOUNTING PROTOCOL

- Architect standard corporate transactional voucher entry windows supporting double-entry bookkeeping validation:

  1. **Sales Vouchers:** Logging customer billing lines, processing item splits, and automatically incrementing session numbers.

  2. **Purchase Vouchers:** Recording procurement of inventory supplies from vendors. Must support flexible incoming GST rate variables up to 18% to map Input Tax Credit (ITC) data for large-scale clinic machinery or chemical consumables.

  3. **Payment Vouchers:** Logging cash/bank payouts to third parties or tracking internal staff advancements.

  4. **Receipt Vouchers:** Documenting external incoming non-invoice revenue streams or direct owner equity infusions.

  5. **Contra Vouchers:** Tracking internal bank-to-cash or cash-to-bank transactions (e.g., depositing end-of-day cash collections directly into the ICICI bank account).

  6. **Credit Notes & Debit Notes:** For tracking client package adjustments, customer cancellations, bad debt corrections, or returned clinical products.



### MODULE 4: RE-ENGINEERED UNIFIED 5% SALES TAX CONSTRAINT

- Enforce an absolute global sales tax override constraint: ALL customer billing invoices generated across all services, aesthetic packages, medical consulting, injectables, and retail skin products must process at a strict **FLAT 5% GST RATE**.

- Completely ignore default 18% parameters mentioned inside historic reference documents ("MediGlo_Services_SAC_Master_List.pdf") during sales creation workflows.



### MODULE 5: INTERACTIVE TALLY TAX TOGGLE SWITCHES & FORMULAS

- Inside the checkout and invoice confirmation panel, implement a functional, state-driven calculation toggle: [ Inclusive of GST ] / [ Exclusive of GST ].

  * **Inclusive Calculation Logic:** Taxable Base Value = Total Gross Amount Collected / 1.05; Total GST Amount (5%) = Total Gross Amount Collected - Taxable Base Value.

  * **Exclusive Calculation Logic:** Taxable Base Value = Input Base Amount; Total GST Amount (5%) = Input Base Amount * 0.05; Gross Invoice Grand Total = Base + Tax.

- Backend Split Execution: Programmatically break down the calculated 5% tax into structural ledger outputs: CGST (2.5%) and SGST (2.5%) inside accounting balances.



### MODULE 6: STRICT DROPDOWN PLACE OF SUPPLY (POS) COMPLIANCE

- Eliminate standard manual text fields for state or city entry within customer account creations to eliminate data typos.

- Deploy a locked, validated selection component pre-populated strictly with official Indian 2-Digit GST State Codes (e.g., '07-Delhi', '06-Haryana', '08-Rajasthan'). This variable serves as the structural Place of Supply (POS) vector to ensure seamless matching for GSTR-1 Table 7 filing pipelines.



### MODULE 7: PURE B2C DATA COMPLIANCE FILTERS

- Strip and omit all 15-digit B2B GSTIN input validation fields, corporate tax identification rows, or corporate filing arrays from the standard client profile dashboard.

- Enforce data constraints that guarantee all customer transactions map seamlessly into end-consumer profiles, ensuring clean exports matching the criteria of GSTR-1 B2C Others schedules.



### MODULE 8: AUTOMATED SHEET DATA INGESTION PIPELINES

- Configure an asynchronous multi-file ingestion pipeline that maps row data out of workspace data models: "may.xlsx" and "june.xlsx".

- Cleanly route historical records into the newly initialized relational database schema, creating proper relational joints between rows based on client names and date tracking tokens.



### MODULE 9: AUTO-CASH PIPELINE MODIFIER FALLBACK

- Define a persistent fallback logic constraint inside the file data mapper: while processing records from "may.xlsx" and "june.xlsx", if a transaction row contains an empty 'Mode of Payment' field or is designated as 'Without UPI', the system must automatically write and register "Cash" as the default payment channel inside the transactional database tables.



### MODULE 10: AUTOMATED CLINICAL SERVICE LIBRARY SEEDING

- Parse the 13 clinical service groups from the attached "MediGlo_Services_SAC_Master_List.pdf". Map descriptions (e.g., Laser Hair Removal, Medi Facials, IV Drips, CO2 Laser, Cautery) directly into the new 'services_master' database library.

- Securely tie each service to its respective 6-digit SAC billing code (e.g., LHR Packages -> SAC 999313, Facials -> SAC 999722, IV Drips -> SAC 999312) while forcing the sales calculation engine to evaluate them at the mandated 5% flat GST rate.



### MODULE 11: PRE-SEEDED EDITABLE INVENTORY DIRECTORY (MEDICAL STOCK MASTER)

- Initialize the product stock repository pre-seeded with these specific clinical lines, setting their base sales tax parameter to 5% GST. The layout must allow real-time inline additions, manual title corrections, stock level edits, or complete inventory sheet overrides:

  * *Skincare & Topical Formulations:* Emusone Cream M, IPCA Scar Kit, IPCA Cutitgt Kream G6, Yuderma VUVIT-C Cream, Sesderma Retiage Anti-ageing Cream, Sesderma Retiage Anti-ageing Serum, Skin Medis Photomed Spotless Tinted SPF50+, Skin Medis Melaprime (Face Wash), Sesderma Azelac RU, Sesderma Retises Eye Contour Cream, Obagi Mineral SPF 50 Lotion, Sesderma Hidraderm Hyal Facial Cream, Sesderma Hidraderm Hyal Liposomal Serum, Eclipse Solaire Lumiere Mist SPF50, IPCA Kerawash Hair Conditioning Shampoo, Masaya Restodry RR Ointment, Cosmenova Trichovance AH Anti-Hairfall Shampoo, CeraVe Gel Creame Hydratant Oil Control Moisturizer, Aurabliss XG (Cosmenova) Facewash, Aveil 5% Minoxidil, Aveil Anti Dandruff Shampoo, Tricosphire Hair Growth Shampoo, Elovera Ad Lotion, Trichosphire - M (Hair Act Kit), Trichosphire - F (Hair Act Kit), Yuderma Melarid TRX Serum, HA Prime Serum, Yuderma Retinol 2% Argieline, Akosma Eye Illuminating Gel Cream, Akosma Eco Screen Sunscreen SPF50+, IPCA Acne UV SPF100+, IPCA Acne Hydra Gel Cream, Onak SR Lotion, Glutone Sx2, Avil SPF 50 Heat Shield, Skin Fay Capsule, Oryza, Momate Lotion, Momate - F Cream, Momate Cream, Emusone Cream IP, Cosmenova Pheomel EXF Face Scrub, Sesderma Sesretinal Facial Gel Cream Global Anti-aging, CeraVe Blemish Control Gel, Sesderma Azelac RU Gel Cream, IPCA Cutimax Lotion, Azithromycin Gel Azifast Gel, Luliz (Luliconazole Cream IP), Lacsoft Cream, Procalp Shampoo, T-BACT Cream, Tubelite GFC 360, Procalp Repair Keratin Masque, Aveil Unseen Physical sunscreen, Aveil sheer tinted sunscreen, sesderma C-vit radiance, Pinedruff (IZONIS), LACSOFT Lotion, Nadibact Gel 10gm, Pirfesca gel 30gm, Numbing cream, Melarid pigment corrector sunce, Sebalex acne Creamish gel, Sebalex Facewash, Sorg Face Cleanser, Aveil you glow plus.

  * *Injectables & Advanced Clinical Consumables:* Obesema 0.25 MG inj., Saypha Rich 1ml, Juvederm Volift With Lidocaine, Juvederm Volift With Lidocaine 2x1 ML, BL Sheet Mask, Hyla Active sheet mask, Hyla Tube, Vitamin Rich Repair, VRR tube, Clear tube, BL tube, UBer pro peel, Derma pen 4 tip, Doctor pen tip, obagi facial kit, theraderm collagen dry skin mask, pumpkin peel, TCA 50%peel, Hydrate, Vitamin C, Rejuvenate, Brighten, Clarify, Sesderma C-VIt lyposomal Serum, Mounjaro Vial 2.5MG, Dermamelan Pack, Dermamelan Home Pack, Cosmelan, BD Ultra fine III pen needles, Mounjaro kwikpen 5mg, Exoxe 1. pure Exo Lypholized powder 50mg, Exoxe 2. sterlized HA Solution 5ml.



### MODULE 12: SPEED-BILLING POS OPERATOR INTERFACE WITH OVERRIDES

- Design a high-speed counter billing portal optimizing walk-in patient processing. The billing user must be capable of directly editing text descriptions on-screen, manually overriding quantitative counts, or inserting a customized final transaction value. 

- The transactional engine must handle real-time calculations to dynamically spit out 5% inclusive/exclusive tax divisions on the fly without locking inputs.



### MODULE 13: CLINICAL CRM DRILL-DOWN VIA ROW EVENT LISTENERS

- Bind a structural 'onDoubleClick' or 'Enter' keyboard event listener onto any row containing customer or sales parameters. On execution, trigger a fluid UI side-drawer or modal interface divided into three comprehensive accounting segments:

  * **Segment A (Profile Details):** Fully interactive fields displaying name, contact keys, and the validated 2-digit Indian state code.

  * **Segment B (Treatment Logs):** An index tracking package info, sessions completed, and remaining balance details.

  * **Segment C (Tally Client Ledger):** A vertical accounting layout computing Gross Invoiced, Itemized Mode Breakdown Splits, and absolute Remaining Outstanding Dues.



### MODULE 14: MULTI-SESSION CLINICAL TREATMENT TRACKING VIEWS

- In the Sales grid view and printed invoice components, ensure explicit visibility of tracking rows mapping clinic treatments. 

- Invoices must print out clean lines displaying: Specific Package Name, Treatment Session Track Count (e.g., "Session 3 of 6 Sessions Completed"), and Live Remaining Balances to manage client expectations cleanly.



### MODULE 15: DIGITAL PRESCRIPTION PAD WITH CAMERA CAPTURE API

- Build an advanced clinical prescription layout (Rx Interface) for doctor roles, featuring:

  * **Camera Device Ingestion Block:** Programmatically integrate a native webcam capture module. The clinical user must be able to hit a "Capture Base Image" button to snap high-resolution baseline progress photos of skin/aesthetic conditions, linking them directly to the client's historical treatment log.

  * Complete data logging tables for Clinical Notes, Physical Diagnostics, and automated medication dropmenus pulled from the inventory directory.



### MODULE 16: ADVANCED STAFF ALLOCATION & PERFORMANCE LOGS

- Integrate an explicit, interactive drop-down staff allocation box inside both the POS Billing Panel and the Digital Prescription interface. 

- Operators must be able to assign specific clinic personnel or supervisors (e.g., 'Vikas Sir', 'Gourav Sir') to individual treatment rows or sales invoices. This data must populate an admin-facing dashboard tracking staff execution metrics and incentive credits.



### MODULE 17: INDIRECT EXPENSE TRACKER MATRIX

- Build a dedicated indirect ledger ledger grid to seamlessly track and document general clinic operational overhead costs. 

- Provide standard transaction inputs to log categories like Clinic Rent, Electricity, Cleaning Supplies, Machine Maintenance outlays, Staff Salary advances, or professional cash reimbursements issued to colleagues (such as 'Vikas Sir' or 'Gourav Sir').



### MODULE 18: PER-SERVICE NET PROFITABILITY ANALYTICS

- Engineer a complex backend analytics engine that calculates the cost of inventory items consumed per clinical treatment session. 

- Aggregate this cost data alongside shared operating costs mapped from the indirect expense ledger to output a high-impact dashboard analytics visualization rendering **Per-Service Net Profitability** (Gross Revenue Collected minus Immediate Product Costs minus Shared Overhead Multipliers).



### MODULE 19: UNIVERSAL INLINE EDITS & MASTER DELETIONS

- **Pencil Edit Interaction:** Embed a persistent inline edit icon (Pencil Icon) alongside all rows across transaction tables, client profiles, and stock listings. Modifying any cell must trigger an instant downstream recount of parent tax components and update balances.

- **Bulk Cleanup Routine:** Add a master select-all checkbox column alongside table headers, wired directly to a permanent red "Delete Selected" execution button to drop faulty entries instantaneously.



### MODULE 20: TAX AUDIT EXPORT HUB WITH SELECTIVE MODE FILTERS

- Create a dedicated container panel named "GST/ITR Tax Export Hub" positioned at the top of the analytics control board featuring interactive toggle checkboxes: [ ] Cash, [ ] UPI, [ ] Card, [ ] Net Banking.

  * Programmatically intercept JSON and Excel export scripts: if I uncheck [ ] Cash, the system compiler must strip out all cash-attributed line entries from the running cache pool on-the-fly, generating a clean online-only statement file. This enables clean exports containing ONLY bank/online transfers to ensure zero dual-counting errors during income tax audits.



Compile this multi-module unified framework as a brand-new, clean-code application 

base, bind all structural hooks, and initialize the responsive live layout preview workspace right now.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mediglo-vision.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f439f139-ca06-4df9-b44a-3f3711954207).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
