// Session + password handling for the admin dashboard.
//
// Password is never stored in plaintext: only a PBKDF2-SHA256 hash
// (ADMIN_PASSWORD_HASH) plus its salt (ADMIN_PASSWORD_SALT) live as
// Cloudflare Pages env vars — see setup instructions for how to generate
// them. A verified login gets a signed, HttpOnly session cookie (HMAC'd
// with ADMIN_SESSION_SECRET) instead of a server-side session store.

const SESSION_COOKIE = 'suzu_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const PBKDF2_ITERATIONS = 100000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// Constant-time comparison so a mistyped password can't be brute-forced
// faster by timing how quickly the mismatch is detected.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(env, password) {
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_SALT || !password) return false;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(env.ADMIN_PASSWORD_SALT), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const derivedHex = toHex(derived);
  return timingSafeEqual(enc.encode(derivedHex), enc.encode(env.ADMIN_PASSWORD_HASH.trim().toLowerCase()));
}

async function hmac(env, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.ADMIN_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toHex(sig);
}

export async function createSessionCookie(env) {
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `admin.${expires}`;
  const sig = await hmac(env, payload);
  return `${SESSION_COOKIE}=${payload}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function requireAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false; // misconfigured — fail closed
  const cookie = getCookie(request, SESSION_COOKIE);
  if (!cookie) return false;

  const parts = cookie.split('.');
  if (parts.length !== 3) return false;
  const [tag, expiresStr, sig] = parts;
  if (tag !== 'admin') return false;

  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return false;

  const expectedSig = await hmac(env, `${tag}.${expiresStr}`);
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(sig), enc.encode(expectedSig));
}

// Simple failed-login lockout, keyed by IP, backed by KV (optional — if
// ADMIN_KV isn't bound this just never blocks anyone).
const MAX_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS = 15 * 60;

export async function checkRateLimit(env, ip) {
  if (!env.ADMIN_KV || !ip) return { allowed: true, count: 0 };
  const raw = await env.ADMIN_KV.get(`admin_login_fail:${ip}`);
  const count = raw ? parseInt(raw, 10) : 0;
  return { allowed: count < MAX_ATTEMPTS, count };
}

export async function recordFailedLogin(env, ip, count) {
  if (!env.ADMIN_KV || !ip) return;
  await env.ADMIN_KV.put(`admin_login_fail:${ip}`, String(count + 1), { expirationTtl: LOCKOUT_TTL_SECONDS });
}

export async function clearFailedLogin(env, ip) {
  if (!env.ADMIN_KV || !ip) return;
  await env.ADMIN_KV.delete(`admin_login_fail:${ip}`);
}
