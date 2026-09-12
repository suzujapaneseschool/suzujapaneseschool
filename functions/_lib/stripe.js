// Prices are defined ONLY here, server-side — never trust a price sent
// from the browser. Keep these in sync with the amounts shown in the
// Pricing section of index.html.
//
// JPY is a zero-decimal currency for Stripe (unit_amount IS the yen
// amount, no ×100), and it's the ONLY currency this site charges in —
// every Checkout Session below is created with currency: 'jpy'.
export const PLANS = {
  ebi:  { amount: 29000, name: 'Ebi Plan — Suzu Sensei (1 lesson/week)' },
  kani: { amount: 58000, name: 'Kani Plan — Suzu Sensei (2 lessons/week)' },
  uni:  { amount: 85000, name: 'Uni Plan — Suzu Sensei (3 lessons/week)' }
};

export const CURRENCY = 'jpy';

// Encodes a (possibly nested) params object into Stripe's expected
// application/x-www-form-urlencoded body, e.g. { line_items: [{ price_data:
// { currency: 'jpy' } }] } -> "line_items[0][price_data][currency]=jpy".
function encodeParams(obj, prefix, parts) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === 'object') encodeParams(v, `${k}[${i}]`, parts);
        else parts.push(`${encodeURIComponent(`${k}[${i}]`)}=${encodeURIComponent(v)}`);
      });
    } else if (typeof value === 'object') {
      encodeParams(value, k, parts);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`);
    }
  }
}

export async function stripeRequest(env, path, params = {}, method = 'POST') {
  const isGet = method === 'GET';
  let url = `https://api.stripe.com/v1/${path}`;
  let body;
  if (isGet) {
    const parts = [];
    encodeParams(params, '', parts);
    if (parts.length) url += `?${parts.join('&')}`;
  } else {
    const parts = [];
    encodeParams(params, '', parts);
    body = parts.join('&');
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || 'stripe-request-failed');
    err.detail = data;
    throw err;
  }
  return data;
}

// Verifies the `stripe-signature` header per Stripe's manual webhook
// verification scheme (https://stripe.com/docs/webhooks/signatures),
// implemented with Web Crypto since the Node `stripe` SDK isn't available
// in the Cloudflare Pages Functions runtime.
export async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [k, v] = item.split('=');
    parts[k] = v;
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${timestamp}.${payload}`;
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}
