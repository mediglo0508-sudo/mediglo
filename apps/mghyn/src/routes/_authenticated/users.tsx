import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/lib/auth";
import { assignStaffRole } from "@/lib/user-role.functions";
import { PageHeader, AccessDenied } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMaintenanceFlag } from "@/components/MaintenanceGate";
import { useRealtimeSync } from "@/lib/realtime";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — MGHYN Clinic ERP" },
      { name: "description", content: "Manage user accounts, roles and billing access controls." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Users & Roles — MGHYN Clinic ERP" },
      { property: "og:description", content: "Manage user accounts, roles and billing access controls." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/users" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/users" }],
  }),
  component: UsersPage,
});

// Operational roles the admin can map authenticated emails to.
const ASSIGNABLE: { value: Role; label: string }[] = [
  { value: "doctor", label: "Doctor / Consultant" },
  { value: "counselor", label: "Counselor" },
  { value: "admin", label: "Admin / Director" },
  { value: "therapist", label: "Therapist" },
  { value: "reception", label: "Receptionist" },
  { value: "accountant", label: "Accountant / Finance" },
  { value: "marketing", label: "Marketing / Leads" },
  { value: "marketing_head", label: "Marketing Head" },
];

interface StaffRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role_title: string | null;
  status: string;
}

function UsersPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  useRealtimeSync(["staff", "user_roles", "billing_permissions"], ["staff-directory"]);

  const { data } = useQuery({
    queryKey: ["staff-directory"],
    enabled: hasRole("admin"),
    queryFn: async () => {
      const [{ data: staff }, { data: roles }, { data: perms }] = await Promise.all([
        supabase.from("staff").select("id, user_id, name, email, role_title, status").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("billing_permissions").select("user_id, billing_locked, lock_reason, can_override_duplicate"),
      ]);
      const roleMap = new Map<string, Role>();
      (roles ?? []).forEach((r) => roleMap.set(r.user_id, r.role as Role));
      const permMap = new Map<string, { billing_locked: boolean; lock_reason: string | null; can_override_duplicate: boolean }>();
      (perms ?? []).forEach((p) =>
        permMap.set(p.user_id, {
          billing_locked: !!p.billing_locked,
          lock_reason: p.lock_reason ?? null,
          can_override_duplicate: !!p.can_override_duplicate,
        }),
      );
      return (staff ?? []).map((s) => {
        const perm = s.user_id ? permMap.get(s.user_id) : undefined;
        return {
          ...(s as StaffRow),
          currentRole: s.user_id ? roleMap.get(s.user_id) : undefined,
          billingLocked: perm?.billing_locked ?? false,
          lockReason: perm?.lock_reason ?? null,
          canOverrideDuplicate: perm?.can_override_duplicate ?? false,
        };
      });
    },
  });

  async function assign(userId: string | null, role: Role) {
    if (!userId) return toast.error("This staff record has no linked login account.");
    try {
      await assignStaffRole({ data: { userId, role } });
      toast.success("Role assigned");
      qc.invalidateQueries({ queryKey: ["staff-directory"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Role update failed");
    }
  }

  async function toggleBillingLock(userId: string | null, locked: boolean, staffName: string) {
    if (!userId) return toast.error("This staff record has no linked login account.");
    const { error } = await supabase.rpc("set_billing_lock", {
      p_user_id: userId,
      p_locked: locked,
      p_reason: locked ? "Locked by Admin from User Roles" : undefined,
    });
    if (error) return toast.error(error.message);
    toast.success(locked ? `Billing locked for ${staffName}` : `Billing unlocked for ${staffName}`);
    qc.invalidateQueries({ queryKey: ["staff-directory"] });
    qc.invalidateQueries({ queryKey: ["billing-access"] });
  }

  if (!hasRole("admin")) return <AccessDenied />;

  return (
    <div>
      <PageHeader
        title="Staff Directory, Roles & Billing Lock"
        subtitle="Every authenticated account auto-appears here. Map each email to an operational role and control per-staff billing access."
      />
      <MaintenanceToggle />
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned Role</th>
                <th className="p-3">Billing Access</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data ?? []).map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{u.name || "Unnamed"}</td>
                  <td className="p-3 text-muted-foreground">{u.email || "—"}</td>
                  <td className="p-3">
                    {u.status === "active" ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Pending Assignment</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <Select
                      value={u.currentRole ?? ""}
                      onValueChange={(v) => assign(u.user_id, v as Role)}
                    >
                      <SelectTrigger className="w-56"><SelectValue placeholder="Select role…" /></SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    {u.user_id ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!u.billingLocked}
                          onCheckedChange={(canBill) => toggleBillingLock(u.user_id, !canBill, u.name)}
                        />
                        {u.billingLocked ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                            <Lock className="h-3.5 w-3.5" /> Locked
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Unlock className="h-3.5 w-3.5" /> Allowed
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No login</span>
                    )}
                  </td>
                </tr>
              ))}
              {(data?.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No staff accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Admin-only switch that flips the maintenance_mode flag in app_settings. */
function MaintenanceToggle() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data } = useMaintenanceFlag();

  async function toggle(enabled: boolean) {
    const { error } = await supabase
      .from("app_settings")
      .update({
        value: { enabled, message: data?.message ?? "" },
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("key", "maintenance_mode");
    if (error) return toast.error(error.message);
    toast.success(enabled ? "Maintenance mode enabled" : "Maintenance mode disabled");
    qc.invalidateQueries({ queryKey: ["app-settings", "maintenance_mode"] });
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Maintenance Mode (Global Billing Lock)</p>
        <p className="text-xs text-muted-foreground">
          When ON, POS, invoices and vouchers are blocked for non-admin users at both the screen and database level.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="maint" checked={!!data?.enabled} onCheckedChange={toggle} />
        <Label htmlFor="maint" className="text-xs">{data?.enabled ? "ON" : "OFF"}</Label>
      </div>
    </Card>
  );
}
