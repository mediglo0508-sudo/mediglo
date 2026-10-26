import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useBillingAccess, BILLING_LOCKED_MESSAGE } from "@/lib/billing-access";
import { fmtDateTime } from "@/lib/date-format";

/** Full-screen notice shown in place of any billing surface while the user is locked. */
export function BillingLockedNotice() {
  const access = useBillingAccess();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-xl p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Billing Access Locked
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {BILLING_LOCKED_MESSAGE}
        </p>
        {access.lock_reason && (
          <p className="mt-3 text-sm font-medium text-foreground">
            Reason: {access.lock_reason}
          </p>
        )}
        {(access.locked_by_name || access.locked_at) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Locked by {access.locked_by_name ?? "Admin"}
            {access.locked_at ? ` on ${fmtDateTime(access.locked_at)}` : ""}
          </p>
        )}
        <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground">
          All other modules remain available
        </p>
      </Card>
    </div>
  );
}

/** Replaces a billing screen with the notice while the signed-in user is locked. */
export function BillingLockGate({ children }: { children: ReactNode }) {
  const { billing_locked } = useBillingAccess();
  if (!billing_locked) return <>{children}</>;
  return <BillingLockedNotice />;
}

/** Slim strip for screens that stay readable but lose their write actions. */
export function BillingLockBanner() {
  const access = useBillingAccess();
  if (!access.billing_locked) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {BILLING_LOCKED_MESSAGE}
        {access.lock_reason ? ` Reason: ${access.lock_reason}` : ""}
      </span>
    </div>
  );
}
