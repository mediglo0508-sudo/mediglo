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
import { Lock, Unlock, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users, Roles & Billing Lock — MediGlo Harmony ERP" },
      { name: "description", content: "Manage the 16 staff accounts, RBAC roles, and Maintenance Mode (Billing Lock)." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UsersPage,
});

const ASSIGNABLE: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin / Director" },
  { value: "accountant", label: "Accountant / Finance" },
  { value: "doctor", label: "Doctor / Consultant" },
  { value: "counselor", label: "Counselor" },
  { value: "therapist", label: "Therapist" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "reception", label: "Receptionist" },
  { value: "marketing_head", label: "Marketing Head" },
  { value: "marketing", label: "Marketing / Leads" },
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
      const list = (staff ?? []).map((s) => {
        const perm = s.user_id ? permMap.get(s.user_id) : undefined;
        return {
          ...(s as StaffRow),
          currentRole: s.user_id ? roleMap.get(s.user_id) : undefined,
          billingLocked: perm?.billing_locked ?? false,
          lockReason: perm?.lock_reason ?? null,
          canOverrideDuplicate: perm?.can_override_duplicate ?? false,
        };
      });
      // Sort authenticated email accounts first (the 16 seeded user accounts)
      return list.sort((a, b) => (b.email ? 1 : 0) - (a.email ? 1 : 0));
    },
  });

  async function assign(userId: string | null, role: Role) {
    if (!userId) return toast.error("This staff record has no linked login account.");
    try {
      const label = ASSIGNABLE.find((a) => a.value === role)?.label ?? role;
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) {
        await assignStaffRole({ data: { userId, role } });
      }
      await supabase.from("staff").update({ role_title: label, status: "active" }).eq("user_id", userId);
      toast.success(`Role updated to ${label}`);
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
        title="Staff Directory, Roles & Billing Lock (16 Seeded Accounts)"
        subtitle="Map each staff email to an operational RBAC role, toggle per-staff Billing Lock, and manage Global Maintenance Mode."
      />
      <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong>Default Staff Password Policy:</strong> Initial default password for all 16 staff accounts is{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono font-bold text-primary">MediGlo@12345</code>{" "}
            (or <code className="rounded bg-background px-1.5 py-0.5 font-mono font-bold text-primary">AdminPassword2026!</code> for root admin). Staff can change their password anytime via the top-bar <strong>Password</strong> button.
          </span>
        </div>
        <Badge variant="outline">{(data ?? []).filter((u) => !!u.email).length} Login Accounts</Badge>
      </div>
      <MaintenanceToggle />
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role Title</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned RBAC Role</th>
                <th className="p-3">Billing Access</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data ?? []).map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{u.name || "Unnamed"}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{u.email || "— (Clinical Roster)"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{u.role_title || "—"}</td>
                  <td className="p-3">
                    {u.status === "active" ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Pending Assignment</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {u.user_id ? (
                      <Select
                        value={u.currentRole ?? ""}
                        onValueChange={(v) => assign(u.user_id, v as Role)}
                      >
                        <SelectTrigger className="w-56"><SelectValue placeholder="Select role…" /></SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">{u.role_title || "Roster Only"}</span>
                    )}
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
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No staff accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

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
