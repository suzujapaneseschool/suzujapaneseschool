import { verifyPassword, createSessionCookie, createPending2FACookie, checkRateLimit, recordFailedLogin, clearFailedLogin } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

async function verifyTurnstileToken(secret, token, ip) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip })
  });
  const data = await res.json();
  return data.success === true;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  const rate = await checkRateLimit(env, ip);
  if (!rate.allowed) {
    return json({ success: false, error: 'too-many-attempts' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ success: false, error: 'invalid-body' }, 400);
  }

  const { password, turnstileToken } = body;
  if (!password) return json({ success: false, error: 'missing-password' }, 400);

  if (env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) return json({ success: false, error: 'turnstile-required' }, 400);
    const humanVerified = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
    if (!humanVerified) return json({ success: false, error: 'turnstile-failed' }, 403);
  }

  const valid = await verifyPassword(env, password);
  if (!valid) {
    await recordFailedLogin(env, ip, rate.count);
    return json({ success: false, error: 'invalid-password' }, 401);
  }

  await clearFailedLogin(env, ip);

  // With ADMIN_TOTP_SECRET configured, a correct password isn't enough
  // by itself — hand back a short-lived pending cookie and make the
  // browser complete /admin/api/verify-2fa before it gets a real session.
  if (env.ADMIN_TOTP_SECRET) {
    const pendingCookie = await createPending2FACookie(env);
    return json({ success: true, twoFactorRequired: true }, 200, { 'Set-Cookie': pendingCookie });
  }

  const cookie = await createSessionCookie(env);
  return json({ success: true, twoFactorRequired: false }, 200, { 'Set-Cookie': cookie });
}
