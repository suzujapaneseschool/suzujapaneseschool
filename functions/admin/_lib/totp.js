// TOTP (RFC 6238) for the admin 2FA step. No external dependency — Pages
// Functions only have Web Crypto, and HOTP/TOTP's HMAC-SHA1-over-a-counter
// scheme maps directly onto crypto.subtle.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export function generateSecret(byteLength = 20) {
  return base32Encode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function buildOtpauthUri(secret, { label, issuer }) {
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodedLabel}?${params.toString()}`;
}

async function hotp(secretBytes, counter) {
  // Counter as an 8-byte big-endian integer. JS bitwise ops are 32-bit,
  // so the high word is written separately — it stays 0 until roughly
  // the year 6000 at a 30s step, so this is effectively exact forever.
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24)
    | ((mac[offset + 1] & 0xff) << 16)
    | ((mac[offset + 2] & 0xff) << 8)
    | (mac[offset + 3] & 0xff);

  return String(code % 1000000).padStart(6, '0');
}

export async function generateTOTP(base32Secret, atMs = Date.now(), step = 30) {
  const counter = Math.floor(atMs / 1000 / step);
  return hotp(base32Decode(base32Secret), counter);
}

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Accepts a code valid for the current 30s step or one step to either
// side — the standard tolerance for clock drift between the server and
// the visitor's phone.
export async function verifyTOTP(base32Secret, token, { window = 1, step = 30 } = {}) {
  if (!base32Secret || !token) return false;
  const clean = String(token).trim();
  if (!/^\d{6}$/.test(clean)) return false;

  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const candidate = await generateTOTP(base32Secret, now + w * step * 1000, step);
    if (timingSafeEqualStr(candidate, clean)) return true;
  }
  return false;
}
