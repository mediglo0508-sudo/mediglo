import { ShieldAlert } from "lucide-react";

/**
 * Strict data-redaction rule from the original ERP brief: a user without the
 * right role never even reaches the data-fetching code for a restricted
 * screen - they land here instead, before any query runs.
 */
export function AccessDenied() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert className="h-10 w-10 text-destructive" />
      <h2 className="text-xl font-semibold">Access denied</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your role doesn't have permission to view this page. If you believe this is a mistake,
        ask an administrator to review your role assignment.
      </p>
    </div>
  );
}
