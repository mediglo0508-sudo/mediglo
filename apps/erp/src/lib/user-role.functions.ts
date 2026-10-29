import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASSIGNABLE_ROLES = [
  "admin",
  "doctor",
  "reception",
  "accountant",
  "marketing",
  "marketing_head",
  "counselor",
  "therapist",
] as const;

const ROLE_TITLES: Record<string, string> = {
  admin: "Admin / Director",
  doctor: "Doctor / Consultant",
  reception: "Front-Desk / Reception",
  accountant: "Accountant / Finance",
  marketing: "Marketing / Leads",
  marketing_head: "Marketing Head",
  counselor: "Counselor / Closer",
  therapist: "Therapist / Nursing",
};

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
  enabled: z.boolean(),
});

async function assertAdmin(supabaseAdmin: any, callerId: string) {
  const { data: adminRole, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!adminRole) throw new Error("Forbidden");
}

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    if (data.enabled) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });

// Assign a single operational role (clears other roles) and activate the staff record.
export const assignStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(ASSIGNABLE_ROLES) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw error;

    await supabaseAdmin
      .from("staff")
      .update({ role_title: ROLE_TITLES[data.role], status: "active", active: true })
      .eq("user_id", data.userId);

    return { ok: true };
  });
