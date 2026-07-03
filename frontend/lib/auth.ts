// Minimal self-hosted session auth: HMAC-SHA256 signed token in an httpOnly
// cookie. Uses Web Crypto only so it runs in both Node route handlers and the
// Edge middleware runtime. Credentials come from env (ADMIN_USERNAME /
// ADMIN_PASSWORD); no external auth service involved.

const COOKIE_NAME = "opencli_session"
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const AUTH_COOKIE = COOKIE_NAME

function secret(): string {
  // AUTH_SECRET hardens the HMAC; fall back to password-derived so a bare
  // ADMIN_PASSWORD setup still works out of the box.
  return process.env.AUTH_SECRET ?? `opencli:${process.env.ADMIN_PASSWORD ?? "admin"}`
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? "admin"
  const expectedPass = process.env.ADMIN_PASSWORD ?? "admin"
  return username === expectedUser && password === expectedPass
}

/** Create a signed session token: base64(user.exp).signature */
export async function createSession(username: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `${username}.${exp}`
  const sig = await hmac(payload)
  return `${btoa(payload)}.${sig}`
}

/** Verify a session token; returns the username or null. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot < 0) return null
  const [b64, sig] = [token.slice(0, dot), token.slice(dot + 1)]
  let payload: string
  try {
    payload = atob(b64)
  } catch {
    return null
  }
  if ((await hmac(payload)) !== sig) return null
  const sep = payload.lastIndexOf(".")
  const username = payload.slice(0, sep)
  const exp = Number(payload.slice(sep + 1))
  if (!Number.isFinite(exp) || Date.now() > exp) return null
  return username
}
