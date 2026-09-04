import { countRecoveryCodes, regenerateRecoveryCodes } from '../../_lib/recovery-codes.js';
import { json } from '../../_lib/http.js';

// Covered by functions/admin/api/_middleware.js like every other
// /admin/api/* route — only reachable with a full (post-2FA) session.

export async function onRequestGet(context) {
  const { env } = context;
  return json({
    twoFactorEnabled: !!env.ADMIN_TOTP_SECRET,
    remaining: await countRecoveryCodes(env)
  });
}

// Invalidates any previously issued codes and returns a fresh batch of 8
// — the only time they're ever visible in plaintext, so the caller must
// show them to the admin immediately and only once.
export async function onRequestPost(context) {
  const { env } = context;
  if (!env.ADMIN_TOTP_SECRET) return json({ error: 'totp-not-configured' }, 400);

  try {
    const codes = await regenerateRecoveryCodes(env);
    return json({ codes });
  } catch (e) {
    return json({ error: 'kv-not-bound' }, 500);
  }
}
