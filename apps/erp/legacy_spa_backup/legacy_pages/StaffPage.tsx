import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useGstStateCodes } from "@/hooks/useQueries";
import { STAFF_ROLES, type StaffRole } from "@mediglo/shared-types";
import type { ClinicSettings } from "@/types/domain";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Info, ShieldCheck, Settings } from "lucide-react";

interface StaffProfileRow {
  user_id: string;
  full_name: string;
  phone: string | null;
  active: boolean;
  billing_locked?: boolean;
}

interface UserRoleRow {
  id: string;
  user_id: string;
  role: StaffRole;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  doctor: "Doctor",
  reception: "Reception",
  accountant: "Accountant",
  counselor: "Counselor",
  therapist: "Therapist",
  pharmacist: "Pharmacist",
  marketing: "Marketing",
  marketing_head: "Marketing Head",
};

export default function StaffPage() {
  const { access } = useAuth();
  const queryClient = useQueryClient();
  const [managingUserId, setManagingUserId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<StaffRole | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const { data: profiles } = useQuery({
    queryKey: ["staff_profiles_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_profiles").select("*").order("full_name");
      if (error) throw error;
      return data as StaffProfileRow[];
    },
    enabled: !!access?.is_admin,
  });

  const { data: userRoles } = useQuery({
    queryKey: ["user_roles_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data as UserRoleRow[];
    },
    enabled: !!access?.is_admin,
  });

  if (!access?.is_admin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Staff & Role Management</h1>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Admin access required.</CardContent>
        </Card>
      </div>
    );
  }

  const rolesByUser = (userRoles ?? []).reduce<Record<string, StaffRole[]>>((acc, r) => {
    (acc[r.user_id] ??= []).push(r.role);
    return acc;
  }, {});

  const managingProfile = (profiles ?? []).find((p) => p.user_id === managingUserId) ?? null;
  const managingRoles = managingUserId ? rolesByUser[managingUserId] ?? [] : [];

  async function toggleActive(profile: StaffProfileRow) {
    if (togglingUserId) return; // guard against a double-click firing two overlapping requests
    setTogglingUserId(profile.user_id);
    try {
      const { error } = await supabase.from("staff_profiles").update({ active: !profile.active }).eq("user_id", profile.user_id);
      if (error) throw error;
      toast.success(`${profile.full_name} marked ${!profile.active ? "active" : "inactive"}`);
      queryClient.invalidateQueries({ queryKey: ["staff_profiles_all"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update status");
    } finally {
      setTogglingUserId(null);
    }
  }

  async function toggleBillingLock(profile: StaffProfileRow) {
    const nextLocked = !profile.billing_locked;
    try {
      const { error } = await supabase.from("staff_profiles").update({ billing_locked: nextLocked }).eq("user_id", profile.user_id);
      if (error) throw error;
      toast.success(`Billing ${nextLocked ? "locked" : "unlocked"} for ${profile.full_name}`);
      queryClient.invalidateQueries({ queryKey: ["staff_profiles_all"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to toggle billing lock");
    }
  }

  async function toggleRole(userId: string, role: StaffRole, checked: boolean) {
    setPendingRole(role);
    try {
      if (checked) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
        toast.success(`${ROLE_LABELS[role]} role granted`);
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
        toast.success(`${ROLE_LABELS[role]} role removed`);
      }
      queryClient.invalidateQueries({ queryKey: ["user_roles_all"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update role");
    } finally {
      setPendingRole(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Staff & Role Management</h1>

      <Card className="border-primary/30 bg-accent/40">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            There is no first-admin bootstrap yet - only an existing admin can grant roles from this screen. To create the very first
            admin, insert a row directly into <code className="rounded bg-muted px-1 py-0.5 text-xs">public.user_roles</code> (role =
            'admin') using the Supabase dashboard's SQL editor.
          </p>
        </CardContent>
      </Card>

      <ClinicSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle>All Staff</CardTitle>
          <CardDescription>Toggle active status, or manage a staff member's roles.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(profiles ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No staff profiles found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Billing Lock</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profiles ?? []).map((p) => (
                  <TableRow key={p.user_id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(rolesByUser[p.user_id] ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">No roles assigned</span>
                        ) : (
                          (rolesByUser[p.user_id] ?? []).map((r) => (
                            <Badge key={r} variant="secondary">
                              {ROLE_LABELS[r]}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.active} disabled={togglingUserId === p.user_id} onCheckedChange={() => toggleActive(p)} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={!!p.billing_locked} onCheckedChange={() => toggleBillingLock(p)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setManagingUserId(p.user_id)}>
                        <ShieldCheck className="mr-1 h-4 w-4" /> Manage Roles
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!managingUserId} onOpenChange={(o) => !o && setManagingUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Roles - {managingProfile?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {STAFF_ROLES.map((role) => {
              const checked = managingRoles.includes(role);
              return (
                <div key={role} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <Checkbox
                    id={`role-${role}`}
                    checked={checked}
                    disabled={pendingRole === role}
                    onCheckedChange={(v) => managingUserId && toggleRole(managingUserId, role, v === true)}
                  />
                  <label htmlFor={`role-${role}`} className="flex-1 cursor-pointer text-sm">
                    {ROLE_LABELS[role]}
                  </label>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingUserId(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clinic Settings - admin-only. Configures clinic_settings.home_state_code,
// which edit_invoice() uses to decide CGST+SGST vs IGST (see
// 0011_production_hardening.sql). Left unset, billing keeps its previous
// always-CGST+SGST behavior, so this card is what makes the IGST feature
// actually reachable from the UI rather than only from the database.
// ---------------------------------------------------------------------------
function ClinicSettingsCard() {
  const queryClient = useQueryClient();
  const { data: gstStateCodes } = useGstStateCodes();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["clinic_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_settings").select("*").eq("id", true).single();
      if (error) throw error;
      return data as ClinicSettings;
    },
  });

  const [clinicName, setClinicName] = useState("");
  const [homeStateCode, setHomeStateCode] = useState<string>("none");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setClinicName(settings.clinic_name ?? "");
    setHomeStateCode(settings.home_state_code ?? "none");
    setMaintenanceMode(Boolean((settings as any).maintenance_mode));
    setMaintenanceMsg((settings as any).maintenance_message ?? "");
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clinic_settings")
        .update({
          clinic_name: clinicName.trim() || null,
          home_state_code: homeStateCode === "none" ? null : homeStateCode,
        })
        .eq("id", true);
      if (error) throw error;
      toast.success("Clinic settings saved");
      queryClient.invalidateQueries({ queryKey: ["clinic_settings"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save clinic settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-4 w-4" /> Clinic Settings
        </CardTitle>
        <CardDescription>
          Set the clinic's own GST-registered state to enable automatic IGST billing for out-of-state customers. Leave "Not set" to
          keep every sale billed as CGST + SGST (the previous, unchanged behavior).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Clinic name</Label>
                <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="e.g. Mediglo Wellness Clinic" />
              </div>
              <div className="space-y-1">
                <Label>Home state (for GST place-of-supply)</Label>
                <Select value={homeStateCode} onValueChange={setHomeStateCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set (always CGST + SGST)</SelectItem>
                    {(gstStateCodes ?? []).map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.code} - {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold text-sm">System Maintenance Mode</Label>
                  <p className="text-xs text-muted-foreground">Restrict non-admin access for scheduled clinic audits or updates</p>
                </div>
                <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
              </div>
              {maintenanceMode && (
                <div className="space-y-1">
                  <Label className="text-xs">Maintenance Announcement Banner</Label>
                  <Input
                    value={maintenanceMsg}
                    onChange={(e) => setMaintenanceMsg(e.target.value)}
                    placeholder="System is temporarily under routine maintenance."
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Confirm the correct GST treatment for your clinic's billing with your CA before changing this - it affects tax charged
              on every future invoice.
            </p>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Clinic Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
