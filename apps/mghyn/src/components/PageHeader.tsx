import { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border bg-card p-8 text-center">
      <h2 className="text-xl font-semibold text-destructive">Access Denied</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You do not have the required security clearance to view this module. Financial and accounting data is
        restricted to Admin and Accountant roles.
      </p>
    </div>
  );
}
