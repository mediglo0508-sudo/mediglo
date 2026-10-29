import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authorizeInput = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().default(""),
  state: z.string().optional().nullable(),
  code_challenge: z.string().min(20),
  code_challenge_method: z.enum(["S256", "plain"]).default("S256"),
});

export interface AuthorizeDescription {
  ok: boolean;
  error?: string;
  clientName?: string;
  redirectUri?: string;
  scopes?: { scope: string; label: string }[];
  deniedScopes?: string[];
  alreadyConsented?: boolean;
}

/** Validates an /oauth/authorize request for the signed-in staff member. */
export const describeAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => authorizeInput.parse(d))
  .handler(async ({ data, context }): Promise<AuthorizeDescription> => {
    const core = await import("@/lib/oauth/core.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await core.rateLimit(`authorize:${context.userId}`, 30, 60))) {
      return { ok: false, error: "Too many authorization attempts. Please wait a minute." };
    }

    const client = await core.loadClient(data.client_id);
    if (!client || !client.active) {
      await core.logAccess({
        client_id: data.client_id,
        user_id: context.userId,
        endpoint: "authorize",
        ok: false,
        error: "unknown or inactive client",
      });
      return { ok: false, error: "This application is not registered or has been deactivated." };
    }
    if (!client.redirect_uris.includes(data.redirect_uri)) {
      await core.logAccess({
        client_id: data.client_id,
        user_id: context.userId,
        endpoint: "authorize",
        ok: false,
        error: "redirect_uri not registered",
      });
      return { ok: false, error: "The callback address for this request is not registered." };
    }

    const requested = core.parseScopeParam(data.scope);
    const live = await core.userScopes(context.userId);
    const granted = core.intersectScopes(requested, client.allowed_scopes, live);
    const denied = requested.filter((s) => !granted.includes(s));

    const { data: consent } = await supabaseAdmin
      .from("oauth_consents")
      .select("scopes, revoked_at")
      .eq("client_id", data.client_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    const alreadyConsented =
      !!consent &&
      !consent.revoked_at &&
      granted.every((s) => (consent.scopes ?? []).includes(s));

    return {
      ok: true,
      clientName: client.name,
      redirectUri: data.redirect_uri,
      scopes: granted.map((s) => ({ scope: s, label: core.SCOPE_LABELS[s] ?? s })),
      deniedScopes: denied,
      alreadyConsented,
    };
  });

/** Issues a single-use authorization code (or a denial redirect). */
export const decideAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => authorizeInput.extend({ approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<{ redirectTo?: string; error?: string }> => {
    const core = await import("@/lib/oauth/core.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const client = await core.loadClient(data.client_id);
    if (!client || !client.active) return { error: "Unknown or inactive application." };
    if (!client.redirect_uris.includes(data.redirect_uri)) {
      return { error: "Unregistered callback address." };
    }

    const target = new URL(data.redirect_uri);
    if (data.state) target.searchParams.set("state", data.state);

    if (!data.approve) {
      target.searchParams.set("error", "access_denied");
      await core.logAccess({
        client_id: data.client_id,
        user_id: context.userId,
        endpoint: "authorize:deny",
        ok: true,
      });
      return { redirectTo: target.toString() };
    }

    const requested = core.parseScopeParam(data.scope);
    const live = await core.userScopes(context.userId);
    const scopes = core.intersectScopes(requested, client.allowed_scopes, live);
    if (!scopes.length) {
      return { error: "Your Harmony role does not permit any of the requested permissions." };
    }

    const code = await core.issueAuthorizationCode({
      clientId: data.client_id,
      userId: context.userId,
      redirectUri: data.redirect_uri,
      codeChallenge: data.code_challenge,
      codeChallengeMethod: data.code_challenge_method,
      scopes,
    });

    await supabaseAdmin.from("oauth_consents").upsert(
      {
        client_id: data.client_id,
        user_id: context.userId,
        scopes,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "client_id,user_id" },
    );

    target.searchParams.set("code", code);
    await core.logAccess({
      client_id: data.client_id,
      user_id: context.userId,
      endpoint: "authorize:approve",
      scopes,
      ok: true,
    });
    await core.auditIntegration({
      userId: context.userId,
      action: "OAUTH_AUTHORIZED",
      entityType: "oauth_clients",
      entityId: data.client_id,
      newValue: { scopes, client: client.name },
    });

    return { redirectTo: target.toString() };
  });
