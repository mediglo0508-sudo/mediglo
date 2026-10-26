import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { describeAuthorization, decideAuthorization, type AuthorizeDescription } from "@/lib/oauth.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck, Check } from "lucide-react";

interface AuthorizeSearch {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256" | "plain";
  response_type: string;
}

export const Route = createFileRoute("/oauth/authorize")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): AuthorizeSearch => ({
    client_id: typeof s.client_id === "string" ? s.client_id : "",
    redirect_uri: typeof s.redirect_uri === "string" ? s.redirect_uri : "",
    scope: typeof s.scope === "string" ? s.scope : "",
    state: typeof s.state === "string" ? s.state : "",
    code_challenge: typeof s.code_challenge === "string" ? s.code_challenge : "",
    code_challenge_method: s.code_challenge_method === "plain" ? "plain" : "S256",
    response_type: typeof s.response_type === "string" ? s.response_type : "code",
  }),
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
  },
  head: () => ({
    meta: [
      { title: "Authorize application — MGHYN Clinic ERP" },
      {
        name: "description",
        content: "Review and approve access for a connected application using your MGHYN staff account.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Authorize application — MGHYN Clinic ERP" },
      { property: "og:description", content: "Approve access for a connected MGHYN application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthorizePage,
});

function AuthorizePage() {
  const search = Route.useSearch();
  const [info, setInfo] = useState<AuthorizeDescription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoApproved = useRef(false);

  const payload = {
    client_id: search.client_id,
    redirect_uri: search.redirect_uri,
    scope: search.scope,
    state: search.state,
    code_challenge: search.code_challenge,
    code_challenge_method: search.code_challenge_method,
  };

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await decideAuthorization({ data: { ...payload, approve } });
      if (res.redirectTo) window.location.href = res.redirectTo;
      else {
        setError(res.error ?? "Authorization failed.");
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed.");
      setBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (search.response_type !== "code") {
        setInfo({ ok: false, error: "Only the authorization code flow is supported." });
        return;
      }
      if (!search.client_id || !search.redirect_uri || !search.code_challenge) {
        setInfo({ ok: false, error: "This authorization link is incomplete." });
        return;
      }
      try {
        const res = await describeAuthorization({ data: payload });
        if (!alive) return;
        setInfo(res);
        if (res.ok && res.alreadyConsented && !autoApproved.current) {
          autoApproved.current = true;
          void decide(true);
        }
      } catch (e) {
        if (alive) setInfo({ ok: false, error: e instanceof Error ? e.message : "Failed to load request." });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.client_id, search.redirect_uri, search.scope, search.code_challenge]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-tight">MGHYN Clinic ERP</span>
        </div>

        {!info && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking this request…
          </p>
        )}

        {info && !info.ok && (
          <>
            <h1 className="mt-4 text-xl font-bold text-foreground">Request rejected</h1>
            <p role="alert" className="mt-2 text-sm text-destructive">
              {info.error}
            </p>
          </>
        )}

        {info?.ok && (
          <>
            <h1 className="mt-4 text-xl font-bold text-foreground">
              Connect {info.clientName} to your account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {info.clientName} will act as you, limited to your own MGHYN role permissions.
            </p>

            <ul className="mt-5 space-y-2">
              {info.scopes?.map((s) => (
                <li key={s.scope} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  {s.label}
                </li>
              ))}
            </ul>

            {!!info.deniedScopes?.length && (
              <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Not granted — your role does not permit: {info.deniedScopes.join(", ")}
              </p>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              This does not bypass MGHYN permissions or backend policies. Everything done through{" "}
              {info.clientName} stays recorded against your name.
            </p>

            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve
              </Button>
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                Cancel connection
              </Button>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
