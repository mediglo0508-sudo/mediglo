import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const { session, signInWithPassword, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : await signUp(email, password, fullName);
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (mode === "signup") {
      toast.success("Account created. An admin needs to assign your role before you can access clinic data.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/20 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-border shadow-lg md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6" />
            <span className="text-lg font-bold">MediGlo Harmony</span>
          </div>
          <div>
            <h1 className="mb-3 text-3xl font-bold leading-tight">Clinic Compliance Engine</h1>
            <p className="text-sm text-primary-foreground/80">
              Tally-style accounting, GST-compliant billing, clinical CRM and per-service profitability —
              in one secure, role-based workspace, connected to the MediGlo Tracker.
            </p>
          </div>
          <div className="text-xs text-primary-foreground/60">© MediGlo · GST/ITR Ready</div>
        </div>

        <Card className="rounded-none border-0 shadow-none">
          <CardContent className="p-8">
            <h2 className="mb-1 text-2xl font-bold">{mode === "signin" ? "Staff Sign In" : "Create Account"}</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {mode === "signin" ? "Access your role-based clinic dashboard." : "New staff member registration."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1" />
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@mediglo.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <button
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "New staff member? Create an account" : "Already have an account? Sign in"}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
