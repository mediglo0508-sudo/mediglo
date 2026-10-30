# Survey Report: Supabase Authentication, Database Configuration & Local Fallback Isolation

- **Author**: Explorer 1 (`explorer_survey_auth_db`)
- **Date**: 2026-10-30T07:22:00Z
- **Working Directory**: `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\.agents\teamwork\explorer_survey_1\`

---

## 1. Observation

### 1.1 Running Processes & CLI Watchers
- Executed `Get-CimInstance Win32_Process` filtering for `supabase`, `node`, `deno`, `docker`, and `postgres`.
- **Result**: Zero active processes matching `supabase`, `docker`, or `postgres`. There are no hung Supabase CLI watcher or login processes on this machine.
- Executed path lookup for `supabase`: `Get-Command supabase` returned code 1 (executable not found on PATH).

### 1.2 Supabase Credentials & Token State
- **`~/.supabase` (`C:\Users\Vikas Koul\.supabase`)**:
  - Directory exists, but contains only two files:
    - `cli-latest` (size 8 bytes, content: `v2.122.0`)
    - `telemetry.json` (size 178 bytes, containing `device_id` and `session_id`)
  - **No `access_token` or credentials file exists in `~/.supabase`**.
- **Windows Credential Manager (`cmd /c "cmdkey /list"`)**:
  - Contains credentials for GitHub (`mediglo0508-sudo`) and Microsoft SSO accounts (`vikas@mediglo.in`, `hy941643@gmail.com`), but **zero Supabase tokens or keys**.
- **Environment Variables (`Get-ChildItem env: | Where-Object { $_.Name -match "SUPABASE" }`)**:
  - Returned 0 variables. Neither `SUPABASE_ACCESS_TOKEN` nor `SUPABASE_AUTH_TOKEN` is set.
- **Conclusion**: No Supabase cloud project token or authenticated CLI session exists on this machine.

### 1.3 Repository `.env*` Files
- **Repository Root (`c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel`)**:
  - No `.env` or `.env.local` exists in the repository root.
- **`apps/erp/.env`** (lines 1–6):
  ```env
  SUPABASE_PROJECT_ID="wrjhdtdlxekackjdsjpf"
  SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyamhkdGRseGVrYWNramRzanBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjM5MDMsImV4cCI6MjA5NjkzOTkwM30.RXajaXG9GrgmuZ18RxTUHM-ULk03O_ekR7pNQ9JBSPw"
  SUPABASE_URL="https://wrjhdtdlxekackjdsjpf.supabase.co"
  VITE_SUPABASE_PROJECT_ID="wrjhdtdlxekackjdsjpf"
  VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyamhkdGRseGVrYWNramRzanBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjM5MDMsImV4cCI6MjA5NjkzOTkwM30.RXajaXG9GrgmuZ18RxTUHM-ULk03O_ekR7pNQ9JBSPw"
  VITE_SUPABASE_URL="https://wrjhdtdlxekackjdsjpf.supabase.co"
  ```
  **CRITICAL OBSERVATION**: `apps/erp/.env` points directly to the live production database `wrjhdtdlxekackjdsjpf`!
- **`apps/erp/.env.local`** (lines 1–2):
  ```env
  VITE_SUPABASE_URL=https://wrjhdtdlxekackjdsjpf.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyamhkdGRseGVrYWNramRzanBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjM5MDMsImV4cCI6MjA5NjkzOTkwM30.RXajaXG9GrgmuZ18RxTUHM-ULk03O_ekR7pNQ9JBSPw
  ```
  **CRITICAL OBSERVATION**: `apps/erp/.env.local` ALSO points directly to the live production database `wrjhdtdlxekackjdsjpf`!
- **`apps/erp/.env.example`** (lines 4–9):
  ```env
  # This ERP is meant to live in its OWN Supabase project, separate from the
  # Tracker app's project (see root README.md for why). Run every file in
  # supabase/migrations/, in order, against this project before starting the app.
  VITE_SUPABASE_URL=https://your-erp-project-ref.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-public-key
  ```
- **`apps/mghyn/.env`**:
  Identical to `apps/erp/.env` (points to `wrjhdtdlxekackjdsjpf`).

### 1.4 Database Connection Mechanisms in `apps/erp`
- **Dependencies (`apps/erp/package.json`)**:
  - Uses `"@supabase/supabase-js": "^2.45.4"`.
  - Does NOT contain Prisma, Drizzle, or raw PG drivers (Drizzle and postgres are only in `apps/mghyn`).
- **Client Initializations**:
  - `apps/erp/src/integrations/supabase/client.ts` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_PUBLISHABLE_KEY`).
  - `apps/erp/src/lib/supabase.ts` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Query Patterns**:
  - Client components make PostgREST REST calls over HTTP (`GET /rest/v1/<table_name>?...`, `POST /rest/v1/...`).
  - Auth is handled via GoTrue REST calls over HTTP (`POST /auth/v1/token?grant_type=password`, `POST /auth/v1/logout`, `GET /auth/v1/user`).
- **Defect Discovered in Auth Interface**:
  - In `apps/erp/src/pages/LoginPage.tsx` (line 11):
    `const { session, signInWithPassword, signUp } = useAuth();`
  - But in `apps/erp/src/lib/auth.tsx` (lines 34–49, 159–178):
    `AuthContextValue` does NOT expose `signInWithPassword` or `signUp`. Attempting to submit `/login` throws `signInWithPassword is not a function`. It must either be added to `AuthContextValue` or invoked via `supabase.auth.signInWithPassword`.

### 1.5 Local Database Options on Host Machine
- **PostgreSQL Windows Service**:
  - Executed `Get-Service` for `postgres*`: None found.
  - Executed `Get-Command psql, postgres, pg_ctl`: None found.
- **Docker**:
  - Executed `Get-Service` for `docker*`: None found.
  - Executed `Get-Command docker`: None found.
- **WSL**:
  - Executed `wsl --status`: Output confirmed: `"The Windows Subsystem for Linux is not installed."`
- **Supabase CLI Local Stack**:
  - Not installed globally. Even if invoked via `npx supabase`, `supabase start` **requires Docker daemon**, which does not exist on this machine.
- **Node.js Environment & Native SQLite (`node:sqlite`)**:
  - Node version: `v24.20.0` (with npm `11.19.0`).
  - Tested native `node:sqlite` (`DatabaseSync`):
    `node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(':memory:'); ..."`
    Result: Fully functional, native, synchronous SQLite engine built into Node v24, with **zero external dependencies** and instant startup.
- **PGlite (`@electric-sql/pglite`)**:
  - Available on npm registry (`0.5.13`), but is a pure SQL engine in WASM and does not include PostgREST HTTP or Auth HTTP services needed by `@supabase/supabase-js`.

---

## 2. Logic Chain

1. **Production DB Exposure Risk**:
   - `apps/erp/.env` and `apps/erp/.env.local` both contain `https://wrjhdtdlxekackjdsjpf.supabase.co` and its anon publishable key (Section 1.3).
   - If `apps/erp` or any test/seed script runs with these files in place, any write will hit `wrjhdtdlxekackjdsjpf`, violating the hard safety constraint.
   - Therefore, `apps/erp/.env` and `apps/erp/.env.local` must be immediately changed to point to a local isolated URL (e.g., `http://127.0.0.1:54321`) with dummy keys.

2. **Triggering the Local Fallback**:
   - Section 1.2 confirms that no Supabase cloud token exists in `~/.supabase`, `cmdkey`, or process environment.
   - Requirement R1 explicitly commands: *"Fallback: If a cloud Supabase token is not immediately available within 30 seconds, immediately spin up a local isolated database (local Supabase, local PostgreSQL, or SQLite-PostgreSQL adapter) or configure apps/erp with clean isolated schema/staging so execution proceeds continuously."*
   - Therefore, the local isolated fallback MUST be activated.

3. **Infeasibility of Docker / Native Postgres / Supabase CLI**:
   - Docker is absent, WSL is absent, and PostgreSQL Windows service is absent (Section 1.5).
   - `supabase start` cannot execute without Docker.
   - Installing Docker Desktop or PostgreSQL installer on Windows would require administrative prompts, installer downloads, and potential system restarts, which violates the requirement for continuous, prompt-free execution.

4. **Protocol Match with `@supabase/supabase-js`**:
   - `apps/erp` does not connect over PostgreSQL wire protocol (`pg://` port 5432). It connects over HTTP to `${VITE_SUPABASE_URL}` calling `/auth/v1/*` and `/rest/v1/*` (Section 1.4).
   - Therefore, what `apps/erp` needs to be 100% functional is an HTTP service on `http://127.0.0.1:54321` implementing the minimal Supabase PostgREST + GoTrue Auth endpoints.

5. **Optimal Engine for Local Isolation**:
   - Node.js `v24.20.0` has native `node:sqlite` built-in (Section 1.5).
   - A lightweight Node HTTP server (`scripts/local-supabase-server.mjs`) can spin up in ~50ms, listen on `http://127.0.0.1:54321`, load the exported master JSON data from `scratch/live_export/` into SQLite/in-memory collections, and answer PostgREST queries (`/rest/v1/*`) and Auth requests (`/auth/v1/token`, `/auth/v1/user`, `/auth/v1/logout`).
   - Transactional tables (`invoices`, `appointments`, `pos_bills`, `vouchers`, etc.) return empty arrays `[]` (count 0), which immediately satisfies R2/Acceptance Criteria 43: all dashboard KPI cards display ₹0.
   - Master directories (`services: 294`, `inventory: 361`, `customers: 968`, `categories: 13`, `brands: 33`, `rooms: 12`) load seamlessly.
   - Auth endpoints accept `admin@mediglo.in` (`AdminPassword2026!`) and the 16 staff accounts (`MediGlo@12345`), issuing valid Supabase-compatible JWTs.

---

## 3. Caveats

1. **Build & Router Discrepancy in `apps/erp`**:
   - Commit `72ec6d3` introduced TanStack Start routes (`src/routes/*`, `src/server.ts`, `src/start.ts`) and imported `@lovable.dev/vite-tanstack-config` into `apps/erp/vite.config.ts`, but did NOT install those packages in `apps/erp/package.json`.
   - `apps/erp`'s actual entry point is `index.html` -> `src/main.tsx` -> `src/App.tsx` (using `react-router-dom`).
   - For `apps/erp` to run on `http://localhost:3000` via Vite, `apps/erp/vite.config.ts` must use standard Vite React configuration (`@vitejs/plugin-react`), or `apps/erp/package.json` must be reconciled.
2. **Hard-Fail Guardrails**:
   - Any script executed by the team that performs data operations MUST include a sanity check:
     `if (url.includes('wrjhdtdlxekackjdsjpf')) throw new Error('VIOLATION: Attempted access to live database');`
3. **Master Export Data Location**:
   - Master JSON exports are located at `C:\Users\Vikas Koul\.gemini\antigravity\brain\d059d7b8-d01e-4f4f-a1bb-e1ad5c0926ac\scratch\live_export\`. They must be read directly from there or copied to a designated scratch location for the local server.

---

## 4. Conclusion

1. **Database Isolation Strategy**:
   - Create a dedicated, ultra-lightweight Node.js local Supabase server (`scripts/local-supabase-server.mjs`) listening on `http://127.0.0.1:54321`.
   - Update `apps/erp/.env` and `apps/erp/.env.local` to point to `http://127.0.0.1:54321` with isolated anon keys (`local-isolated-anon-key`).
   - This provides **100% physical disconnection from `wrjhdtdlxekackjdsjpf`**.
2. **Authentication Strategy**:
   - Server handles `POST /auth/v1/token?grant_type=password`:
     - Validates `admin@mediglo.in` with password `AdminPassword2026!`.
     - Validates all 16 staff accounts with password `MediGlo@12345`.
     - Returns a Supabase session with user metadata and role `admin` / assigned staff role.
   - Patch `apps/erp/src/lib/auth.tsx` to expose `signInWithPassword` and `signUp` on `useAuth()`.
3. **Data Seeding & Zero-Transactional Invariance**:
   - Server loads master data into memory/SQLite from `scratch/live_export/`:
     - 294 services
     - 361 inventory items (stock = 0, batch_no = null)
     - 968 customers (outstanding_balance = 0)
     - 13 categories, 33 brands, 12 rooms
     - 21 user roles, 21 profiles
   - Responds with `[]` for `invoices`, `appointments`, and `service_profitability_view`, guaranteeing dashboard KPIs display ₹0.

---

## 5. Verification Method

To independently verify all findings in this report, execute the following commands:

1. **Verify No Processes Running**:
   ```powershell
   Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "supabase" -or $_.Name -match "supabase|docker|postgres" }
   ```
   *Expected: Empty.*

2. **Verify No Cloud Tokens**:
   ```powershell
   Test-Path "C:\Users\Vikas Koul\.supabase\access_token"
   cmd /c "cmdkey /list | findstr -i supabase"
   ```
   *Expected: False / None found.*

3. **Verify Production DB References in `.env*`**:
   ```powershell
   Get-Content "apps/erp/.env"
   Get-Content "apps/erp/.env.local"
   ```
   *Confirm: Contains `wrjhdtdlxekackjdsjpf` before isolation.*

4. **Verify Native SQLite Availability**:
   ```powershell
   node -e "const { DatabaseSync } = require('node:sqlite'); console.log(typeof DatabaseSync);"
   ```
   *Expected: `function`.*

5. **Verify Docker and WSL Absence**:
   ```powershell
   Get-Command docker -ErrorAction SilentlyContinue
   wsl --status
   ```
   *Expected: Command not found; WSL not installed.*
