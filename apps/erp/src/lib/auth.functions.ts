import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "admin" | "doctor" | "reception" | "accountant" | "marketing" | "counselor" | "therapist";

interface JwtClaims {
  email?: unknown;
  user_metadata?: Record<string, unknown>;
}

export const bootstrapCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const jwt = claims as JwtClaims;
    const metadata = jwt.user_metadata ?? {};
    const email = typeof jwt.email === "string" && jwt.email.trim() ? jwt.email.trim() : null;
    const fullName =
      (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
      (typeof metadata.name === "string" && metadata.name.trim()) ||
      (email ? email.split("@")[0] : "Clinic Admin");
    const phone = typeof metadata.phone === "string" && metadata.phone.trim() ? metadata.phone.trim() : null;

    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        phone,
      },
      { onConflict: "id" },
    );

    const { count: adminCount } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    // Zero-admin recovery: after a data wipe, the first authenticated account becomes Master Admin.
    if ((adminCount ?? 0) === 0) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw rolesError;

    const roleList = (roles ?? []).map((r) => r.role as AppRole);
    const isAdmin = roleList.includes("admin");

    // Ensure the authenticated account exists in the central Staff Directory (best-effort under RLS).
    try {
      const { data: existingStaff } = await supabaseAdmin
        .from("staff")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!existingStaff) {
        await supabaseAdmin.from("staff").insert({
          user_id: userId,
          name: fullName,
          email,
          phone,
          role_title: isAdmin ? "Admin / Director" : "Pending Assignment",
          status: isAdmin ? "active" : "pending",
          active: true,
        });
      } else if (isAdmin) {
        await supabaseAdmin
          .from("staff")
          .update({ name: fullName, email, phone, role_title: "Admin / Director", status: "active", active: true })
          .eq("user_id", userId);
      }
    } catch {
      // Non-fatal when running without service_role key
    }

    return { roles: roleList, profile: { full_name: fullName, phone } };
  });
