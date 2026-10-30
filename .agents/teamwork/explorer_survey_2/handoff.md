# Handoff Report — Explorer 2: apps/erp Architecture, Schema, Authentication & KPI Dashboards

## 1. Observation

### 1.1 Directory Structure, package.json, Dependencies & Scripts
- **Workspace Location**: `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\apps\erp`
- **Configuration & Entry**:
  - `index.html`: Line 11 loads `<script type="module" src="/src/main.tsx"></script>`.
  - `src/main.tsx`: Lines 19-30 mount `ReactDOM.createRoot` with `QueryClientProvider`, `BrowserRouter`, `AuthProvider`, and `<App />`.
  - `src/App.tsx`: Lines 21-150 define declarative routes via `react-router-dom` v6 (`/login` -> `LoginPage`, `/` -> `DashboardPage`, `/appointments`, `/customers`, `/doctor-room`, `/counselor-room`, `/therapist-floor`, `/pharmacy`, `/billing`, `/purchase-billing`, `/inventory`, `/accounting`, `/expenses`, `/analytics`, `/tax-export`, `/staff`).
  - `package.json`:
    - Name: `"@mediglo/erp"`, Version: `"0.1.0"`, Type: `"module"`.
    - Scripts: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"preview": "vite preview"`, `"lint": "tsc --noEmit"`.
    - Dependencies: `react@^18.3.1`, `react-dom@^18.3.1`, `react-router-dom@^6.26.2`, `@tanstack/react-query@^5.59.0`, `@supabase/supabase-js@^2.45.4`, `@radix-ui/*`, `lucide-react@^0.446.0`, `recharts@^2.12.7`, `sonner@^1.5.0`, `tailwind-merge@^2.5.2`, `clsx@^2.1.1`, `@mediglo/shared-types: "*"`.
    - DevDependencies: `vite@^5.4.6`, `@vitejs/plugin-react@^4.3.1`, `typescript@^5.6.2`, `tailwindcss@^3.4.12`.
- **Vite Configurations**:
  - `vite.config.js`: Lines 1-20 configure Vite with `@vitejs/plugin-react`, path alias `@ -> ./src`, `server: { port: 5173 }`, `build: { outDir: "dist" }`.
  - `vite.config.ts`: Lines 1-24 configure `@lovable.dev/vite-tanstack-config` with `server: { port: 3000 }` (copied from `apps/mghyn`).
- **Git Commit 72ec6d3 Collision**:
  - Git commit `72ec6d3513b6fe3fd7b78f281cef28e1a9879421` ("feat(erp+mghyn): complete 30-module MGHYN + MediGlo Harmony merger...") copied `src/routes/` (30 TanStack Start routes) and server wrappers (`src/server.ts`, `src/start.ts`) into `apps/erp`, while `apps/erp/package.json` was kept as a React 18 SPA without `@tanstack/react-start`.
  - In addition, commit `72ec6d3` replaced `src/lib/utils.ts` (stripping `formatINR`, `formatDate`, `todayIST`, etc.) and replaced `src/lib/auth.tsx` (stripping `signInWithPassword` and `signUp`).

### 1.2 Schema Definitions and Migrations
- **Supabase Migrations Directory (`apps/erp/supabase/migrations/`)**:
  - 116 timestamped SQL migration files (`20260613171805_...` to `20260917100625_...`), identical to `apps/mghyn/supabase/migrations/`.
  - Initial migration `20260613171805_6a3be30e-edba-4a4d-b72d-fd310dd979e4.sql`:
    - `public.profiles` (Lines 13-19): `id UUID PRIMARY KEY REFERENCES auth.users`, `full_name`, `phone`.
    - `public.user_roles` (Lines 25-31): `id`, `user_id REFERENCES auth.users`, `role app_role`.
    - `public.staff` (Lines 80-86): `id`, `name`, `role_title`, `active`.
    - `public.services_master` (Lines 94-100): `id`, `category`, `name`, `sac_code`, `gst_rate`, `default_price`.
  - Master migrations:
    - `public.inventory_brands` and `public.inventory_categories`: defined in `20260728124932_6eea1c56-f8e6-49b6-9875-fe35781c1f4a.sql` (Lines 2-8, 28-36).
    - `public.clinic_rooms`: defined in `20260622114914_5c264237-66d3-4b9f-8383-9fc889d6e17e.sql` (Line 33).
    - `public.treatment_rooms`: defined in `20260616121214_e7a17237-0cb9-4a79-a670-8d495bdd7b72.sql` (Line 51).
- **Legacy Sequential Migrations (`apps/erp/supabase/legacy_v1_migrations/`)**:
  - 11 ordered files (`0001_extensions_roles.sql` through `0011_production_hardening.sql`) which were verified and tested in `README.md` against a standalone Postgres instance using `apps/erp/supabase/test/00_auth_shim.sql` and `01_e2e_workflow.sql`.
- **Database Types Interface (`apps/erp/src/integrations/supabase/types.ts`)**:
  - 4,380 lines defining ~78 tables, enums, functions, and composite types.

### 1.3 Authentication & User Verification
- **Credential Storage**: Credentials (`email`, `password`) are maintained in Supabase Auth's `auth.users` table.
- **Role & Authorization Model**:
  - `auth.users.id` links to `public.user_roles(user_id, role)`. Roles: `'admin'`, `'doctor'`, `'reception'`, `'accountant'`, `'counselor'`, `'therapist'`, `'pharmacist'`, etc.
  - Linked to `public.profiles` (`full_name`, `phone`) and `public.staff` (clinic roster).
  - RLS functions: `public.has_role(auth.uid(), 'admin')`, `app_private.has_role(...)`, `public.is_finance(auth.uid())`, `public.my_billing_access()`.
- **Root Admin Override**:
  - In `apps/erp/src/lib/auth.tsx` Line 59-63: `ROOT_ADMIN_EMAILS = new Set(["admin@mediglo.in", "himuydv5@gmail.com", "vikas@mediglo.in"])`. If no row in `user_roles`, falls back to granting the `admin` role in the frontend.
  - In `20260613171805_6a3be30e-edba-4a4d-b72d-fd310dd979e4.sql` Lines 61-72: `handle_new_user()` trigger auto-assigns `'admin'` to the first user created in `auth.users`.
- **Login Page Workflow (`apps/erp/src/pages/LoginPage.tsx`)**:
  - Lines 23-32: Calls `signInWithPassword(email, password)` on form submission.
  - Underneath, this triggers `supabase.auth.signInWithPassword({ email, password })`.
  - On auth state change, session is saved in browser storage, `user_roles` and `profiles` are fetched, and user is redirected to `/`.

### 1.4 Dashboard KPI Cards & ₹0 Logic
- **Component & Source Queries**:
  - File: `apps/erp/src/routes/_authenticated/dashboard.tsx` (and `apps/erp/src/pages/DashboardPage.tsx`).
  - Line 103-110: `supabase.from("invoices").select("id, invoice_no, gross_total, base_amount, cgst, sgst, discount_amount, paid_amount, pending_balance, payment_mode, customer_name, assigned_staff, invoice_date").is("voided_at", null).gte("invoice_date", range.from).lte("invoice_date", range.to)`.
  - Line 118-123: `supabase.from("invoice_lines").select("description, item_category, line_total, base_amount, invoice_id, qty, unit_price").in("invoice_id", invIds)`.
  - Line 113-116: `supabase.from("expenses").select("amount").gte("expense_date", range.from).lte("expense_date", range.to)`.
- **Calculations Feeding the 5 Main Cards**:
  1. **Total Collection**: `invoices.reduce((s, r) => s + Number(r.paid_amount || r.gross_total), 0)` (Line 178).
  2. **Product Sales**: `splitInvoiceRevenue()` on lines categorized as `"product"` via `lineCategory()` (Lines 167-173).
  3. **Service & Treatments**: `splitInvoiceRevenue()` on lines categorized as `"service"` (treatment lines) (Lines 167-174).
  4. **Gross Sale**: `invoices.reduce((s, r) => s + Number(r.gross_total), 0)` (Line 177).
  5. **GST**: `invoices.reduce((s, r) => s + Number(r.cgst) + Number(r.sgst), 0)` (Line 180).
- **Data Condition for ₹0**:
  - When `invoices` contains 0 rows, `invIds` is empty, `invoices.reduce(...)` returns 0 for all sums, `productSales` = 0, `serviceSales` = 0.
  - The formatter `inr(0)` returns `"₹0"` (or `"₹0.00"`).
  - Therefore, having zero transactional invoices guarantees all KPI cards display ₹0.

### 1.5 Master Directories Data Loading
- **Services (294)**:
  - Table: `public.services_master`.
  - Query: `supabase.from("services_master").select("*").eq("active", true).order("category").order("name")`.
- **Inventory Items (361)**:
  - Table: `public.inventory`.
  - Query: `supabase.from("inventory").select("*").eq("active", true)`.
  - Batches: `public.inventory_batches` (0 batches, starting stock = 0).
- **Customers (968)**:
  - Table: `public.customers`.
  - Query: `supabase.from("customers").select("*").order("name")` (or ordered by `created_at desc`). Outstanding balance = 0.
- **Categories (13)**:
  - Table: `public.inventory_categories`.
  - Query: `supabase.from("inventory_categories").select("*").order("name")`.
- **Brands (33)**:
  - Table: `public.inventory_brands`.
  - Query: `supabase.from("inventory_brands").select("*").order("name")`.
- **Rooms (8 + 4 = 12)**:
  - Tables: `public.clinic_rooms` (8 rooms) and `public.treatment_rooms` (4 rooms).
  - Queries: `supabase.from("clinic_rooms").select("*")` and `supabase.from("treatment_rooms").select("*")`.

### 1.6 Default Port and Dev Server Launch
- `apps/erp/package.json` specifies `"dev": "vite"`.
- `apps/erp/vite.config.js` specifies `server: { port: 5173 }`.
- System port probe using `netstat -ano | findstr :3000` and PowerShell confirmed **neither port 3000 nor port 3001 is currently occupied**.
- To run on `http://localhost:3000`:
  - Run with explicit port flag: `npx vite --port 3000 --host 0.0.0.0` or configure `server: { port: 3000, host: "0.0.0.0" }` in `vite.config.js`.

---

## 2. Logic Chain

1. **Protection of Live Database**:
   - `apps/erp/.env` and `apps/erp/.env.local` currently contain `https://wrjhdtdlxekackjdsjpf.supabase.co`.
   - Before executing `apps/erp` or any write/seed scripts, these `.env` files must be reconfigured to point exclusively to the isolated database, ensuring the live database remains 100% untouched.

2. **Schema Alignment for Master Data Seeding**:
   - The master export counts (294 services, 361 inventory items, 968 customers, 13 categories, 33 brands, 8+4 rooms) map 1:1 to:
     - `public.services_master`
     - `public.inventory`
     - `public.customers`
     - `public.inventory_categories`
     - `public.inventory_brands`
     - `public.clinic_rooms` and `public.treatment_rooms`
   - These tables are all created by applying the migrations in `apps/erp/supabase/migrations/` (or the consolidated `apps/erp/supabase/legacy_v1_migrations/`).

3. **Authentication Setup**:
   - Seeding `admin@mediglo.in` and 16 staff accounts requires creating the records in `auth.users`, followed by inserting their roles in `public.user_roles`, and profiles in `public.profiles` / `public.staff`.
   - The login page authenticates via Supabase Auth `signInWithPassword`. Once authenticated, the app queries `user_roles` to verify the user's role badge and allow access through `ProtectedRoute`.

4. **Dashboard Zero-State Guarantee**:
   - Dashboard KPI calculations are direct aggregations of `invoices.gross_total`, `invoices.paid_amount`, `invoices.cgst + invoices.sgst`, and `invoice_lines`.
   - By seeding exclusively the master tables and omitting any insert into `invoices`, `invoice_lines`, `payments`, `expenses`, or `vouchers`, the dashboard queries will return empty sets and display ₹0 across all KPI cards.

5. **Clean Dev Launch on Port 3000**:
   - Because port 3000 is verified free, launching `vite dev --port 3000 --host 0.0.0.0` will immediately bind to `http://localhost:3000`.
   - Fixing the merge regressions in `utils.ts` and `auth.tsx` will allow `apps/erp` to compile and run without runtime or type errors.

---

## 3. Caveats

- **Merge Inconsistency in `apps/erp`**: Commit `72ec6d3` copied TanStack Start files into `apps/erp` without installing `@tanstack/react-start` or React 19. The application entry point (`index.html` -> `main.tsx` -> `App.tsx`) is designed as a React 18 SPA using `react-router-dom`. The implementation team must either:
  1. Run `apps/erp` as the React 18 SPA (restoring the missing helpers in `utils.ts` and `auth.tsx`, and excluding `src/routes/` from `tsconfig.json`), OR
  2. Upgrade `apps/erp` dependencies to match `apps/mghyn` (Vite 7, TanStack Start, React 19).
  Option 1 is significantly simpler and immediately stable.
- **Live Database Safeguard**: Any scripts created for migration or seeding must include a guard asserting `!targetUrl.includes("wrjhdtdlxekackjdsjpf")`.

---

## 4. Conclusion

- `apps/erp` is a complete clinic ERP with master catalogs, authentication, role-based routing, and financial dashboards.
- All 30 modules and master tables are supported by the Supabase migrations located in `apps/erp/supabase/migrations/` (116 files) and `apps/erp/supabase/legacy_v1_migrations/` (11 files).
- Authentication relies on Supabase Auth `auth.users` paired with `public.user_roles` and `public.profiles`.
- KPI cards query `invoices`, `invoice_lines`, and `expenses`. Seeding master data with zero transaction rows guarantees they display ₹0.
- Port 3000 is completely unoccupied and ready for clean launch.

---

## 5. Verification Method

To independently verify the observations:
1. **Check Port Availability**:
   ```powershell
   cmd.exe /c "netstat -ano | findstr :3000"
   ```
   (Outputs nothing, confirming port 3000 is free).
2. **Inspect Migration Table Definitions**:
   ```powershell
   findstr /i "CREATE TABLE.*inventory_brands" apps\erp\supabase\migrations\*.sql
   findstr /i "CREATE TABLE.*services_master" apps\erp\supabase\migrations\*.sql
   ```
3. **Verify Dashboard KPI Logic**:
   Inspect `apps/erp/src/routes/_authenticated/dashboard.tsx` lines 103-120 and 177-182 to confirm aggregations over `invoices`.
4. **Verify Live Database Reference**:
   Inspect `apps/erp/.env` line 3: confirms `SUPABASE_URL="https://wrjhdtdlxekackjdsjpf.supabase.co"`.
