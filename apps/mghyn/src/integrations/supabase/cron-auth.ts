/**
 * Shared-secret guard for scheduled / machine-triggered endpoints.
 * Accepts `x-cron-secret: <secret>` or `Authorization: Bearer <secret>`.
 * Secret is read from CRON_SECRET, falling back to OUTBOX_DISPATCH_SECRET.
 */
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function constantTimeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Returns a Response when the caller is not authorised, otherwise null. */
export function authenticateCronRequest(request: Request): Response | null {
  const expected = process.env["CRON_SECRET"] ?? process.env["OUTBOX_DISPATCH_SECRET"];
  if (!expected) return jsonError("cron secret not configured", 503);

  const header = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const presented = header ?? bearer ?? "";

  if (!constantTimeEqual(presented, expected)) return jsonError("unauthorized", 401);
  return null;
}
