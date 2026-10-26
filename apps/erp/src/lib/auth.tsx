import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { BillingAccess, StaffRole } from "@/types/domain";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  fullName: string | null;
  roles: StaffRole[];
  access: BillingAccess | null;
  loading: boolean;
  hasRole: (...roles: StaffRole[]) => boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [access, setAccess] = useState<BillingAccess | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAccessAndProfile(userId: string) {
    const [{ data: accessRows }, { data: profile }] = await Promise.all([
      supabase.rpc("my_billing_access"),
      supabase.from("staff_profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    ]);
    // my_billing_access() returns a single row (see 0008_functions.sql)
    const row = Array.isArray(accessRows) ? accessRows[0] : accessRows;
    if (row) {
      setAccess({
        can_bill: row.can_bill,
        can_view_finance: row.can_view_finance,
        is_admin: row.is_admin,
        roles: row.roles ?? [],
      });
    } else {
      setAccess({ can_bill: false, can_view_finance: false, is_admin: false, roles: [] });
    }
    setFullName(profile?.full_name ?? null);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadAccessAndProfile(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        await loadAccessAndProfile(newSession.user.id);
      } else {
        setAccess(null);
        setFullName(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      fullName,
      roles: access?.roles ?? [],
      access,
      loading,
      hasRole: (...roles: StaffRole[]) => roles.some((r) => (access?.roles ?? []).includes(r)),
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password, fullNameInput) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullNameInput } },
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshAccess: async () => {
        if (session?.user) await loadAccessAndProfile(session.user.id);
      },
    }),
    [session, fullName, access, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
