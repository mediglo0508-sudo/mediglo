# MGHYN Clinic ERP (MediGlo Harmony) — Complete Software PRD & Architecture Handover Package

**Document Version:** 3.0.0-Production (Full 28-Module MGHYN Edition)  
**Date of Release:** October 26, 2026  
**System Classification:** Enterprise Healthcare ERP, Point-of-Sale (POS), Clinical EMR, Double-Entry Accounting & Bank Reconciliation System  
**Deployment Model:** 100% Sovereign Localhost Architecture (`http://localhost:3000`) with Zero Cloud Hosting Fees  
**Cloud Backend Engine:** Supabase PostgreSQL 15 Database Cluster (`wrjhdtdlxekackjdsjpf`)  
**Git Organization:** [mediglo0508-sudo](https://github.com/mediglo0508-sudo)  

---

## 1. Executive Summary & Architectural Overview

The **MGHYN Clinic ERP (MediGlo Harmony)** is a full-stack healthcare operations, clinical EMR, pharmacy, CRM, and double-entry financial accounting platform engineered for multi-specialty aesthetic, dermatology, wellness, and medical clinics. Built with **TanStack Start (SSR + Server Functions), React 19, Vite 7, Tailwind CSS v4**, and **Supabase PostgreSQL 15**, the platform consolidates **28 operational modules** under a unified dark-maroon (`#3E1119`) and soft-rose clinical theme.

### 1.1 Sovereign Localhost Execution Architecture
```
                                  +------------------------------------+
                                  |     GitHub Repositories            |
                                  |  mediglo / mediglo-platform        |
                                  |  mediglo-vision (origin/claude)    |
                                  +-----------------+------------------+
                                                    |  Git Push / Pull
                                                    v
+-----------------------------+        +------------------------------------+
|   Localhost Server (Host)   |        |   Supabase Database Backend        |
|   TanStack Start + React 19 |<------>|   PostgreSQL 15 Cluster (60 Tables)|
|   Port 3000 (0.0.0.0)       | HTTPS  |   Project: wrjhdtdlxekackjdsjpf    |
|   Zero Cloud Hosting Fees   |        |   11 RPCs + RLS + Edge Functions   |
+-----------------------------+        +------------------------------------+
        |
        +---- Executive Dashboards (Dashboard, Marketing & Sales, Staff Performance)
        |
        +---- Front Desk & Clinical (Reception, Appointments, Doctor, Counselor, Rooms)
        |
        +---- Billing & CRM (POS / Billing, Invoices, Customers 360, Print Studio)
        |
        +---- Pharmacy & Inventory (Pharmacy, Inventory + Ledger, Purchases + Stock-In)
        |
        +---- Accounting & Tax (Vouchers, Expenses, Bank Reconciliation, Tax Export)
        |
        +---- Data & Security (Data Import, Import Review, Staff, User Roles + Lock)
```

---

## 2. GitHub Repositories & Local Codebase Registry

| Repository Name | GitHub Remote URL | Role & Contents | Branch |
| :--- | :--- | :--- | :--- |
| **`mediglo`** (Primary) | [https://github.com/mediglo0508-sudo/mediglo.git](https://github.com/mediglo0508-sudo/mediglo.git) | **Primary Production Monorepo**: Full 28-module MGHYN Clinic ERP (`apps/mghyn`), legacy ERP (`apps/erp`), shared types, and instant launch scripts. | `main` |
| **`mediglo-platform`** | [https://github.com/mediglo0508-sudo/mediglo-platform.git](https://github.com/mediglo0508-sudo/mediglo-platform.git) | **Platform Distribution Mirror**: Synchronized workspace mirror containing full source code and build configurations. | `main` |
| **`mediglo-vision`** | [https://github.com/mediglo0508-sudo/mediglo-vision.git](https://github.com/mediglo0508-sudo/mediglo-vision.git) | **Upstream Lovable Source Repository**: Contains `origin/claude` (`625b92f`) with the 28-module TanStack Start architecture and 37 Supabase migrations. | `claude` / `main` |
| **`minou-nails-billing`** | [https://github.com/mediglo0508-sudo/minou-nails-billing.git](https://github.com/mediglo0508-sudo/minou-nails-billing.git) | **Standalone Salon POS**: Offline-first salon billing application with local SQLite engine and thermal receipt printing. | `main` |

### Local Machine Directory Mapping
- **Workspace Root:** `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel`
- **Active MGHYN 28-Module Application (`localhost:3000`):** `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\mghyn`
- **Legacy SPA Workspace:** `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\erp`
- **Upstream Lovable Clone:** `C:\Users\Vikas Koul\OneDrive\Documents\GitHub\mediglo-vision`

---

## 3. Global AppShell, Theme & Top Action Bar (`src/routes/_authenticated/route.tsx`)

- **Color Palette & Typography:**
  - Deep Maroon Sidebar (`--sidebar-background: 348 56% 16%` / `#3E1119`), Gold Accents (`--sidebar-primary: 38 75% 60%`), Soft Rose-White Main Canvas (`--background: 350 30% 98%`), and `Manrope` typography.
- **Top Header Action Bar:**
  1. **Active Staff & Role Pill:** Displays logged-in user name and role badge (`Admin / Director`, `Doctor`, `Counselor`, `Therapist`, `Reception`, `Pharmacist`, `Accountant`).
  2. **AI Manager (`AIManagerDrawer.tsx`):** Slide-over executive AI copilot that analyzes live clinic revenue, low stock alerts, unpaid invoices, and pending follow-ups.
  3. **Internal Team Chat (`ChatBox.tsx`):** Real-time clinic messaging across rooms and staff members (`chat_messages`).
  4. **Notification Center (`NotificationBell.tsx`):** Real-time alert bell with unread count badge (`notifications`) for patient check-ins, low inventory, and pending approvals.
  5. **Install App (`DownloadAppButton.tsx`):** PWA installation trigger for desktop/tablet clinic kiosks.
  6. **Change Password (`ChangePasswordDialog.tsx`):** Self-service password update modal.

---

## 4. Complete 28-Module Functional Breakdown (`apps/mghyn/src/routes/_authenticated/`)

### 4.1 Executive Dashboards & CRM Follow-Ups
1. **Dashboard (`/dashboard` — `dashboard.tsx`):**
   - **Date Range Filter Bar:** Presets for `Today`, `Yesterday`, `This Month`, `Last Month`, `This Quarter`, `Financial Year (Apr-Mar)`, `All Time`, plus Custom From/To date pickers and `Refresh`.
   - **8 Financial KPI Cards (with Double-Click Patient Breakdown Modal):**
     1. **Total Revenue (All Bills):** Gross billed across active invoices + double-click modal listing every patient invoice and payment mode.
     2. **Cash Collected:** Total cash + bank/card/UPI payments actually received (`paid_amount`).
     3. **Pending Balance (Receivables):** Unpaid balance on part-paid and pending bills (`balance_amount`), with aging bucket badges (`0-30d`, `31-60d`, `60d+`) and one-click `Collect Balance` action.
     4. **Advance Collected:** Deposits and package advances collected ahead of service delivery (`customer_advances`).
     5. **Product Expenses (Purchases):** Stock & consumable inward bills + non-product vendor bills.
     6. **Daily Clinic Expenses:** Tea, utilities, transport, maintenance, petty cash (`daily_expenses`).
     7. **GST Collected (Output Tax):** CGST + SGST + IGST billed to customers, netted against Input Tax Credit (ITC) on purchases.
     8. **Net Cash-in-Hand:** Real-time calculation of `Cash Collected - Product Purchases - Daily Clinic Expenses` with profit margin badge.
   - **Visualizations & Profitability Table:**
     - **Cash Collected vs Expenses (Last 6 Months):** Grouped bar chart comparing `Collected` vs `Purchases + Expenses`.
     - **Payment Mode Split:** Donut chart breaking down `Cash`, `UPI`, `Card`, `Bank Transfer / NEFT`, and `Cheque`.
     - **Per-Service Net Profitability Table:** Searchable table sorting services by net profit (`Gross Revenue - Refunded - Consumable Cost = Net Profit` and `Margin %`).
     - **Bottom Summary Cards:** `Top Selling Treatments`, `Low Stock Alerts`, and `Pending Invoices (Action Required)` with direct `Collect` buttons.

2. **Marketing & Sales Dashboard (`/marketing-dashboard` — `marketing-dashboard.tsx`):**
   - Conversion funnel analytics across lead sources (`Walk-In`, `Instagram`, `Google Ads`, `Referral`, `WhatsApp`), counselor conversion rates, package sales velocity, and campaign ROI.

3. **Staff Performance (`/performance` — `performance.tsx`):**
   - Doctor, Counselor, and Therapist leaderboard tracking revenue generated, procedures completed, patient ratings, and commission calculations.

4. **Follow-Ups (`/follow-ups` — `follow-ups.tsx`):**
   - Dedicated CRM queue (`follow_ups`) for post-procedure check-ins, payment reminders, package renewals, and win-back calls with status tracking (`pending`, `contacted`, `converted`, `closed`).

### 4.2 Front Desk, Clinical Rooms & Floor Operations
5. **Reception (`/reception` — `reception.tsx`):**
   - Fast patient registration, MRN lookup, walk-in token generation, appointment check-in, and room assignment.
6. **Appointments (`/appointments` — `appointments.tsx`):**
   - Multi-resource calendar across Doctors, Therapists, and Treatment Rooms (`appointments`), enforcing conflict rules and room capacity.
7. **Doctor Room (`/doctor-room` — `doctor-room.tsx`):**
   - Clinical EMR workstation (`clinical_notes`, `prescriptions`, `prescription_items`) with chief complaints, vitals, diagnosis, before/after photo comparison, e-Prescription builder linked to live pharmacy stock, and room call buttons.
8. **Counselor Room (`/counselor-room` — `counselor-room.tsx`):**
   - Treatment quotation builder, multi-session package pitch deck, counselor-specific pricing/discount guardrails (`counselor_service_prices`), and one-click conversion to POS or Service Wallets.
9. **Consultation Log (`/consultation` — `consultation.tsx`):**
   - Complete historical archive of all clinical consultations, prescriptions, and treatment notes across all doctors.
10. **My Duties (`/duties` — `duties.tsx`):**
    - Personal daily task & procedure queue (`staff_duties`) for therapists and clinic floor staff, including wallet session consumption and procedure consumable deduction.
11. **Live Rooms (`/rooms` — `rooms.tsx`):**
    - Real-time status board of all clinic rooms (`clinic_rooms`, `room_calls`) showing current occupant, assigned doctor/therapist, active procedure timer, and call-bell alerts.
12. **Pharmacy (`/pharmacy` — `pharmacy.tsx`):**
    - Live prescription dispensation queue synced with Doctor Room e-Rx orders, batch/expiry FIFO validation, and OTC medicine counter sales.

### 4.3 Billing, CRM, Print Studio & Catalogs
13. **POS / Billing (`/pos` — `pos.tsx`):**
    - Multi-category billing terminal (`Services`, `Packages`, `Pharmacy/Products`), duplicate bill detection (`check_duplicate_bill` RPC), split-tender payments (`Cash`, `UPI`, `Card`, `NEFT`, `Wallet`), advance adjustment, and GST calculation.
14. **Invoices (`/invoices` — `invoices.tsx`):**
    - Master invoice register (`2,112+` clinic invoices) with search, date filters, payment collection on pending balances, invoice revision (`revise_invoice` RPC with immutable `invoice_revisions` history), and voiding (`void_invoice` RPC).
15. **Customers (`/customers` — `customers.tsx`):**
    - Customer 360 profile directory (`customers`), lifetime spend, visit history, active `service_wallets` & remaining package sessions, `customer_advances`, and clinical documents.
16. **Print Studio (`/template-studio` — `template-studio.tsx`):**
    - Visual drag-and-drop / customizable template designer (`print_templates`, `clinic_settings`) for Thermal Receipts, A4 Tax Invoices, Prescriptions, and Consent Forms with clinic logo and GSTIN headers.
17. **Services (`/services` — `services.tsx`):**
    - Master clinical procedure & treatment catalog (`services`) with SAC codes, base prices, GST rates, duration, and linked default consumables (`service_consumables`).
18. **Packages (`/packages` — `packages.tsx`):**
    - Multi-session treatment bundle builder (`packages`, `package_services`) with validity periods, session counts, and promotional pricing.
19. **Counselor Pricing (`/scheduler-rules` — `scheduler-rules.tsx`):**
    - Granular floor/ceiling price rules (`counselor_service_prices`) and appointment scheduler constraints (`scheduler_rules`).

### 4.4 Inventory, Purchases & Double-Entry Accounting
20. **Inventory (`/inventory` — `inventory.tsx`):**
    - Master stock catalog (`inventory`) with SKU, batch number, expiry date, reorder level alerts, manual stock adjustment, and immutable `inventory_ledger` audit history.
21. **Purchases (`/purchases` — `purchases.tsx`):**
    - Supplier purchase bill entry (`purchases`, `purchase_items`, `vendors`) with **Inventory Product Auto-Suggest** and **Automated Stock-In** (`restock_inventory` RPC + `inventory_ledger` audit entry) upon saving a purchase bill, plus automatic Purchase Voucher generation.
22. **Vouchers (`/vouchers` — `vouchers.tsx`):**
    - Double-entry accounting journal (`vouchers`, `voucher_entries`, `ledgers`) supporting `Sales`, `Purchase`, `Receipt`, `Payment`, `Contra`, and `Journal` vouchers.
23. **Expenses (`/expenses` — `expenses.tsx`):**
    - Daily clinic operational expense tracker (`daily_expenses`) with category classification, payment mode, receipt attachment, and automatic voucher posting.
24. **Bank Reconciliation (`/reconciliation` — `reconciliation.tsx`):**
    - Automated & manual bank statement reconciliation (`bank_statements`, `bank_statement_rows`, `reconciliation_matches`) matching HDFC/ICICI/UPI bank credits against ERP invoices and expenses.
25. **Profitability (`/analytics` — `analytics.tsx`):**
    - Deep financial margin analyzer computing exact procedure-level and category-level profitability after deducting consumable costs (`service_consumables`), therapist commissions, and GST.
26. **Tax Export Hub (`/export` — `export.tsx`):**
    - Statutory CA & tax compliance center exporting GSTR-1 (Sales), GSTR-2/3B (Purchases/ITC), HSN/SAC summaries, and Tally Prime XML/CSV voucher bundles.

### 4.5 Data Migration & Administration
27. **Data Import (`/ingest` — `ingest.tsx`) & Import Review (`/import-review` — `import-review.tsx`):**
    - Multi-format bulk ingestion pipeline (`import_batches`, `import_staging_rows`, `ingest_jobs`) for importing historical Excel/CSV/Tally invoices, patient records, and bank statements with staging validation and duplicate detection before committing to production tables.
28. **Staff (`/staff` — `staff.tsx`) & User Roles (`/users` — `users.tsx`):**
    - Complete employee roster (`staff`), role assignment (`user_roles`: `admin`, `doctor`, `counselor`, `therapist`, `reception`, `pharmacist`, `accountant`), **Per-Staff Billing Lock Toggle** (`set_billing_lock` RPC on `billing_permissions`), Duplicate-Bill Override grant (`set_duplicate_override` RPC), and Global Maintenance Mode (`app_settings`).

---

## 5. Core Business Logic, GST & Accounting Rules

### 5.1 Indian GST Engine
- Supports **0%, 5%, 12%, 18%, and 28%** tax slabs across Services (SAC) and Products (HSN).
- **Intra-State (CGST + SGST)** vs **Inter-State (IGST)** split calculated automatically.
- Supports both **Tax-Inclusive** and **Tax-Exclusive** pricing models:
  $$\text{Taxable Value}_{\text{inclusive}} = \frac{\text{Gross Amount}}{1 + (\text{GST Rate}/100)}, \quad \text{GST Amount} = \text{Gross Amount} - \text{Taxable Value}_{\text{inclusive}}$$

### 5.2 Atomic Inventory & Ledger Pipeline
- **Purchase Inward (`purchases.tsx`):** Calls `restock_inventory` RPC $\rightarrow$ increments `inventory.quantity` $\rightarrow$ writes `purchase_inward` row to `inventory_ledger`.
- **POS Sale (`pos.tsx`) & Pharmacy (`pharmacy.tsx`):** Calls `deduct_inventory_stock` RPC $\rightarrow$ decrements `inventory.quantity` $\rightarrow$ writes `sale` row to `inventory_ledger`.
- **Procedure Consumables (`duties.tsx` / `doctor-room.tsx`):** Deducts linked `service_consumables` and logs `procedure_consumption` in `inventory_ledger`.

---

## 6. Supabase Database & Security Configuration

- **Supabase Project ID:** `wrjhdtdlxekackjdsjpf`
- **Supabase URL:** `https://wrjhdtdlxekackjdsjpf.supabase.co`
- **Database Schema:** 60 tables in `public` schema + 11 PostgreSQL RPC functions (`deduct_inventory_stock`, `restock_inventory`, `set_billing_lock`, `set_duplicate_override`, `my_billing_access`, `check_duplicate_bill`, `revise_invoice`, `void_invoice`, `has_role`, `has_any_role`, `is_finance`).
- **Row-Level Security (RLS) & Super-Admin Account:**
  - **Super-Admin Email:** `admin@mediglo.in`
  - **Super-Admin Password:** `AdminPassword2026!`
  - **User UUID:** `7121b633-836a-4c3d-9461-beb6e19390f9`
  - **Verified Database Role:** Assigned `role = 'admin'` directly in `public.user_roles` and `public.staff`, granting full PostgreSQL RLS access to all **2,112+ clinic invoices**, financial ledgers, and administrative controls.

---

## 7. Local Server Execution Runbook

### 7.1 One-Click Desktop Launchers
- **`RUN_MEDIGLO_LOCAL.bat`**: Starts the full 28-module MGHYN Clinic ERP server on `http://localhost:3000` (and LAN `http://0.0.0.0:3000`).
- **`DEV_MEDIGLO_HOTRELOAD.bat`**: Starts the server in hot-reload development mode on `http://localhost:3000`.

### 7.2 Manual Command-Line Startup
```powershell
cd "c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\mghyn"
& "C:\Program Files\nodejs\node.exe" --env-file=.env ".\node_modules\vite\bin\vite.js" dev --port 3000 --host 0.0.0.0
```

---
*Signed & Verified for Production Handover — MediGlo Harmony / MGHYN Engineering Group*
