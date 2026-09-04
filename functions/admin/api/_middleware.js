// Guards every /admin/api/* route except login (which issues the session)
// and logout (which must succeed even without a valid one).
import { requireAdmin } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === '/admin/api/login' || url.pathname === '/admin/api/logout') {
    return next();
  }

  const ok = await requireAdmin(request, env);
  if (!ok) return json({ error: 'unauthorized' }, 401);

  return next();
}
