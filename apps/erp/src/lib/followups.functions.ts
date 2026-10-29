// ============================================================================
// Follow-up directory lookups.
//
// profiles / user_roles are readable only by the owner or an admin (RLS), so a
// marketing user cannot resolve "who is this follow-up assigned to?" or list
// the marketing team from the browser. This server function does that lookup
// after verifying the caller actually holds one of the follow-up desk roles.
// It NEVER writes: every assignment/edit still goes through the browser client
// and is enforced by the existing cos_follow_ups RLS policies.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DESK_ROLES = [
  "admin",
  "marketing_admin",
  "marketing_head",
  "reception",
  "marketing",
  "caller",
] as const;

const TEAM_ROLES = ["marketing", "marketing_admin", "marketing_head", "caller"] as const;

export interface DirectoryMember {
  userId: string;
  name: string;
  roles: string[];
}

export interface FollowUpDirectory {
  team: DirectoryMember[];
  people: { userId: string; name: string }[];
}

export const getFollowUpDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FollowUpDirectory> => {
    // Caller's own roles are readable under RLS as the caller.
    const { data: mine } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    const myRoles = ((mine ?? []) as { role: string }[]).map((r) => r.role);
    if (!myRoles.some((r) => (DESK_ROLES as readonly string[]).includes(r))) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: roleRows }, { data: profileRows }, { data: staffRows }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("staff").select("user_id, name").not("user_id", "is", null),
    ]);

    const names = new Map<string, string>();
    for (const s of (staffRows ?? []) as { user_id: string | null; name: string | null }[]) {
      if (s.user_id && s.name) names.set(s.user_id, s.name);
    }
    for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) names.set(p.id, p.full_name);
    }

    const byUser = new Map<string, string[]>();
    for (const r of (roleRows ?? []) as { user_id: string; role: string }[]) {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r.role);
      byUser.set(r.user_id, list);
    }

    const people = [...byUser.keys()].map((userId) => ({
      userId,
      name: names.get(userId) ?? "Staff member",
    }));

    const team = [...byUser.entries()]
      .filter(([, roles]) => roles.some((r) => (TEAM_ROLES as readonly string[]).includes(r)))
      .map(([userId, roles]) => ({
        userId,
        name: names.get(userId) ?? "Staff member",
        roles,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { team, people };
  });
