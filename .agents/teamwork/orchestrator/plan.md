# Plan

## Step 0: Survey
- Spawn 3 Explorers in parallel:
  - Explorer 1 (explorer_survey_auth_db): Investigate Supabase CLI / watcher processes, current tokens / sessions, env files, and check fallback local DB options (local postgres, sqlite adapter, local supabase).
  - Explorer 2 (explorer_survey_app_schema): Investigate `apps/erp`, its 30-module migrations/schema, routing, KPI dashboard queries, user auth handling.
  - Explorer 3 (explorer_survey_exports_baseline): Investigate `live_export/*.json` master data files, `export_masters_readonly.mjs`, git remotes/repo structure, and baseline metrics verification.

## Step 1: Decompose & Synthesize Project Plan
- Synthesize findings into `PROJECT.md`.
- Establish milestones:
  - M1: Bypass hung prompts / Establish Isolated DB & Auth (clean separation from `wrjhdtdlxekackjdsjpf`).
  - M2: Apply 30-module migrations & seed master data (services, items, customers, categories, brands, rooms, users) with 0 transactions.
  - M3: Launch & verify apps/erp on localhost:3000/3001, verifying zero KPIs, login for admin + 16 staff, master directory loading.
  - M4: Deliverables: Copy PRD to Downloads & push to `mediglo0508-sudo/mediglo-harmony-erp`.
  - M5: Independent Verification & Forensic Audit + Live DB protection audit.
