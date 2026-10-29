import { createFileRoute, redirect, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type Role } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DownloadAppButton } from "@/components/DownloadAppButton";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatBox } from "@/components/ChatBox";
import { AIManagerDrawer } from "@/components/AIManagerDrawer";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { BrandFooter } from "@/components/BrandFooter";
import { MaintenanceGate, MaintenanceBanner } from "@/components/MaintenanceGate";
import {
  Activity, LayoutDashboard, ShoppingCart, Users, Stethoscope, ScrollText,
  Wallet, Boxes, ClipboardList, BarChart3, FileDown, UploadCloud, UserCog,
  LogOut, BadgeIndianRupee, Menu, Landmark, PackageCheck,
  ConciergeBell, HeartPulse, ShoppingBag, Printer, DoorOpen, CalendarClock, Layers, Eye, ShieldAlert,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  section: string;
  roles: Role[] | "all";
}

const NAV: NavItem[] = [
  // 1. Executive & Analytics
  { section: "Executive & Analytics", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "accountant", "doctor", "reception", "counselor", "pharmacist"] },
  { section: "Executive & Analytics", to: "/marketing-dashboard", label: "Marketing Dashboard", icon: BarChart3, roles: ["admin", "marketing_admin", "marketing_head", "marketing"] },
  { section: "Executive & Analytics", to: "/performance", label: "Staff & Performance", icon: BarChart3, roles: ["admin", "accountant", "marketing_head", "doctor", "counselor"] },
  { section: "Executive & Analytics", to: "/analytics", label: "Profitability", icon: BarChart3, roles: ["admin", "accountant"] },

  // 2. Front Office & CRM
  { section: "Front Office & CRM", to: "/follow-ups", label: "Follow-Up Desk", icon: HeartPulse, roles: ["admin", "marketing_admin", "marketing_head", "marketing", "caller", "counselor", "counselor_1", "counselor_2", "reception"] },
  { section: "Front Office & CRM", to: "/reception", label: "Reception Desk", icon: ConciergeBell, roles: ["admin", "reception", "accountant", "marketing"] },
  { section: "Front Office & CRM", to: "/appointments", label: "Appointments", icon: CalendarClock, roles: ["admin", "reception", "marketing", "marketing_head", "accountant", "doctor", "counselor", "counselor_1", "counselor_2"] },
  { section: "Front Office & CRM", to: "/customers", label: "Customers (CRM)", icon: Users, roles: ["admin", "reception", "doctor", "counselor", "counselor_1", "counselor_2", "accountant", "marketing", "marketing_head"] },
  { section: "Front Office & CRM", to: "/scheduler-rules", label: "Scheduling Rules", icon: Layers, roles: ["admin", "counselor"] },

  // 3. Clinical & Floor Operations
  { section: "Clinical & Floor Operations", to: "/consultation", label: "Consultation Room", icon: Stethoscope, roles: ["admin", "doctor", "counselor", "counselor_1", "counselor_2"] },
  { section: "Clinical & Floor Operations", to: "/doctor-room", label: "Doctor Room", icon: Stethoscope, roles: ["admin", "doctor"] },
  { section: "Clinical & Floor Operations", to: "/counselor-room", label: "Counselor Room", icon: BadgeIndianRupee, roles: ["admin", "counselor", "counselor_1", "counselor_2"] },
  { section: "Clinical & Floor Operations", to: "/duties", label: "Therapist Floor (My Duties)", icon: HeartPulse, roles: ["admin", "therapist", "doctor", "counselor", "reception"] },
  { section: "Clinical & Floor Operations", to: "/rooms", label: "Live Rooms", icon: DoorOpen, roles: ["admin", "reception", "doctor", "therapist", "counselor", "counselor_1", "counselor_2"] },

  // 4. Pharmacy, Billing & Inventory
  { section: "Pharmacy, Billing & Inventory", to: "/pharmacy", label: "Pharmacy", icon: PackageCheck, roles: ["admin", "pharmacist", "reception", "accountant"] },
  { section: "Pharmacy, Billing & Inventory", to: "/pos", label: "POS / Billing", icon: ShoppingCart, roles: ["admin", "reception", "accountant", "counselor", "counselor_1", "counselor_2", "pharmacist"] },
  { section: "Pharmacy, Billing & Inventory", to: "/invoices", label: "Invoices", icon: BadgeIndianRupee, roles: ["admin", "reception", "accountant", "counselor", "counselor_1", "counselor_2"] },
  { section: "Pharmacy, Billing & Inventory", to: "/inventory", label: "Master Inventory", icon: Boxes, roles: ["admin", "accountant", "pharmacist", "reception", "doctor", "counselor"] },
  { section: "Pharmacy, Billing & Inventory", to: "/purchases", label: "Smart Purchase", icon: ShoppingBag, roles: ["admin", "accountant", "pharmacist"] },

  // 5. Masters & Studio
  { section: "Masters & Studio", to: "/services", label: "Services", icon: ClipboardList, roles: ["admin", "doctor", "counselor", "counselor_1", "counselor_2", "reception", "accountant"] },
  { section: "Masters & Studio", to: "/packages", label: "Package Master", icon: PackageCheck, roles: ["admin", "reception", "accountant", "counselor", "counselor_1", "counselor_2", "doctor"] },
  { section: "Masters & Studio", to: "/template-studio", label: "Print Template Studio", icon: Printer, roles: ["admin", "doctor", "reception", "accountant", "counselor"] },

  // 6. Finance, Compliance & System Admin
  { section: "Finance, Compliance & Admin", to: "/vouchers", label: "Vouchers & Accounting", icon: ScrollText, roles: ["admin", "accountant"] },
  { section: "Finance, Compliance & Admin", to: "/expenses", label: "Expenses", icon: Wallet, roles: ["admin", "accountant"] },
  { section: "Finance, Compliance & Admin", to: "/reconciliation", label: "Bank Reconciliation", icon: Landmark, roles: ["admin", "accountant"] },
  { section: "Finance, Compliance & Admin", to: "/export", label: "Tax Export Hub (GST/ITR)", icon: FileDown, roles: ["admin", "accountant"] },
  { section: "Finance, Compliance & Admin", to: "/ingest", label: "Data Import", icon: UploadCloud, roles: ["admin", "accountant"] },
  { section: "Finance, Compliance & Admin", to: "/import-review", label: "Import Review", icon: ClipboardList, roles: ["admin", "accountant"] },
  { section: "Finance, Compliance & Admin", to: "/staff", label: "Staff Directory", icon: UserCog, roles: ["admin"] },
  { section: "Finance, Compliance & Admin", to: "/users", label: "User Roles & Locks", icon: UserCog, roles: ["admin"] },
];

const PREVIEWABLE_ROLES: { value: string; label: string }[] = [
  { value: "__real__", label: "Super Admin (Full God-Mode)" },
  { value: "accountant", label: "View As: Accountant / Finance" },
  { value: "doctor", label: "View As: Doctor / Consultant" },
  { value: "counselor", label: "View As: Counselor" },
  { value: "therapist", label: "View As: Therapist (Privacy Masked)" },
  { value: "pharmacist", label: "View As: Pharmacist" },
  { value: "reception", label: "View As: Receptionist" },
  { value: "marketing_head", label: "View As: Marketing Head" },
  { value: "marketing", label: "View As: Marketing / Leads" },
];

function AppShell() {
  const { roles, isSuperAdmin, impersonatedRole, setImpersonatedRole, profile, user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const visible = NAV.filter(
    (n) => n.roles === "all" || (roles.length > 0 && n.roles.some((r) => roles.includes(r))),
  );

  // Group visible items by section while preserving order
  const sections: { name: string; items: NavItem[] }[] = [];
  for (const item of visible) {
    let sec = sections.find((s) => s.name === item.section);
    if (!sec) {
      sec = { name: item.section, items: [] };
      sections.push(sec);
    }
    sec.items.push(item);
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  function handleRolePreviewChange(val: string) {
    if (val === "__real__") {
      setImpersonatedRole(null);
      navigate({ to: "/dashboard" });
      return;
    }
    const r = val as Role;
    setImpersonatedRole(r);
    // Navigate to the default landing screen for that role
    if (r === "therapist") navigate({ to: "/duties" });
    else if (r === "pharmacist") navigate({ to: "/pharmacy" });
    else if (r === "marketing" || r === "marketing_head") navigate({ to: "/marketing-dashboard" });
    else if (r === "doctor") navigate({ to: "/doctor-room" });
    else if (r === "counselor") navigate({ to: "/counselor-room" });
    else if (r === "reception") navigate({ to: "/reception" });
    else navigate({ to: "/dashboard" });
  }

  const roleBadge = roles.length ? roles.map((r) => ROLE_LABELS[r]).join(", ") : "No role assigned";

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight tracking-tight">MediGlo Harmony</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/65">
              MGHYN Clinic ERP · 30 Modules
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-3 overflow-y-auto p-3" style={{ maxHeight: "calc(100vh - 4rem)" }}>
          {sections.map((sec) => (
            <div key={sec.name} className="space-y-0.5">
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/50">
                {sec.name}
              </div>
              {sec.items.map((item) => {
                const active = pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm font-semibold leading-tight text-foreground">
                {profile?.full_name || user?.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {roleBadge}
                {impersonatedRole && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    <Eye className="h-3 w-3" /> Impersonating {ROLE_LABELS[impersonatedRole]}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Super Admin Exclusive Role Impersonation Switcher */}
            {isSuperAdmin && (
              <div className="flex items-center gap-1.5">
                <Select
                  value={impersonatedRole ?? "__real__"}
                  onValueChange={handleRolePreviewChange}
                >
                  <SelectTrigger className="h-8 w-[220px] border-primary/30 bg-primary/5 text-xs font-medium">
                    <Eye className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    <SelectValue placeholder="Preview Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREVIEWABLE_ROLES.map((pr) => (
                      <SelectItem key={pr.value} value={pr.value} className="text-xs">
                        {pr.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {impersonatedRole && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => handleRolePreviewChange("__real__")}
                  >
                    Exit Preview
                  </Button>
                )}
              </div>
            )}

            {(roles.includes("admin") || roles.includes("doctor")) && <AIManagerDrawer />}
            <ChatBox />
            <NotificationBell />
            <DownloadAppButton />
            <ChangePasswordDialog />

            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </header>
        {impersonatedRole && (
          <div className="flex items-center justify-between bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-900 border-b border-amber-500/30">
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              Super Admin Role Preview Active: Viewing the ERP strictly as <strong>{ROLE_LABELS[impersonatedRole]}</strong>. Non-admin users never see the role switcher.
            </span>
            <button
              onClick={() => handleRolePreviewChange("__real__")}
              className="rounded bg-amber-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-800"
            >
              Restore Super Admin View
            </button>
          </div>
        )}
        <MaintenanceBanner />
        <main className="flex-1 p-4 md:p-6">
          {!loading && roles.length === 0 ? (
            <NoRoleNotice />
          ) : (
            <MaintenanceGate pathname={pathname}>
              <Outlet />
            </MaintenanceGate>
          )}
        </main>
        <BrandFooter />
      </div>
    </div>
  );
}

function NoRoleNotice() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border bg-card p-8 text-center">
      <h2 className="text-xl font-semibold text-foreground">Awaiting Role Assignment</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your account is active but has no role yet. Ask the Director/Admin to assign you a role
        (Doctor, Reception or Accountant) from the User Roles screen.
      </p>
    </div>
  );
}
