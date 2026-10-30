import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { StaffRole } from "@/types/domain";
import { AccessDenied } from "./AccessDenied";

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: StaffRole[] }) {
  const { session, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading MediGlo Harmony...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0 && !hasRole(...roles)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
