import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapCurrentUser } from "@/lib/auth.functions";

export type Role =
  | "admin"
  | "doctor"
  | "reception"
  | "accountant"
  | "marketing"
  | "marketing_admin"
  | "marketing_head"
  | "caller"
  | "counselor"
  | "counselor_1"
  | "counselor_2"
  | "therapist"
  | "pharmacist";

interface Profile {
  full_name: string | null;
  phone: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: Role[];
  profile: Profile | null;
  loading: boolean;
  hasRole: (r: Role) => boolean;
  isFinance: boolean;
  canBilling: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface BootstrapResult {
  roles?: Role[];
  profile?: Profile | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Owner account that keeps a UI-only admin fallback when no user_roles row exists. */
const ROOT_ADMIN_EMAIL = "admin@mediglo.in";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeta = useCallback(async (uid: string, email?: string | null) => {
    // bootstrapCurrentUser needs SUPABASE_SERVICE_ROLE_KEY on the server. On a plain
    // localhost install that key may be absent, so treat it as best-effort and always
    // fall through to the RLS-protected client queries below.
    try {
      const boot = (await bootstrapCurrentUser({ data: undefined })) as BootstrapResult;
      setRoles(boot.roles ?? []);
      setProfile(boot.profile ?? null);
    } catch (err) {
      console.warn("[auth] bootstrapCurrentUser unavailable, using client role lookup:", err);
    }

    const [{ data: roleRows }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name, phone").eq("id", uid).maybeSingle(),
    ]);
    const nextRoles = ((roleRows ?? []) as { role: Role }[]).map((r) => r.role);
    if (nextRoles.length) {
      setRoles(nextRoles);
    } else if (email?.toLowerCase() === ROOT_ADMIN_EMAIL) {
      // UI-only fallback for the owner account (carried over from apps/erp). It does NOT
      // grant database privileges: every query is still filtered by RLS on user_roles.
      // Replace by inserting a real row: insert into user_roles(user_id, role) values ('<uid>','admin');
      console.warn("[auth] root admin has no user_roles row; applying UI-only admin fallback");
      setRoles(["admin"]);
    }
    if (prof) setProfile(prof as Profile);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    if (data.session?.user) await loadMeta(data.session.user.id, data.session.user.email);
    else {
      setRoles([]);
      setProfile(null);
    }
  }, [loadMeta]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadMeta(data.session.user.id, data.session.user.email).finally(() => active && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setLoading(true);
        // defer to avoid deadlock inside the callback
        setTimeout(() => {
          loadMeta(sess.user.id, sess.user.email).finally(() => setLoading(false));
        }, 0);
      } else if (event === "SIGNED_OUT") {
        setRoles([]);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMeta]);

  const hasRole = useCallback((r: Role) => roles.includes(r), [roles]);
  const isFinance = roles.includes("admin") || roles.includes("accountant");
  const canBilling = isFinance || roles.includes("reception") || roles.includes("counselor");

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, roles, profile, loading, hasRole, isFinance, canBilling, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin / Director",
  doctor: "Doctor",
  reception: "Front-Desk / Billing",
  accountant: "Accountant / Finance",
  marketing: "Marketing / Leads",
  marketing_admin: "Marketing Admin",
  marketing_head: "Marketing Head",
  caller: "Follow-Up Caller",
  counselor: "Counselor",
  counselor_1: "Counselor 1",
  counselor_2: "Counselor 2",
  therapist: "Therapist / Nursing",
  pharmacist: "Pharmacy Staff",
};
