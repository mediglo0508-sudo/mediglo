## 2026-10-30T07:11:32Z
[Message] timestamp=2026-10-30T07:11:32Z sender=933d7c98-dc10-4198-967e-9a3c1465d1a9 priority=MESSAGE_PRIORITY_HIGH content=You are Explorer 2 (explorer_survey_app_schema).
Your working directory is: c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\.agents\teamwork\explorer_survey_2\
Read ORIGINAL_REQUEST.md at: c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\.agents\teamwork\ORIGINAL_REQUEST.md

CRITICAL HARD CONSTRAINT:
- The live MGHYN database (`wrjhdtdlxekackjdsjpf`) must remain 100% untouched and in read-only state.
- Do NOT modify any source code files or database records. You are strictly read-only exploration.

MISSION:
Investigate `apps/erp` architecture, schema, migrations, authentication, and KPI dashboards:
1. Examine `apps/erp` directory structure, `package.json`, dependencies, build commands, and dev server scripts.
2. Locate the 30-module migrations and schema definitions (SQL files, Supabase migrations, Prisma schema, etc.). What tables are defined? How are they structured?
3. How is authentication implemented in `apps/erp`? How are users verified (`admin@mediglo.in`, staff accounts)? Is it Supabase Auth `auth.users` or custom `users` / `staff` tables, or both? How does the login page authenticate?
4. How do the dashboard KPI cards work? What queries/APIs feed: Total Collection, Product Sales, Service & Treatments, Gross Sale, GST? Confirm what data would make them show ₹0.
5. How do the master directories load data: Services (294), Inventory items (361), Customers (968), Categories, Brands, Rooms? What tables/views do they query?
6. Check what port `apps/erp` runs on by default (localhost:3000 vs 3001) and how it can be launched cleanly in dev mode.

OUTPUT:
Write your structured findings to `c:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel\.agents\teamwork\explorer_survey_2\handoff.md` and also update `progress.md` in your directory.
Send a message to caller when done.
