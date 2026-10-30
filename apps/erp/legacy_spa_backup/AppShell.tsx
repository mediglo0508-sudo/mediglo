import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Activity } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV_ITEMS } from "./nav-items";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { fullName, roles, signOut, user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.roles === "all" || item.roles.some((r) => roles.includes(r))
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold leading-none">MediGlo Harmony</div>
            <div className="text-[11px] text-muted-foreground">Clinic ERP</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 truncate px-2 text-xs text-muted-foreground">{user?.email}</div>
          <div className="mb-2 flex flex-wrap gap-1 px-2">
            {roles.map((r) => (
              <span key={r} className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-foreground">
                {r}
              </span>
            ))}
          </div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
          <div className="font-bold">MediGlo Harmony</div>
          <NotificationBell />
        </header>
        <header className="hidden h-14 items-center justify-between border-b border-border px-6 md:flex">
          <div className="text-sm text-muted-foreground">Signed in as <span className="font-semibold text-foreground">{fullName ?? user?.email}</span></div>
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
