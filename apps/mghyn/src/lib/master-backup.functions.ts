import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only: build the master backup and return the base64 xlsx so the
 * browser can download it directly. Emailing is handled by the cron route.
 */
export const generateMasterBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { buildMasterBackup } = await import("./master-backup.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await buildMasterBackup(supabaseAdmin);

    return {
      filename: result.filename,
      base64: result.buffer.toString("base64"),
      summary: result.summary,
    };
  });
