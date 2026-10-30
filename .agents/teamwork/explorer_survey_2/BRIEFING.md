# BRIEFING — 2026-10-30T07:22:00Z

## Mission
Investigate `apps/erp` architecture, schema, migrations, authentication, and KPI dashboards.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, analysis, synthesis
- Working directory: c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\.agents\teamwork\explorer_survey_2\
- Original parent: 933d7c98-dc10-4198-967e-9a3c1465d1a9
- Milestone: Survey & Schema Analysis

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- The live MGHYN database (`wrjhdtdlxekackjdsjpf`) must remain 100% untouched and in read-only state
- Do NOT modify any source code files or database records
- Write metadata only to own directory (.agents/teamwork/explorer_survey_2/)

## Current Parent
- Conversation ID: 933d7c98-dc10-4198-967e-9a3c1465d1a9
- Updated: 2026-10-30T07:11:32Z

## Investigation State
- **Explored paths**:
  - `apps/erp/package.json`, `apps/erp/vite.config.*`, `apps/erp/tsconfig.json`, `apps/erp/index.html`
  - `apps/erp/src/main.tsx`, `apps/erp/src/App.tsx`, `apps/erp/src/lib/auth.tsx`, `apps/erp/src/lib/supabase.ts`
  - `apps/erp/src/integrations/supabase/client.ts`, `apps/erp/src/integrations/supabase/types.ts`
  - `apps/erp/src/pages/DashboardPage.tsx`, `apps/erp/src/routes/_authenticated/dashboard.tsx`
  - `apps/erp/src/pages/CustomersPage.tsx`, `apps/erp/src/pages/InventoryPage.tsx`, `apps/erp/src/routes/_authenticated/services.tsx`
  - `apps/erp/supabase/migrations/` (116 files), `apps/erp/supabase/legacy_v1_migrations/` (11 files)
  - `apps/erp/.env`, `apps/erp/.env.local`, `apps/erp/.env.example`
  - Git history commit `72ec6d3` (merger details)
- **Key findings**:
  - `apps/erp` has two layers: an original React 18 SPA (`src/pages/*`, `src/App.tsx`) and an overlaid set of 30 TanStack Start routes (`src/routes/*`) from commit `72ec6d3`.
  - Overwrite in commit `72ec6d3` broke `auth.tsx` (`signInWithPassword` missing) and `utils.ts` (`formatINR`, `todayIST` missing).
  - Both `apps/erp/.env` and `.env.local` currently point to the live database (`wrjhdtdlxekackjdsjpf`).
  - Auth uses Supabase Auth `auth.users` for login credentials, mapped to `public.user_roles` for permissions and `public.profiles` / `staff` / `staff_profiles` for identity.
  - KPI cards (Gross Sale, Total Collection, Product Sales, Service Sales, GST) aggregate from `invoices` and `invoice_lines`. Zero invoices strictly yields ₹0 across all KPIs.
  - Master directories load from `services_master` (294), `inventory` (361), `customers` (968), `inventory_categories` (13), `inventory_brands` (33), `clinic_rooms` (8), `treatment_rooms` (4).
  - Port: default in `vite.config.js` is 5173; `vite.config.ts` had 3000; neither 3000 nor 3001 is currently occupied.
- **Unexplored areas**: None for survey scope.

## Key Decisions Made
- Fully documented all 6 investigation points with file paths and line numbers.

## Artifact Index
- [handoff.md] — Final handoff report
- [progress.md] — Progress log
- [DISPATCH.md] — Dispatch record
