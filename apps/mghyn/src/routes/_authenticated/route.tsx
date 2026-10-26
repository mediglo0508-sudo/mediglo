import { createFileRoute, redirect, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type Role } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
  ConciergeBell, HeartPulse, ShoppingBag, Printer, DoorOpen, CalendarClock, Layers,
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
  roles: Role[] | "all";
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: "all" },
  { to: "/marketing-dashboard", label: "Marketing Dashboard", icon: BarChart3, roles: ["admin", "marketing_admin", "marketing_head", "marketing"] },
  { to: "/performance", label: "Performance", icon: BarChart3, roles: ["admin", "accountant", "marketing_head", "marketing", "therapist", "doctor", "counselor"] },
  { to: "/follow-ups", label: "Follow-Up Desk", icon: HeartPulse, roles: ["admin", "marketing_admin", "marketing_head", "marketing", "caller"] },
  
  
  { to: "/reception", label: "Reception Desk", icon: ConciergeBell, roles: ["admin", "reception", "accountant", "marketing"] },
  { to: "/appointments", label: "Appointments", icon: CalendarClock, roles: ["admin", "reception", "marketing", "accountant", "doctor", "counselor"] },
  { to: "/consultation", label: "Consultation Room", icon: Stethoscope, roles: ["admin", "doctor", "counselor"] },
  { to: "/doctor-room", label: "Doctor Room", icon: Stethoscope, roles: ["admin", "doctor"] },
  { to: "/counselor-room", label: "Counselor Pricing", icon: BadgeIndianRupee, roles: ["admin", "counselor", "counselor_1", "counselor_2"] },
  { to: "/duties", label: "My Duties (Floor)", icon: HeartPulse, roles: ["admin", "therapist", "doctor", "counselor", "reception"] },
  { to: "/rooms", label: "Live Rooms", icon: DoorOpen, roles: ["admin", "reception", "doctor", "therapist", "counselor"] },
  { to: "/pharmacy", label: "Pharmacy", icon: PackageCheck, roles: ["admin", "pharmacist", "reception", "accountant"] },
  { to: "/pos", label: "POS Billing", icon: ShoppingCart, roles: ["admin", "reception", "accountant", "counselor"] },
  { to: "/invoices", label: "Invoices", icon: BadgeIndianRupee, roles: ["admin", "reception", "accountant", "counselor"] },
  { to: "/customers", label: "Customers (CRM)", icon: Users, roles: "all" },
  { to: "/template-studio", label: "Print Template Studio", icon: Printer, roles: ["admin", "doctor", "reception", "accountant", "counselor"] },
  { to: "/services", label: "Services", icon: ClipboardList, roles: "all" },
  { to: "/packages", label: "Package Master", icon: PackageCheck, roles: ["admin", "reception", "accountant", "counselor"] },
  { to: "/scheduler-rules", label: "Scheduling Rules", icon: Layers, roles: ["admin"] },
  { to: "/inventory", label: "Master Inventory", icon: Boxes, roles: "all" },
  { to: "/purchases", label: "Smart Purchase", icon: ShoppingBag, roles: ["admin", "accountant"] },
  { to: "/vouchers", label: "Vouchers", icon: ScrollText, roles: ["admin", "accountant"] },
  { to: "/expenses", label: "Expenses", icon: Wallet, roles: ["admin", "accountant"] },
  { to: "/reconciliation", label: "Bank Reconciliation", icon: Landmark, roles: ["admin", "accountant"] },
  { to: "/analytics", label: "Profitability", icon: BarChart3, roles: ["admin", "accountant"] },
  { to: "/export", label: "Tax Export Hub", icon: FileDown, roles: ["admin", "accountant"] },
  { to: "/ingest", label: "Data Import", icon: UploadCloud, roles: ["admin", "accountant"] },
  { to: "/import-review", label: "Import Review", icon: ClipboardList, roles: ["admin", "accountant"] },

  { to: "/staff", label: "Staff", icon: UserCog, roles: ["admin"] },
  { to: "/users", label: "User Roles", icon: UserCog, roles: ["admin"] },
];

function AppShell() {
  const { roles, profile, user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const visible = NAV.filter((n) => n.roles === "all" || (roles.length > 0 && n.roles.some((r) => roles.includes(r))));

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
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
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <Activity className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-bold tracking-tight">MGHYN</span>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-3" style={{ maxHeight: "calc(100vh - 4rem)" }}>
          {visible.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
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
              <p className="text-xs text-muted-foreground">{roleBadge}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
