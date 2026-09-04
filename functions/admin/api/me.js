// Reached only when _middleware.js has already confirmed a valid session.
import { json } from '../_lib/http.js';

export async function onRequestGet(context) {
  return json({ authenticated: true });
}
