// Server-only outbox dispatcher: batched, HMAC-signed delivery to Tracker's webhook.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 100;
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600];

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DispatchResult {
  picked: number;
  delivered: number;
  retried: number;
  dead_lettered: number;
  skipped?: string;
}

const ENTITY_ALLOWLIST = new Set(["customers", "appointments", "dues"]);
const ACTION_MAP: Record<string, "upsert" | "delete"> = {
  created: "upsert",
  updated: "upsert",
  deleted: "delete",
};

export async function dispatchOutbox(): Promise<DispatchResult> {
  const webhookUrl = process.env["TRACKER_WEBHOOK_URL"];
  const signingSecret = process.env["TRACKER_WEBHOOK_SECRET"];
  if (!webhookUrl || !signingSecret) {
    return { picked: 0, delivered: 0, retried: 0, dead_lettered: 0, skipped: "webhook not configured" };
  }

  // Atomically claim the batch so overlapping runs never send the same rows.
  const { data: claimed, error } = await (
    supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )("claim_integration_outbox_batch", { p_limit: BATCH_SIZE });
  if (error) throw error;
  const rows = ((claimed ?? []) as Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    event_type: string;
    payload: unknown;
    attempts: number | null;
    created_at: string;
  }>);
  if (!rows.length) return { picked: 0, delivered: 0, retried: 0, dead_lettered: 0 };

  // Unsupported entities/actions are left untouched in the queue for this batch.
  const pending = rows.filter(
    (e) => ENTITY_ALLOWLIST.has(e.entity_type) && ACTION_MAP[e.event_type] !== undefined,
  );
  const skipped = rows.filter((e) => !pending.includes(e));
  if (skipped.length) {
    // Release the claim so they stay untouched and pickable, not stuck.
    await supabaseAdmin
      .from("integration_outbox")
      .update({ claimed_at: null } as never)
      .in("id", skipped.map((e) => e.id));
  }
  if (!pending.length) return { picked: 0, delivered: 0, retried: 0, dead_lettered: 0 };


  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({
    events: pending.map((e) => ({
      event_id: String(e.id),
      entity: e.entity_type,
      action: ACTION_MAP[e.event_type]!,
      occurred_at: e.created_at,
      data: e.payload,
    })),
  });
  const signature = await hmacSha256Hex(signingSecret, `${timestamp}.${rawBody}`);

  let ok = false;
  let failure = "";
  // Tracker's inbound route may not be deployed yet. These responses mean
  // "endpoint not ready" — retry forever on a capped backoff instead of
  // burning attempts and dead-lettering real events.
  const NOT_READY = new Set([404, 405, 501, 502, 503, 504]);
  let notReady = false;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(20_000),
    });

    ok = res.ok;
    if (!ok) {
      notReady = NOT_READY.has(res.status);
      failure = `HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`;
    }
  } catch (e) {
    notReady = true; // network/DNS/timeout — receiver unreachable, not a bad event
    failure = e instanceof Error ? e.message : "delivery failed";
  }


  const ids = pending.map((e) => e.id);

  if (ok) {
    await supabaseAdmin
      .from("integration_outbox")
      .update({ delivered_at: new Date().toISOString(), last_error: null })
      .in("id", ids);
    return { picked: pending.length, delivered: pending.length, retried: 0, dead_lettered: 0 };
  }

  let retried = 0;
  let dead = 0;
  for (const event of pending) {
    const attempts = (event.attempts ?? 0) + 1;
    if (!notReady && attempts >= MAX_ATTEMPTS) {

      await supabaseAdmin.from("integration_outbox_dead_letter").insert({
        outbox_id: event.id,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        event_type: event.event_type,
        payload: event.payload as never,
        attempts,
        last_error: failure,
      });
      await supabaseAdmin.from("integration_outbox").delete().eq("id", event.id);
      dead++;
    } else {
      const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]!;
      const delay = notReady ? Math.min(backoff, 600) : backoff;

      await supabaseAdmin
        .from("integration_outbox")
        .update({
          attempts,
          last_error: failure,
          claimed_at: null,
          next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
        } as never)
        .eq("id", event.id);

      retried++;
    }
  }

  return { picked: pending.length, delivered: 0, retried, dead_lettered: dead };
}
