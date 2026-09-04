// Guards every /admin/api/* route except login (which issues the pending
// 2FA cookie or, with 2FA off, the real session), verify-2fa (which
// checks the pending cookie itself and issues the real session), and
// logout (which must succeed even without a valid one).
import { requireAdmin } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

const PUBLIC_PATHS = new Set(['/admin/api/login', '/admin/api/verify-2fa', '/admin/api/logout']);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.has(url.pathname)) {
    return next();
  }

  const ok = await requireAdmin(request, env);
  if (!ok) return json({ error: 'unauthorized' }, 401);

  return next();
}
