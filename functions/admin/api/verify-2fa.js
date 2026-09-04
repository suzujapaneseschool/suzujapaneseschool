import { verifyPending2FACookie, createSessionCookie, checkRateLimit, recordFailedLogin, clearFailedLogin } from '../_lib/auth.js';
import { verifyTOTP } from '../_lib/totp.js';
import { consumeRecoveryCode } from '../_lib/recovery-codes.js';
import { json } from '../_lib/http.js';

// Second step of login, reached only after a correct password issued a
// pending-2FA cookie (see login.js). Accepts either a 6-digit
// authenticator code or a one-time recovery code (format XXXXX-XXXXX).
export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  const pending = await verifyPending2FACookie(request, env);
  if (!pending) return json({ success: false, error: 'session-expired' }, 401);

  // Separate rate-limit bucket from the password step — six digits is a
  // small space, so this needs its own hard cap regardless of how many
  // password attempts came before it.
  const rate = await checkRateLimit(env, ip, '2fa');
  if (!rate.allowed) return json({ success: false, error: 'too-many-attempts' }, 429);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ success: false, error: 'invalid-body' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return json({ success: false, error: 'missing-code' }, 400);

  const looksLikeRecoveryCode = code.replace(/\s|-/g, '').length > 6;
  const valid = looksLikeRecoveryCode
    ? await consumeRecoveryCode(env, code)
    : await verifyTOTP(env.ADMIN_TOTP_SECRET, code);

  if (!valid) {
    await recordFailedLogin(env, ip, rate.count, '2fa');
    return json({ success: false, error: 'invalid-code' }, 401);
  }

  await clearFailedLogin(env, ip, '2fa');
  const cookie = await createSessionCookie(env);
  return json({ success: true }, 200, { 'Set-Cookie': cookie });
}
