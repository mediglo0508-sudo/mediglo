# MediGlo Harmony Clinic ERP — Product Requirements & Architecture Document (PRD)

> **Document Version:** 2.0.0-PROD  
> **Release Date:** October 30, 2026  
> **Classification:** Confidential — Proprietary Clinic Architecture  
> **Software Project:** MediGlo Harmony (apps/erp)  
> **Environment:** Dedicated Isolated Instance (Zero-Billing Clean Testing State)

---

## 1. Executive Summary & Architectural Isolation

**MediGlo Harmony** (`apps/erp`) is an enterprise-grade Aesthetic & Dermatology Clinic ERP built to power multi-specialty clinical workflows, front-desk reception, doctor consultations, counselor conversions, therapist floor treatment execution, pharmacy dispensing, dual-stream inventory, and double-entry accounting.

### 1.1 Strict Database & Codebase Isolation
To guarantee absolute data safety for the live clinic operations running on MGHYN, MediGlo Harmony has been architecturally decoupled:

| Dimension | Live MGHYN (Production) | MediGlo Harmony (New ERP) | Isolation Status |
|---|---|---|---|
| **Codebase Location** | `mediglo-vision` / `apps/mghyn` | `apps/erp` (`c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\erp`) | **100% Isolated** |
| **Database Instance** | Cloud Supabase (`wrjhdtdlxekackjdsjpf`) | Dedicated Isolated Local Supabase Engine (`http://127.0.0.1:54321`) backed by SQLite (`isolated_mediglo_harmony.db`) | **100% Isolated** |
| **Transaction State** | Live Clinic Daily Billing (₹82,584+ collection) | Clean Testing Slate: **Zero (₹0.00)** Invoices, Payments, Vouchers, Expenses, Appointments | **100% Clean Slate** |
| **Master Data** | Active Clinic Directory | Pre-seeded with 294 Services, 361 Items (stock=0), 968 Clients (bal=0), 16 Staff Logins | **100% Ready** |
| **GitHub Remote** | `mediglo-vision.git` | `https://github.com/mediglo0508-sudo/mediglo.git` / `mediglo-harmony-erp` | **Dedicated** |

---

## 2. Master Data & Initial State Specifications

The isolated database is initialized with exact master references while preserving a strict ₹0 financial testing baseline:

1. **Services & Package Master (`services_master`):**
   - **294 Active Clinical Procedures & Packages**: All MediFacials, Chemical Peels, Laser Hair Reduction tiers, Injectables (Botox, Profhilo, Juvederm Fillers), Hair Restoration (PRP, GFC, QR678), Body Sculpting (HIFU, Exion), and Longevity IV Therapy.
   - Configured with SAC Code `999312`, GST rates (18%), standard procedure durations, gap rules, and cost estimates.
2. **Inventory Master (`inventory`):**
   - **361 Pharmaceutical & Consumable Items**: Branded injectables, topical anesthetics, laser consumables, serums, pharmacy lines.
   - **Stock Count Initialized to 0.00**: Allows testing clean Purchase Billing (Stock-In) and FIFO deduction without legacy stock skew.
3. **Customer Master Directory (`customers`):**
   - **968 Customer Profiles**: Name, phone, state code, demographics, and clinical notes.
   - **Outstanding Balances Set to ₹0.00**: Ready for clean billing and ledger verification.
4. **Staff Roster & Authentication (`profiles`, `staff`, `user_roles`):**
   - **Super Admin:** `admin@mediglo.in` (Password: `AdminPassword2026!` / `MediGlo@12345`) with Full God-Mode access and Preview Role Switcher.
   - **16 Authenticated Staff Accounts:** Password `MediGlo@12345` spanning Doctor, Counselor, Reception, Pharmacy, Therapist, Accountant, and Marketing roles.

---

## 3. Module-by-Module Functional Specifications (30-Module Suite)

### 3.1 Executive & Analytics
- **Admin Dashboard (`/dashboard`):** Real-time financial KPI cards (Total Collection, Product Sales, Service Revenue, Consultation Fees, Gross Sales, Pending Due, GST 5%/18%). Cash vs. Bank collection charts, Payment Mode split pie chart, and live Per-Service Net Profitability analysis (`Gross - Prod. Cost = Net`).
- **Marketing Dashboard (`/marketing-dashboard`):** Campaign ROI, lead attribution across channels (Walk-in, Instagram, Google, Referral), and cost-per-lead analytics.
- **Staff & Performance (`/performance`):** Conversion rates, Doctor-to-Counselor pitch funnels, treatment execution counts, and therapist commission calculations.
- **Profitability (`/profitability`):** Treatment margin analysis, consumable cost ratio tracking, and department-level profit/loss.

### 3.2 Front Office & CRM
- **Reception Desk (`/reception`):**
  - Walk-in queue and daily patient check-in board.
  - Smart Routing Engine: routes patients to Doctor Consultation (`waiting`), Counselor Pricing (`counselor`), or Direct Treatment (`treatment`).
  - Prescription Quick-Action preview and printing.
  - **Integrated Digital Patient Registration Form:** Fast-track touch-friendly modal capturing patient demographics, contact details, Fitzpatrick skin type, area of interest, chief complaints, allergies, and referral source with 1-click **"Register & Check-In"**.
- **Appointments (`/appointments`):** Interactive smart calendar, practitioner time slots, treatment room allocation, and automated SMS/WhatsApp reminders.
- **Customers / CRM (`/customers`):** B2C client drawer, transaction ledger, active service wallet tracker, package redemption history, and direct digital registration launcher.
- **Follow-Up Desk (`/follow-ups`):** Post-procedure check-ins, automated recall rules based on service gap days (e.g. 21 days for PRP, 30 days for Q-Switch).
- **Scheduling Rules (`/scheduler-rules`):** Clinic timing boundaries, doctor availability rules, and buffer times.

### 3.3 Clinical & Floor Operations
- **Doctor Consultation Room (`/doctor-room`):**
  - **Benchmark Clinical Studio:**
    1. **1-Click Dermatology Quick-Rx Templates:** Pre-configured clinical treatment regimens for Acne & Post-Acne Scars, Melasma & Pigmentation (Q-Switch), Androgenetic Alopecia (PRP+GFC), Anti-Aging (Botox+HIFU), and Glass Skin MediFacial.
    2. **Interactive Facial Anatomical Charting:** Clickable SVG facial diagram mapping Botox injection units, Dermal Filler volume (ml), and Laser fluence (J/cm²) with coordinate saving.
    3. **Visual Before & After Photo Comparison:** Side-by-side split slider comparison for aesthetic documentation.
    4. **Digital Procedure Consent & E-Signature Pad:** Touch/stylus canvas capturing patient signatures embedded directly into digital clinical records.
- **Counselor Room (`/counselor-room`):** Customized package quotation builder, treatment plan pricing, installment structuring, and conversion tracking.
- **Therapist Floor / My Duties (`/duties`):**
  - Live session timer with start/pause/complete actions.
  - Mandatory Consumable/Injectable usage modal: atomic deduction of syringes, cartridges, and serums.
  - Patient OTP verification modal for package session redemptions.
  - Therapist privacy protection: patient contact numbers masked (`******7890`) and financials hidden.
- **Live Clinic Rooms (`/rooms`):** Real-time occupancy status of treatment suites and consultation chambers.

### 3.4 Pharmacy, Billing & Inventory
- **Pharmacy & Dispensary (`/pharmacy`):** Doctor prescription auto-queue, batch-level dispensing, barcode scanning, and medicine labeling.
- **POS / Billing (`/pos`):**
  - Comprehensive checkout supporting Service lines, Retail products, and Treatment Packages.
  - Split payment tender: Cash, Card, UPI, Bank Transfer, Service Wallet redemption, and Credit dues.
  - Real-time stock availability validation.
- **Invoices Hub (`/invoices`):** Search, thermal & A4 print engine, invoice cancellation/voiding with strict audit logging.
- **Purchase Billing (`/purchases`):** Vendor stock-in billing, purchase tax credits (Input GST), batch number and expiry date logging.
- **Master Inventory (`/inventory`):**
  - 5 Dedicated Views: `Retail Products`, `Injectables`, `In-House Consumables`, `Services Master (294)`, and `Dual-Stream Ledger`.
  - Stream A (Retail Sales) vs. Stream B (Internal Treatment Consumption) tracking.
  - Low stock (< 5 units) and near-expiry alerts (30, 60, 90 days).

### 3.5 Finance, Compliance & Admin
- **Accounting Vouchers (`/vouchers`):** Double-entry accounting engine generating Tally-compatible vouchers (Payment, Receipt, Journal, Contra).
- **Indirect Expenses (`/expenses`):** Operational clinic overhead logging with category classification and receipt uploads.
- **Bank Reconciliation (`/reconciliation`):** Bank statement statement import, auto-match with POS collections, and suspense clearance.
- **GST & Tax Export Hub (`/export`):** GSTR-1 (B2B, B2C Large, B2C Small), GSTR-3B summary, and CA-ready Excel audit workbooks.
- **Data Import & Review (`/ingest`, `/import-review`):** Bulk CSV data migration and staging review queue.
- **Staff & User Roles (`/staff`, `/users`):**
  - Granular RBAC permissions across 8 distinct roles.
  - Super Admin Role Impersonation switcher.
  - Per-Staff Billing Lock (`can_bill`) and Global Clinic Maintenance Mode toggle.

---

## 4. GST & Accounting Business Logic

### 4.1 GST Slab Calculation Rules
- **Services (SAC 999312):** Standard 18% GST (9% CGST + 9% SGST for intra-state Haryana `06`; 18% IGST for interstate).
- **Medicines & Skincare (HSN 3004 / 3304):** 5%, 12%, or 18% GST depending on item master classification.
- **Tax Mode Calculation:**
  $$\text{Taxable Amount} = \frac{\text{Gross Total}}{1 + \text{GST Rate}}$$
  $$\text{CGST} = \text{SGST} = \frac{\text{Taxable Amount} \times \text{GST Rate}}{2}$$

### 4.2 Automated Dual-Stream Inventory Logic
- **Stream A (Retail Sales):** Deducted atomically at POS invoice generation. Generates sales revenue and reduces retail balance.
- **Stream B (Clinical In-House Consumption):** Deducted by therapists upon treatment completion in `/duties`. Recorded in `service_consumption`, `consumption_logs`, and `inventory_ledger`. Directly flows into the Dashboard's **Per-Service Net Profitability** engine to calculate true gross margins.

---

## 5. Local Setup & Verification

- **Local Development Server:** `http://localhost:3000`
- **Isolated Local Supabase Endpoint:** `http://127.0.0.1:54321`
- **Local SQLite Database:** `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\erp\isolated_mediglo_harmony.db`
- **TypeScript Verification:** Passed with `0` errors (`tsc --noEmit` exit code 0).
- **Live MGHYN Protection:** Verified untouched (29-Oct invoices remain intact at ₹82,584 gross total).
