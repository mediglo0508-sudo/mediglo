import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Wrench } from "lucide-react";

export interface MaintenanceFlag {
  enabled: boolean;
  message: string;
}

/** Routes that are locked while maintenance mode is on. */
const BILLING_ROUTES = ["/pos", "/invoices", "/vouchers"];

export function isBillingRoute(pathname: string) {
  return BILLING_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function useMaintenanceFlag() {
  return useQuery({
    queryKey: ["app-settings", "maintenance_mode"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MaintenanceFlag> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();
      const v = (data?.value ?? {}) as Partial<MaintenanceFlag>;
      return { enabled: !!v.enabled, message: v.message ?? "" };
    },
  });
}

/** Small persistent banner shown to admins while the lock is active. */
export function MaintenanceBanner() {
  const { hasRole } = useAuth();
  const { data } = useMaintenanceFlag();
  if (!data?.enabled || !hasRole("admin")) return null;
  return (
    <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive md:px-6">
      <Wrench className="h-3.5 w-3.5 shrink-0" />
      Maintenance mode ON — billing disabled for other users
    </div>
  );
}

/**
 * Wraps billing surfaces. Admins pass through (they get the banner instead) so
 * fixes can still be verified; everyone else sees the notice from the database.
 */
export function MaintenanceGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { hasRole } = useAuth();
  const { data } = useMaintenanceFlag();

  if (!data?.enabled || hasRole("admin") || !isBillingRoute(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-xl p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Wrench className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Billing Temporarily Unavailable
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{data.message}</p>
        <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground">
          All other modules remain available
        </p>
      </Card>
    </div>
  );
}
