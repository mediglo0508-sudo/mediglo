import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
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
  realRoles: Role[];
  impersonatedRole: Role | null;
  setImpersonatedRole: (r: Role | null) => void;
  isSuperAdmin: boolean;
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

/** Owner accounts that keep a UI-only admin fallback when no user_roles row exists. */
const ROOT_ADMIN_EMAILS = new Set([
  "admin@mediglo.in",
  "himuydv5@gmail.com",
  "vikas@mediglo.in",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [realRoles, setRealRoles] = useState<Role[]>([]);
  const [impersonatedRole, setImpersonatedRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeta = useCallback(async (uid: string, email?: string | null) => {
    try {
      const boot = (await bootstrapCurrentUser({ data: undefined })) as BootstrapResult;
      if (boot?.roles?.length) setRealRoles(boot.roles);
      if (boot?.profile) setProfile(boot.profile);
    } catch (err) {
      console.warn("[auth] bootstrapCurrentUser unavailable, using client role lookup:", err);
    }

    const [{ data: roleRows }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name, phone").eq("id", uid).maybeSingle(),
    ]);
    const nextRoles = ((roleRows ?? []) as { role: Role }[]).map((r) => r.role);
    if (nextRoles.length) {
      setRealRoles(nextRoles);
    } else if (email && ROOT_ADMIN_EMAILS.has(email.toLowerCase())) {
      setRealRoles(["admin"]);
    }
    if (prof) setProfile(prof as Profile);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    if (data.session?.user) await loadMeta(data.session.user.id, data.session.user.email);
    else {
      setRealRoles([]);
      setImpersonatedRole(null);
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
        setTimeout(() => {
          loadMeta(sess.user.id, sess.user.email).finally(() => setLoading(false));
        }, 0);
      } else if (event === "SIGNED_OUT") {
        setRealRoles([]);
        setImpersonatedRole(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMeta]);

  const isSuperAdmin = realRoles.includes("admin");
  const roles = useMemo<Role[]>(
    () => (isSuperAdmin && impersonatedRole ? [impersonatedRole] : realRoles),
    [isSuperAdmin, impersonatedRole, realRoles],
  );

  const hasRole = useCallback((r: Role) => roles.includes(r), [roles]);
  const isFinance = roles.includes("admin") || roles.includes("accountant");
  const canBilling = isFinance || roles.includes("reception") || roles.includes("counselor") || roles.includes("pharmacist");

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRealRoles([]);
    setImpersonatedRole(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        realRoles,
        impersonatedRole,
        setImpersonatedRole,
        isSuperAdmin,
        profile,
        loading,
        hasRole,
        isFinance,
        canBilling,
        refresh,
        signOut,
      }}
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
  doctor: "Doctor / Consultant",
  reception: "Receptionist",
  accountant: "Accountant / Finance",
  marketing: "Marketing / Leads",
  marketing_admin: "Marketing Admin",
  marketing_head: "Marketing Head",
  caller: "Follow-Up Caller",
  counselor: "Counselor",
  counselor_1: "Counselor 1",
  counselor_2: "Counselor 2",
  therapist: "Therapist",
  pharmacist: "Pharmacist",
};

/** Helper to mask patient phone numbers for Therapist privacy (Module 2). */
export function maskPhoneForRole(phone: string | null | undefined, roles: Role[]): string {
  if (!phone) return "—";
  const isTherapistOnly = roles.includes("therapist") && !roles.includes("admin") && !roles.includes("reception") && !roles.includes("doctor") && !roles.includes("counselor");
  if (!isTherapistOnly) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "******";
  return `******${digits.slice(-4)}`;
}
