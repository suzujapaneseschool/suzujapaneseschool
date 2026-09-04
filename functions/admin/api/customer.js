// Aggregates everything tied to one email across all three tables, so the
// admin can see a customer's full journey (inquiry → free trial →
// purchase) in one place instead of hunting across three tabs.
import { json } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'server-error', detail: 'D1 database is not bound' }, 500);

  const url = new URL(request.url);
  const email = (url.searchParams.get('email') || '').trim();
  if (!email) return json({ error: 'missing-email' }, 400);

  try {
    const [bookings, contacts, orders] = await Promise.all([
      env.DB.prepare('SELECT * FROM trial_bookings WHERE email = ? COLLATE NOCASE ORDER BY start_iso DESC LIMIT 50').bind(email).all(),
      env.DB.prepare('SELECT * FROM contacts WHERE email = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 50').bind(email).all(),
      env.DB.prepare('SELECT * FROM orders WHERE payer_email = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 50').bind(email).all()
    ]);

    return json({
      email,
      bookings: bookings.results,
      contacts: contacts.results,
      orders: orders.results
    });
  } catch (e) {
    return json({ error: 'server-error', detail: e.message }, 500);
  }
}
