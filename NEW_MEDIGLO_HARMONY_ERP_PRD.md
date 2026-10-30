# Product Requirements & Technical Architecture Document (PRD)
## MediGlo Harmony Clinic ERP (Enterprise 30-Module Architecture)

**Document Version:** 2.0.0 (Production Release)  
**Classification:** Confidential — MediGlo Aesthetics & Longevity Clinics  
**Last Updated:** October 2026  
**Primary Maintainers:** MediGlo Engineering & Clinical Operations  

---

## 1. Executive Summary & Project Identity

### 1.1 Overview
**MediGlo Harmony Clinic ERP** is a proprietary, full-stack clinic operations, clinical EMR, inventory, pharmacy, and financial accounting platform engineered specifically for dermatology, medical aesthetics, cosmetology, and longevity wellness clinics. 

The software replaces legacy, fragmented SaaS tools with an integrated, single-tenant, real-time operating system covering 30 operational modules—from tablet-based patient digital onboarding and clinical facial charting to multi-tender GST billing, double-stream FIFO inventory deduction, and automated Tally XML accounting export.

### 1.2 System Metadata & Repository Links
| Attribute | Specification |
|---|---|
| **Software Name** | MediGlo Harmony Clinic ERP (30-Module Monorepo) |
| **Local Working Directory** | `C:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\erp` |
| **Primary GitHub Repository** | [https://github.com/mediglo0508-sudo/mediglo](https://github.com/mediglo0508-sudo/mediglo) |
| **Secondary Mirror Repository** | [https://github.com/mediglo0508-sudo/mediglo-platform](https://github.com/mediglo0508-sudo/mediglo-platform) |
| **Frontend Framework** | TanStack Start (SSR/Nitro) + React 19 + TypeScript + Tailwind CSS |
| **UI Component Architecture** | Radix UI Primitives + Lucide Icons + Recharts + HTML5 Signature Canvas |
| **Primary Production URL** | `http://localhost:3000` |
| **Patient Registration Kiosk** | `http://localhost:3000/register` (iPad / Tablet Self-Check-in) |
| **Isolated Local Database Engine** | `http://127.0.0.1:54321` (SQLite PostgREST + GoTrue Auth Emulator) |
| **Local Database File** | `apps/erp/isolated_mediglo_harmony.db` (Clean-slate ₹0 billing transactional baseline) |

---

## 2. Architectural Tenets & Database Isolation

### 2.1 Absolute Protection of Live MGHYN Production Database
The clinic's legacy software (MGHYN) operates on Supabase project `wrjhdtdlxekackjdsjpf`. To prevent data corruption, billing cross-contamination, or accidental overwrites:
1. **Zero Production Access:** `apps/erp` possesses no credentials, API keys, or network connections to project `wrjhdtdlxekackjdsjpf`.
2. **Dedicated Local PostgREST / GoTrue Server (`scripts/isolated-local-supabase.mjs`):** A custom Node.js daemon running on port `54321` implements the standard Supabase REST (`/rest/v1/*`), Auth (`/auth/v1/*`), and RPC (`/rest/v1/rpc/*`) specifications backed by high-performance SQLite (`better-sqlite3` with WAL mode).
3. **Transaction Isolation:** Financial totals on the MediGlo Harmony ERP start at ₹0 (Gross Sales, Products, Services, GST, and Receivables). 
4. **Master Datasets Preserved:** 
   - 294 Standard Services & Treatment Packages
   - 361 Master Inventory Items (Injectables, Consumables, Retail, Serums)
   - 968 Master Client Profiles
   - 16 Pre-configured Staff Logins

---

## 3. Authentication, Security & Role-Based Access Control (RBAC)

### 3.1 Authentication Architecture
- **Supabase GoTrue JWT Emulator:** Emulates standard Supabase auth workflows with persistent sessions stored in localStorage.
- **Default Super-Admin Credentials:**
  - **Email:** `admin@mediglo.in`
  - **Password:** `AdminPassword2026!`
  - **Access Level:** Super Admin (Full God-Mode with system-wide bypass and audit logging)

### 3.2 Operational Roles & Permissions Matrix
The software enforces granular role-based security across 13 operational roles:

| Operational Role | Nav Sections Accessible | Financial Data | Prescription Access | Stock Alteration | Billing Lock Control |
|---|---|---|---|---|---|
| **Admin / Director** | All 30 Modules (Full Access) | Full View & Edit | Full View | Unlimited | Yes (System Wide) |
| **Accountant / Finance** | Executive, Billing, Accounting, Tax, Purchases | Full Financials | Read-Only | Read-Only | Yes |
| **Doctor / Consultant** | Clinical, Doctor Room, Consultation, Services | Consultation Fees Only | Full Prescribe | Consumption Log | No |
| **Counselor** | CRM, Counselor Room, Packages, Quotations | Quotation Pricing Only | Read-Only | None | No |
| **Pharmacist** | Pharmacy, Smart Purchase, POS Billing, Inventory | Purchase & Retail Rates | Dispense Only | Full Restock & Dispense | No |
| **Therapist** | Therapist Floor (`/duties`), Live Rooms | Masked (₹0 Displayed) | View Protocols | Log In-Treatment Usage | No |
| **Receptionist** | Front Office, Appointments, CRM, Check-in | Daily POS Collection | Read-Only | None | No |
| **Marketing Head / Team** | Marketing Dashboard, Follow-Up Desk, Ingest | Cost Per Acquisition | None | None | No |

### 3.3 Super-Admin "Preview As Role" God-Mode Switcher
Located in the global top navigation bar, Super Admins can simulate any clinic role with 1-click without logging out:
- Preview As: `Accountant / Finance`
- Preview As: `Doctor / Consultant`
- Preview As: `Counselor`
- Preview As: `Therapist (Privacy Masked)`
- Preview As: `Pharmacist`
- Preview As: `Receptionist`
- Preview As: `Marketing Head`
A high-visibility amber banner allows instant return to Full God-Mode.

### 3.4 Therapist Floor Privacy Masking
To prevent patient poaching and maintain confidentiality:
- All patient phone numbers appear masked (`******7890`) when viewed by therapists.
- Financial invoice values, bill totals, and package quotation amounts are completely hidden on `/duties`.

---

## 4. Complete 30-Module Route Map & Functional Breakdown

```
MediGlo Harmony Clinic ERP (30 Modules)
│
├── 1. Executive & Analytics
│   ├── /dashboard                -> Executive Financial Dashboard (Real-time collections & KPI cards)
│   ├── /marketing-dashboard      -> Lead Attribution, CAC & Conversion Funnel
│   ├── /performance              -> Staff Conversion Rates & Clinical Funnel
│   └── /analytics                -> Per-Service Net Profitability Engine
│
├── 2. Front Office & CRM
│   ├── /follow-ups               -> Centralized Lead & Post-Treatment Calling Desk
│   ├── /reception                -> Patient Queue & Live Check-In Management
│   ├── /appointments             -> Color-Coded Multi-Doctor Calendar
│   ├── /customers                -> Master Client 360° CRM & Clinical Safety Desk
│   ├── /register                 -> Standalone Tablet/Kiosk Digital Registration Form
│   └── /scheduler-rules          -> Clinic Operating Hours, Slots & Buffer Rules
│
├── 3. Clinical & Floor Operations
│   ├── /consultation             -> Initial Patient Triage & Vitals
│   ├── /doctor-room              -> Clinical EMR, Quick-Rx & Self-Learning AI Prescriptions
│   ├── /counselor-room           -> Treatment Package Pricing & Quotation Desk
│   ├── /duties                   -> Therapist Floor, Consumable Costing & OTP Redemption
│   └── /rooms                    -> Real-time Visual Floor Bed & Room Tracker
│
├── 4. Pharmacy, Billing & Inventory
│   ├── /pharmacy                 -> FIFO Medicine Dispensing Queue
│   ├── /pos                      -> Multi-Tender GST Billing & WhatsApp Invoice Share
│   ├── /invoices                 -> Invoice Audit, Multi-Format PDF Printing & Edit Lock
│   ├── /inventory                -> Dual-Stream Master Inventory (Stream A Retail vs B Clinical)
│   └── /purchases                -> Smart Purchase with Built-In OCR Vendor Bill Scanner
│
├── 5. Masters & Studio
│   ├── /services                 -> Master Service Catalog (294 Procedures, SAC & Pricing)
│   ├── /packages                 -> Bundled Treatment Package Builder
│   └── /template-studio          -> Custom Print Layout & Consent Template Designer
│
└── 6. Finance, Compliance & Administration
    ├── /vouchers                 -> Double-Entry Tally Vouchers (Receipt, Payment, Journal)
    ├── /expenses                 -> Indirect Clinic Overheads & Vendor Ledger
    ├── /reconciliation           -> Automated Bank Statement CSV Reconciliation
    ├── /export                   -> GST Compliance Hub (GSTR-1, GSTR-3B & Tally XML)
    ├── /ingest                   -> Bulk Legacy Data Migration Hub
    ├── /import-review            -> Data Cleansing & Deduplication Review
    ├── /staff                    -> Employee Directory & Payroll Base
    └── /users                    -> User Roles, Credentials & Billing Lock Engine
```

---

## 5. Deep-Dive: Core Differentiating Engines

### 5.1 Digital Client Registration Form & E-Signature Pad (`/register`)
- **Dual Deployment:** Operates both as a standalone touch-optimized kiosk page (`http://localhost:3000/register`) for iPad/tablet patient self-registration and as a modal drawer triggered from the Reception Desk (`/reception`).
- **Section A: Personal & Contact Information:**
  - Date (auto-filled, editable)
  - Auto-uppercase First Name and Last Name
  - Gender selector (Male, Female, Other with text input)
  - Date of Birth with auto-calculated Age
  - Residential Address & City
  - 10-digit primary mobile number and email
- **Section B: Multi-Select Client Concerns:**
  - **Profession:** Business, Homemaker, Student, Salaried Professional, Other
  - **Skin Problems:** Dull Skin, Pigmentation, Acne, Scars, Tanning, Ageing, Other
  - **Hair Problems:** Hair loss / Thinning, Dandruff, Bald Patches, Premature Greying, Other
  - **Body Concerns:** Unwanted Hair, Fat / Cellulite, Loose Skin, Stretch Marks, Pigmentation, Other
  - **Well-being:** Mental Health, Pain Management, Fatigue, Low Immunity, Other
  - **Longevity:** Premature Ageing, Slow Metabolism, Poor Detox, Nutritional Deficiency
- **Section C: Medical Profile & Referral History:**
  - Clinics Visited Earlier (Clinic 1 & Clinic 2 tracking past dermatology providers)
  - Medical History Checkbox Grid: Hypertension, Diabetes, Asthma, Thyroid, Keloids, Kidney/Liver Disease, Auto immune, Cardiovascular, Any Implant in body (Pacemaker/Metal plate), PCOS, Other
  - Prescription Medicines taken in the last 1 year
  - Drug Reactions / Allergies toggle (Yes/No) with mandatory text explanation when enabled
  - Referral Source tracking & WhatsApp clinic updates opt-in
- **Section D: Terms of Service & HTML5 Canvas Signature Pad:**
  - Displays clinic rules: 15-day doctor consultation validity, strict non-refundable clinic policy, 60/40 package payment milestone, treatment risk consent
  - High-precision HTML5 Canvas capturing touch, stylus, or mouse signatures
  - Saves full Base64 PNG signature string with UTC timestamp
- **Action Buttons:**
  - `Submit & File to CRM`: Stores consent record and upserts patient into `customers`.
  - `Submit & Check-In at Reception`: Files record and adds patient to the live Reception Desk queue for floor routing.
- **A4 Print Engine (`print-registration-sheet.ts`):** 1-click printable physical registration sheet matching official clinic stationery with high-visibility warning box and embedded digital signature.

---

### 5.2 Master Client 360° CRM Dashboard (`/customers`)
- **KPI Metrics Ribbon:**
  - Total Registered Clients
  - New Clients Today
  - Clinical Safety Alerts Count (clients with recorded allergies, keloids, or implants)
  - Active Wallets & Prepaid Balances
- **Multi-Filter & Instant Search:**
  - Real-time text search across Name, Mobile, City, and Profession
  - 1-Click Clinical Safety Filters: `🚨 Has Allergies`, `⚠️ Keloid Prone`, `⚠️ Diabetic`, `⚠️ PCOS`, `⚠️ Body Implants`
  - Concern Filters (Skin, Hair, Body, Longevity) and Referral Source filtering
- **Client 360° Slide-Over Drawer:**
  - **Tab 1: Medical Profile:** Displays all concerns, previous clinic visits, current medications, and high-visibility red drug reaction warnings.
  - **Tab 2: Signed Consent:** Displays captured digital signature, consent date, and 1-click **"Print / Download Signed Registration Form PDF"** button.
  - **Tab 3: Clinic History:** Aggregates lifetime invoices, advance wallet ledger, and doctor prescriptions.
- **Export Capabilities:** 1-Click **"Export Client Master CSV/Excel"** exporting demographics, medical conditions, and contact points.

---

### 5.3 In-House Self-Learning Clinical Prescription AI Engine (`/doctor-room`)
- **Continuous Learning Architecture:** Every time a doctor files a prescription in [`DoctorTreatmentRecommendation.tsx`](file:///c:/Users/Vikas%20Koul/Documents/antigravity/hopeful-mendel/apps/erp/src/components/DoctorRoom/DoctorTreatmentRecommendation.tsx), the engine indexes the co-occurrence matrix in SQLite (`clinical_ai_patterns`):
  $$\text{Patient Concerns} + \text{Clinical Diagnosis} + \text{Gender/Age Group} \longrightarrow \text{Prescribed Services} + \text{Pharmacy Medications}$$
- **Zero Third-Party Dependency:** Runs entirely in-house without OpenAI, Claude, or external paid API calls.
- **Cross-Check Medical Contraindications:**
  - When auto-generating suggestions for a selected patient, the engine parses their `client_registrations` profile.
  - If the patient has a penicillin allergy, antibiotics in the beta-lactam class are automatically suppressed with a warning badge.
  - If the patient is prone to keloids, aggressive ablative laser protocols are flagged.
- **Inventory Stock-Level Prioritization:**
  - Medicines currently in stock (`inventory.stock > 0`) receive higher confidence weighting over out-of-stock brands.
- **UI Suggestion Chips:** Displays "✨ Generated from 14 past doctor prescriptions for Acne Vulgaris" with a 1-click "Apply AI Prescription" button that populates items, dosages, rates, and clinical instructions.

---

### 5.4 Pharmacist Smart Purchase & Built-In Local OCR Scanner (`/purchases`)
- **Pharmacist Role Clearance:** Full RBAC permission granted to pharmacists to manage vendor invoices, purchase orders, and stock-ins without accessing confidential director-level accounting journals.
- **100% In-Browser OCR Invoice Scanner (`tesseract.js`):**
  - Pharmacists click **"Scan / Upload Vendor Bill (Smart OCR)"** and upload invoice images or PDFs.
  - Browser-native Web Worker runs text extraction and regex table parsing:
    - Vendor Company Name (auto-matched against `vendors` table)
    - Bill / Invoice Number and Date
    - Line Items: Medicine/Product Name, Batch Number, Expiry Date, Quantity, Purchase Rate, MRP, HSN Code, and GST Slabs (0%, 5%, 12%, 18%)
- **Fuzzy Inventory Matching:** Extracted product titles are fuzzy-matched against `inventory.name`. If a product is new, the system auto-provisions a master inventory record upon approval.
- **1-Click Bulk Stock-In:** Pharmacist reviews the extracted lines in a visual staging table and clicks **"Approve & Stock-In All Items"**, executing atomic stock increments via the `restock_inventory` RPC.

---

### 5.5 POS / Multi-Tender Billing & WhatsApp PDF Automation (`/pos`)
- **Multi-Tender Payment Split:** Supports split tender across Cash, UPI (GPay/PhonePe), Credit/Debit Card, Net Banking, and Advance Wallet deductions in a single transaction.
- **Dual-Stream GST Engine:**
  - In-state sales: CGST + SGST (automatically split 50/50).
  - Out-of-state sales: IGST.
  - Rounding logic complies strictly with Indian GST invoicing standards.
- **Duplicate Bill Protection (`check_duplicate_bill`):** Prevents accidental double-clicks from generating duplicate invoice numbers for the same customer within 15 minutes.
- **Staff Billing Lock Gate (`my_billing_access`):** Allows directors to temporarily freeze billing privileges during inventory stock-taking or month-end reconciliations.
- **Save & Send to WhatsApp (Invoice PDF + Thank You):**
  - Persists invoice to database.
  - Automatically renders and downloads the client Tax Invoice PDF named `MediGlo_Invoice_<InvoiceNo>_<CustomerName>.pdf`.
  - Automatically triggers the Web Share API (if supported on mobile/tablet) or opens WhatsApp Web (`https://wa.me/91<Phone>?text=...`) pre-populated with a warm, formatted receipt:
    ```text
    ✨ *Thank You for Visiting MediGlo Clinic!* ✨
    Dear *Pooja Sharma*,

    It was our pleasure attending to you today. Here is the summary of your visit and official invoice:

    📄 *Invoice No:* INV-2026-0891
    📅 *Date:* 30-10-2026
    ━━━━━━━━━━━━━━━━━━━━
    *Itemized Breakdown:*
    • Microneedling RF Treatment x 1 - ₹15,000.00
    • Retinol 0.5% Night Cream x 1 - ₹2,584.00
    ━━━━━━━━━━━━━━━━━━━━
    💰 *Grand Total:* ₹17,584.00
    💳 *Paid:* ₹17,584.00 via UPI (Google Pay)
    ⚖️ *Pending Due:* ₹0.00

    📎 Your official Tax Invoice PDF has been generated and downloaded.
    If you have any questions or need post-treatment assistance, reply directly to this message or call us at +91 9813256239.

    Warm regards,  
    *Dr. Himani Yadav & Team MediGlo Clinic*  
    📍 MediGlo Clinic, Gurugram
    ```

---

### 5.6 Therapist Floor Costing & Real-Time Consumables Engine (`/duties`)
- **Treatment Execution Workflow:**
  1. Patient check-in transfers from Reception Desk to Therapist Floor queue.
  2. Therapist assigns room and starts treatment timer.
  3. **Mandatory Injectable / Consumable Usage Logging:** Before completing duty, therapist logs exact units consumed (e.g. 20 Units Botox, 1.5 ml Juvederm, 1 Numitec Laser Cartridge).
  4. System executes `deduct_inventory_stock` RPC, updating `service_consumption`, `consumption_logs`, and `inventory_ledger`.
  5. **Patient OTP Verification:** For high-value packages, patient provides an SMS/WhatsApp OTP to verify session completion before redemption.
  6. Feeds directly into [`/analytics`](file:///c:/Users/Vikas%20Koul/Documents/antigravity/hopeful-mendel/apps/erp/src/routes/_authenticated/analytics.tsx) so the **Per-Service Net Profitability** table displays real gross revenue, product cost, and true net margin.

---

### 5.7 In-House MediGlo AI Manager (`AIManagerDrawer.tsx` & `/api/ai-manager`)
- **Zero Third-Party API Key Requirement:** Replaces external LLM calls with an embedded natural language parser executing live parameterized SQLite queries.
- **Bilingual Intent Engine:** Understands clinic commands in both English and natural Hinglish:
  - *"Today's collection breakdown"* / *"Aaj ka collection kitna hai"* $\rightarrow$ Real-time gross, paid, UPI vs Cash split.
  - *"Low stock products"* / *"Stock check karo"* $\rightarrow$ Inventory items below reorder threshold.
  - *"Today's appointments"* / *"Aaj kitne patients hain"* $\rightarrow$ Time-sequenced schedule with doctor assignments.
  - *"All pending dues"* $\rightarrow$ Outstanding balance ledger with client contact links.
  - *"Allergy alerts"* $\rightarrow$ Registered patients flagged with high-risk clinical warnings.
- **Output:** Clean markdown tables with instant sub-50ms execution time.

---

## 6. Complete Database Schema & Active Tables

The SQLite engine at `http://127.0.0.1:54321` runs the following relational schema:

### 6.1 Core Tables
1. `_schema_meta`: Schema versioning and seeding timestamps.
2. `user_roles`: Maps `user_id` $\rightarrow$ `role` (`admin`, `doctor`, `counselor`, `pharmacist`, `therapist`, `reception`, `accountant`, `marketing_head`, `marketing`).
3. `staff`: Staff directory with employee codes, phone numbers, departments, and active statuses.
4. `customers`: Master CRM profiles with name, phone, age, gender, address, city, state_code, client_type (`New`/`Repeat`), and `outstanding_balance`.
5. `client_registrations`: Comprehensive 4-section digital intake records:
   - Personal fields (`first_name`, `last_name`, `gender`, `dob`, `age`, `address`, `city`, `mobile_no`, `email`)
   - Concerns arrays (`skin_problems`, `hair_problems`, `body_concerns`, `wellbeing_concerns`, `longevity_concerns`)
   - Medical fields (`medical_conditions`, `has_allergies`, `allergy_details`, `prescription_medicines`, `clinics_visited_earlier_1`, `clinics_visited_earlier_2`)
   - Consent fields (`signature_data` Base64, `signature_timestamp`, `consent_agreed`)
6. `clinical_ai_patterns`: Self-learning clinical frequency matrix mapping concerns and diagnoses to treatments, medications, and confidence scores.
7. `services_master`: 294 master procedures with category, name, SAC code, GST rate, default price, cost estimate, and duration.
8. `inventory`: 361 master SKUs with category (`Injectables`, `Consumables`, `Retail`, `Chemical Peels`), brand, unit rate, current stock, and batch details.
9. `inventory_ledger`: Double-stream audit trail tracking stock movements (`Stream A Retail` vs `Stream B Clinical`).
10. `purchases`: Vendor bill headers with vendor details, invoice number, purchase date, GST breakdown, and payment status.
11. `purchase_items`: Line-item vendor purchases with batch, expiry, quantity, and cost price.
12. `invoices`: Master sales receipts with invoice number, customer reference, gross total, discount, GST breakdown, payment status, and duplicate hash.
13. `invoice_items`: Billed treatments and products with unit rates, discounts, SAC/HSN codes, and tax rates.
14. `invoice_payments`: Payment tender allocations across Cash, UPI, Card, Net Banking, and Advance Wallet.
15. `patient_visits`: Live floor queue entries routing patients between Reception, Doctor Room, Counselor Room, and Therapist Floor.
16. `appointments`: Clinic calendar bookings with start/end timestamps, assigned doctor, and appointment status.
17. `doctor_prescriptions`: Clinical consultation notes, diagnostic assessments, and follow-up recommendations.
18. `doctor_prescription_items`: Prescribed medicines with dosages, frequencies, and durations.
19. `counselor_quotations`: Proposed treatment packages, discounts, and patient conversion statuses.
20. `cos_treatment_packages`: Active patient treatment package trackers monitoring completed vs remaining sessions.
21. `service_consumption`: Floor consumable usage linked to specific invoices and procedures.
22. `consumption_logs`: Therapist usage audit trail recording stock consumed during procedures.
23. `vouchers`: Double-entry accounting vouchers (Receipt, Payment, Journal, Contra).
24. `voucher_entries`: Debit and credit entries mapped to chart-of-accounts.
25. `expenses`: Indirect overhead expenses (Rent, Electricity, Marketing, Maintenance).
26. `vendors`: Approved supplier directory with GSTIN and payment terms.
27. `audit_log`: System-wide audit log tracking user modifications, logins, and billing lock events.

### 6.2 Active RPC Endpoints
- `my_billing_access`: Returns caller's billing lock state and duplicate override privileges.
- `check_duplicate_bill`: Evaluates potential duplicate invoice submissions.
- `log_billing_event`: Writes high-priority audit events to `audit_log`.
- `deduct_inventory_stock`: Atomic stock decrement triggered by therapist floor usage or POS sales.
- `restock_inventory`: Atomic stock increment triggered by Smart Purchase bill approvals.

---

## 7. Developer & Operations Startup Guide

### 7.1 Prerequisites
- **Node.js:** v20.x or v22.x LTS (compatible with Windows, macOS, and Linux)
- **Git:** Installed and configured with access to the GitHub repositories.
- **Port Availability:** Ports `3000` (ERP Frontend/SSR) and `54321` (Local Isolated Database) must be open.

### 7.2 Fresh Clone & Installation
```bash
# Clone the repository
git clone https://github.com/mediglo0508-sudo/mediglo.git
cd mediglo

# Navigate to the ERP workspace
cd apps/erp

# Verify environment configuration (.env)
# Must point strictly to isolated local server:
# VITE_SUPABASE_URL=http://127.0.0.1:54321
# VITE_SUPABASE_ANON_KEY=local-isolated-anon-key
```

### 7.3 Launching the Software
In two separate terminal windows:

#### Terminal 1: Start Isolated Database Daemon
```bash
# From workspace root
node scripts/isolated-local-supabase.mjs
# Output: [Isolated DB Server] Running at http://127.0.0.1:54321 (₹0 Clean Slate, 3 Master Lists active)
```

#### Terminal 2: Start MediGlo Harmony ERP Dev Server
```bash
cd apps/erp
node --env-file=.env ./node_modules/vite/bin/vite.js dev --port 3000 --host 0.0.0.0
# Output: VITE ready. Local: http://localhost:3000/
```

### 7.4 Logging In
1. Open Chrome and navigate to: `http://localhost:3000`
2. Enter Super-Admin credentials:
   - **Email:** `admin@mediglo.in`
   - **Password:** `AdminPassword2026!`
3. Verify that the Executive Dashboard displays ₹0 billing figures with all master lists intact.
4. To test patient self-onboarding, navigate to: `http://localhost:3000/register`.

---

## 8. Verification & Release Certification

| Verification Milestone | Validation Target | Status | Certification Note |
|---|---|---|---|
| **Live Production Safety** | Project `wrjhdtdlxekackjdsjpf` | **CERTIFIED 100% UNTOUCHED** | Zero mutations or writes; verified via readonly checksum audit. |
| **TypeScript Compilation** | `apps/erp` (`tsc --noEmit`) | **0 ERRORS (Exit Code 0)** | Full type safety across all 30 routes and components. |
| **Standalone Tablet Kiosk** | `http://localhost:3000/register` | **OPERATIONAL (HTTP 200)** | Touch signature, 4 sections, auto-upsert into `customers`. |
| **Client 360° CRM Drawer** | `http://localhost:3000/customers` | **OPERATIONAL (HTTP 200)** | Medical profile, signed consent PDF print, CSV export. |
| **Smart Purchase OCR** | `http://localhost:3000/purchases` | **OPERATIONAL (HTTP 200)** | Pharmacist access unlocked; local OCR parsing enabled. |
| **Doctor Prescription AI** | `http://localhost:3000/doctor-room`| **OPERATIONAL (HTTP 200)** | Auto-learning pattern matrix with allergy cross-checks. |
| **In-House AI Manager** | `AIManagerDrawer.tsx` | **OPERATIONAL (HTTP 200)** | Live SQLite answers with zero third-party API dependencies. |
| **POS WhatsApp Automation** | `http://localhost:3000/pos` | **OPERATIONAL (HTTP 200)** | PDF auto-generation + branded WhatsApp deep-link. |

---
*End of Technical Architecture & Product Requirements Document (PRD).*
