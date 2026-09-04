// One-time backup codes for the 2FA step, for when the admin loses
// access to their authenticator app. Stored as SHA-256 hashes in KV —
// never plaintext — shown to the admin exactly once, at generation time,
// and burned (deleted) the instant one is used.

const PREFIX = 'admin_2fa_recovery:';
const CODE_COUNT = 8;
// Excludes 0/O/1/I so a handwritten copy can't be misread.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = '';
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export async function countRecoveryCodes(env) {
  if (!env.ADMIN_KV) return 0;
  const list = await env.ADMIN_KV.list({ prefix: PREFIX });
  return list.keys.length;
}

// Wipes any existing batch and issues a fresh one. Returns the plaintext
// codes — the only time they're ever available outside a hash.
export async function regenerateRecoveryCodes(env) {
  if (!env.ADMIN_KV) throw new Error('kv-not-bound');

  const existing = await env.ADMIN_KV.list({ prefix: PREFIX });
  await Promise.all(existing.keys.map(k => env.ADMIN_KV.delete(k.name)));

  const codes = Array.from({ length: CODE_COUNT }, randomCode);
  await Promise.all(codes.map(async code => {
    const hash = await sha256Hex(code);
    await env.ADMIN_KV.put(PREFIX + hash, '1');
  }));
  return codes;
}

// Verifies a code and immediately burns it (single use). Format is
// case-insensitive and tolerant of stray spaces around the dash.
export async function consumeRecoveryCode(env, code) {
  if (!env.ADMIN_KV || !code) return false;
  const clean = String(code).trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(clean)) return false;
  const normalized = clean.includes('-') ? clean : `${clean.slice(0, 5)}-${clean.slice(5)}`;

  const hash = await sha256Hex(normalized);
  const key = PREFIX + hash;
  const exists = await env.ADMIN_KV.get(key);
  if (!exists) return false;
  await env.ADMIN_KV.delete(key);
  return true;
}
