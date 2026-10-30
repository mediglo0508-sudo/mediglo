# Project: MediGlo Harmony ERP Full Isolation & Launch

## Architecture
- **Monorepo Structure**: `apps/erp` (React 18 + Vite SPA), `apps/mghyn` (legacy Next.js/Supabase tracker).
- **Database Architecture**:
  - Isolated Local Supabase Adapter (`scripts/local-supabase-server.mjs`) on `http://127.0.0.1:54321` backed by native SQLite (`node:sqlite`).
  - Completely disconnected from live production database (`wrjhdtdlxekackjdsjpf`).
  - PostgREST REST interface (`/rest/v1/*`) and GoTrue Auth interface (`/auth/v1/*`).
  - Zero transactional rows (`invoices`, `appointments`, `pos_bills`, `vouchers`, `expenses` return `[]`).
- **Authentication**:
  - `admin@mediglo.in` (`AdminPassword2026!`) with admin role and billing privileges.
  - 16 staff accounts with password `MediGlo@12345`.
  - Roles mapped via `user_roles` and `profiles`.
- **Frontend App**:
  - `apps/erp` served via Vite on `http://localhost:3000`.
  - Dashboard KPI cards (`Total Collection`, `Product Sales`, `Service & Treatments`, `Gross Sale`, `GST`) calculate over zero invoices, rendering ₹0.
  - Master directories (`Services`, `Inventory`, `Customers`) load from seeded master data.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Live DB Disconnection | Disconnect apps/erp from wrjhdtdlxekackjdsjpf and install hard-fail guards | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Isolated Database & Auth Engine | Spin up local Supabase/SQLite adapter on port 54321 supporting REST & Auth | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Staff & Admin Auth Seeding | Seed admin@mediglo.in and 16 staff accounts with prescribed credentials | M1 | ORIGINAL_REQUEST §R2 |
| 4 | Master Data Seeding | Seed 294 services, 361 inventory (stock=0), 968 customers (balance=0), categories, brands, rooms | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Zero Transactional Invariance | Ensure 0 invoices, 0 appointments, 0 vouchers, 0 batches across all tables | M1 | ORIGINAL_REQUEST §R2 |
| 6 | ERP UI & Auth Wire-up | Fix apps/erp auth hook and vite build configuration for clean execution | M2 | Survey Explorer 2 |
| 7 | Dashboard ₹0 KPI Display | Verify all dashboard cards display ₹0 due to zero transactional data | M2 | ORIGINAL_REQUEST §Acceptance Criteria |
| 8 | Master Catalog Directory Display | Verify Services (294), Inventory (361), Customers (968) load accurately | M2 | ORIGINAL_REQUEST §Acceptance Criteria |
| 9 | Localhost:3000 Deployment | Launch apps/erp in background on http://localhost:3000 | M2 | ORIGINAL_REQUEST §R3 |
| 10 | PRD Delivery to Downloads | Copy COMPLETE_SOFTWARE_PRD.md to C:\Users\Vikas Koul\Downloads | M2 | ORIGINAL_REQUEST §R3 |
| 11 | Dedicated GitHub Repository Push | Push finalized code to mediglo0508-sudo/mediglo-harmony-erp | M2 | ORIGINAL_REQUEST §R3 |
| 12 | Live DB Untouched Verification | Verify 2026-10-29 metrics (4 invoices, ₹82,584 gross, ₹2,504.08 GST) on wrjhdtdlxekackjdsjpf | M3 | ORIGINAL_REQUEST §Acceptance Criteria |
| 13 | Forensic Integrity Audit | Independent verification of zero cheating, genuine implementation, and isolation | M3 | Integrity Forensics |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Isolated DB, Auth & Master Data Seeding | Local Supabase adapter on port 54321, copy live_export to workspace root, seed 294 services, 361 inventory (stock=0), 968 customers (balance=0), categories, brands, rooms, admin & 16 staff auth, repoint .env, hard-fail guards | none | IN_PROGRESS |
| M2 | ERP Client Config, Port 3000 Launch & Delivery | Reconcile Vite config & auth hook, start apps/erp on http://localhost:3000, verify ₹0 KPIs & master directories, deliver PRD, push to dedicated repo | M1 | PLANNED |
| M3 | Comprehensive E2E Verification & Forensic Audit | E2E validation of all acceptance criteria, baseline check of live DB wrjhdtdlxekackjdsjpf, forensic audit | M2 | PLANNED |

## Interface Contracts
### Isolated DB ↔ apps/erp
- PostgREST endpoint: `http://127.0.0.1:54321/rest/v1/*`
- Auth endpoint: `http://127.0.0.1:54321/auth/v1/*`
- Headers: `apikey`, `Authorization: Bearer <token>`, `Prefer: count=exact`
- Data formats: JSON matching `apps/erp/src/integrations/supabase/types.ts`

### apps/erp ↔ Browser User
- URL: `http://localhost:3000`
- Credentials:
  - Admin: `admin@mediglo.in` / `AdminPassword2026!`
  - Staff: e.g. `reception@mediglo.in` / `MediGlo@12345`

## Code Layout
- `scripts/local-supabase-server.mjs`: Local isolated Supabase REST & Auth server
- `live_export/`: Master data JSON files (copied to workspace root)
- `export_masters_readonly.mjs`: Read-only live DB verification script (copied to workspace root)
- `apps/erp/.env`: Repointed to local isolated database (`http://127.0.0.1:54321`)
- `apps/erp/.env.local`: Repointed to local isolated database (`http://127.0.0.1:54321`)
- `apps/erp/src/`: MediGlo Harmony ERP source files
