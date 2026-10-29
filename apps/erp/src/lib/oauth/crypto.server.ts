// Server-only crypto primitives for the Harmony OAuth 2.0 authorization server.
// Uses WebCrypto only (Worker-safe). Never import from client code.

const encoder = new TextEncoder();

export function b64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(input: string): Uint8Array {
  const pad = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256b64url(value: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Format: pbkdf2-sha256$<iterations>$<saltB64Url>$<hashB64Url> */
export async function hashClientSecret(secret: string, iterations = 210_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(secret, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyClientSecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const bits = await derive(secret, b64urlDecode(parts[2]), iterations);
  return timingSafeEqual(b64url(bits), parts[3]);
}

async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
}

// ---------------- ES256 JWT ----------------

export interface AccessTokenClaims {
  sub: string;
  email: string | null;
  client_id: string;
  scopes: string[];
  staff_id: string | null;
  role: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

function publicJwk(): JsonWebKey & { kid?: string } {
  return JSON.parse(process.env["OAUTH_JWT_PUBLIC_JWK"] ?? "{}");
}

export function jwks() {
  const pub = publicJwk();
  return { keys: pub.kty ? [pub] : [] };
}

export function issuer(): string {
  return process.env["OAUTH_ISSUER"] ?? "https://mediglo-vision.lovable.app";
}

async function signingKey(): Promise<CryptoKey> {
  const raw = process.env["OAUTH_JWT_PRIVATE_JWK"];
  if (!raw) throw new Error("OAUTH_JWT_PRIVATE_JWK is not configured");
  const jwk = JSON.parse(raw) as JsonWebKey;
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

async function verificationKey(): Promise<CryptoKey> {
  const jwk = publicJwk();
  if (!jwk.kty) throw new Error("OAUTH_JWT_PUBLIC_JWK is not configured");
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, "iss" | "iat" | "exp" | "jti" | "aud"> & { ttlSeconds: number },
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const kid = publicJwk().kid;
  const header = { alg: "ES256", typ: "JWT", ...(kid ? { kid } : {}) };
  const payload: AccessTokenClaims = {
    sub: claims.sub,
    email: claims.email,
    client_id: claims.client_id,
    scopes: claims.scopes,
    staff_id: claims.staff_id,
    role: claims.role,
    iss: issuer(),
    aud: claims.client_id,
    iat: now,
    exp: now + claims.ttlSeconds,
    jti: randomToken(12),
  };
  const signingInput = `${b64url(encoder.encode(JSON.stringify(header)))}.${b64url(
    encoder.encode(JSON.stringify(payload)),
  )}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(),
    encoder.encode(signingInput),
  );
  return { token: `${signingInput}.${b64url(sig)}`, expiresIn: claims.ttlSeconds };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await verificationKey(),
      b64urlDecode(parts[2]) as unknown as BufferSource,
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as AccessTokenClaims;
    if (claims.iss !== issuer()) return null;
    if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** RFC 7636 S256 verification. */
export async function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): Promise<boolean> {
  if (method === "plain") return timingSafeEqual(verifier, challenge);
  if (method !== "S256") return false;
  return timingSafeEqual(await sha256b64url(verifier), challenge);
}
