# Restrict AI Chat to Admin and Doctor Only

Only Admin and Doctor may see or use the AI Manager chat. Everyone else loses the entry point entirely, and the backend refuses their requests even if called directly. Internal AI-driven automation is untouched.

## What changes

1. Hide the entry point
   - The AI Manager button/drawer is mounted in the authenticated layout. It renders only when the signed-in user has the `admin` or `doctor` role (read from the existing auth context).
   - Non-eligible users see no AI button anywhere — no greyed-out state, no "ask an admin" message.

2. Enforce on the server
   - The chat endpoint (`/api/ai-manager`) checks the caller's roles after loading their context and returns a 403 ("The AI Manager is available to Admin and Doctor accounts only") unless they hold `admin` or `doctor`.
   - This is the authoritative gate; hiding the button is only cosmetic.

3. Leave internal automation alone
   - Existing role rules inside the AI tools (finance restrictions, marketing/inventory scopes) stay exactly as they are — they still apply on top of the new gate for Admin/Doctor callers.
   - Follow-up automation, scheduler rules, MCP tools and any other non-chat AI/automation paths are not modified, so background ERP behaviour continues unchanged.

## Technical notes

- `src/routes/_authenticated/route.tsx`: conditional render of `<AIManagerDrawer />` based on `useAuth().hasRole("admin") || hasRole("doctor")`.
- `src/routes/api/ai-manager.ts`: add the role check next to the existing "no role assigned" check.
- No database migration required; no changes to `src/lib/ai-tools.server.ts`.
