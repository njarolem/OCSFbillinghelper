// Signed cookie helpers for the auth gate.
// HMAC-SHA256 over the payload; constant-time comparison on verify.
// Web Crypto API works in both Node and Edge runtimes.

const COOKIE_NAME = "ocsf_auth";
const TTL_DAYS = 30;

const enc = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signCookie(secret: string): Promise<string> {
  const issued = Date.now();
  const payload = JSON.stringify({ v: 1, iat: issued });
  const payloadB64 = toBase64Url(enc.encode(payload).buffer);
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifyCookie(
  cookieValue: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await importKey(secret);
    const sigBytes = fromBase64Url(sigB64);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer as ArrayBuffer,
      enc.encode(payloadB64),
    );
    if (!ok) return false;
    // Check expiry.
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadB64)),
    ) as { iat?: number };
    if (typeof payload.iat !== "number") return false;
    const ageMs = Date.now() - payload.iat;
    return ageMs >= 0 && ageMs <= TTL_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// Constant-time string compare for password check.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const AUTH_COOKIE_MAX_AGE = TTL_DAYS * 24 * 60 * 60;
