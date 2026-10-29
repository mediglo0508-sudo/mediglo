import { useState } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { bootstrapCurrentUser } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Activity, Loader2 } from "lucide-react";
import hmuLogo from "@/assets/hmu-logo.png";

export const Route = createFileRoute("/auth")({
  // Session lives in localStorage, so the server can never resolve this gate —
  // rendering it on the server caused a hydration mismatch on every visit.
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const raw = s.next;
    const safe = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;
    return safe ? { next: safe } : {};
  },
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      if (search.next) throw redirect({ href: search.next });
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign In — MGHYN Clinic ERP" },
      { name: "description", content: "Secure staff login for the MGHYN clinic ERP — billing, appointments, inventory and patient records." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sign In — MGHYN Clinic ERP" },
      { property: "og:description", content: "Secure staff login for the MGHYN clinic ERP — billing, appointments, inventory and patient records." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mediglo-vision.lovable.app/auth" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mediglo-vision.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const afterAuth = () => {
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/dashboard" });
  };
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent to your email.");
        setMode("login");
        return;
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: next ? `${window.location.origin}${next}` : window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome to MGHYN.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) await bootstrapCurrentUser({ data: undefined });
      afterAuth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: next ? `${window.location.origin}${next}` : window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) await bootstrapCurrentUser({ data: undefined });
    afterAuth();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl shadow-[var(--shadow-elegant)] md:grid-cols-2">
        <div
          className="hidden flex-col justify-between p-10 text-primary-foreground md:flex"
          style={{ background: "var(--gradient-brand)" }}
        >
          <div className="flex items-center gap-2">
            <Activity className="h-7 w-7" />
            <span className="text-xl font-bold tracking-tight">MGHYN</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight">Clinic Compliance Engine</h1>
            <p className="mt-3 text-sm opacity-90">
              Tally-style accounting, GST 5% billing, clinical CRM and per-service profitability — all in one secure
              multi-role workspace.
            </p>
          </div>
          <p className="text-xs opacity-75">© MGHYN · GST/ITR Ready</p>
        </div>

        <Card className="rounded-none border-0 p-8">
          <h2 className="text-2xl font-bold text-foreground">
            {mode === "login" ? "Staff Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Access your role-based clinic dashboard."
              : mode === "signup"
                ? "The first account becomes the Director (Admin)."
                : "Enter your email and we'll send you a password reset link."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Charan Singh" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@mediglo.in" />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>
            )}
            {mode === "login" && (
              <div className="text-right">
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode("forgot")}>
                  Forgot Password?
                </button>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
            </Button>
          </form>

          {mode !== "forgot" && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
                Continue with Google
              </Button>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "forgot" ? (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("login")}>
                Back to Sign in
              </button>
            ) : (
              <>
                {mode === "login" ? "New staff member?" : "Already registered?"}{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login" ? "Create an account" : "Sign in"}
                </button>
              </>
            )}
          </p>

          <div className="mt-6 flex flex-col items-center border-t pt-5">
            <div className="rounded-2xl bg-logo-bg p-3 shadow-lg ring-1 ring-white/10">
              <img
                src={hmuLogo}
                alt="HMU Softwares logo"
                loading="lazy"
                width={48}
                height={48}
                className="h-12 w-12 object-contain brightness-110 contrast-125"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
