import { json } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ error: 'server-error', detail: 'D1 database is not bound — add a "DB" binding in Pages → Settings → Functions' }, 500);

  try {
    const [
      bookings, upcoming, contacts, newContacts, paidOrders, revenue, pendingOrders,
      todayBookings, renewalsDueSoon, monthlyRevenue
    ] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as c FROM trial_bookings').first(),
      env.DB.prepare("SELECT COUNT(*) as c FROM trial_bookings WHERE status='booked' AND start_iso >= datetime('now')").first(),
      env.DB.prepare('SELECT COUNT(*) as c FROM contacts').first(),
      env.DB.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='new'").first(),
      env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE status='completed'").first(),
      env.DB.prepare("SELECT SUM(CAST(amount AS REAL)) as total FROM orders WHERE status='completed'").first(),
      env.DB.prepare("SELECT COUNT(*) as c FROM orders WHERE status='pending'").first(),

      // Next 7 days of confirmed lessons, soonest first — powers the
      // "upcoming lessons" widget so nothing gets missed.
      env.DB.prepare(
        `SELECT id, name, email, start_iso, timezone FROM trial_bookings
         WHERE status='booked' AND start_iso BETWEEN datetime('now') AND datetime('now','+7 days')
         ORDER BY start_iso ASC LIMIT 20`
      ).all(),

      // Plans are monthly — a completed order whose 30-day mark falls in
      // the next 7 days is a renewal to follow up on.
      env.DB.prepare(
        `SELECT COUNT(*) as c FROM orders
         WHERE status='completed' AND datetime(created_at, '+30 days') BETWEEN datetime('now') AND datetime('now','+7 days')`
      ).first(),

      // Last 6 months of completed revenue, oldest first, for the trend chart.
      env.DB.prepare(
        `SELECT strftime('%Y-%m', created_at) as month, SUM(CAST(amount AS REAL)) as total
         FROM orders WHERE status='completed' AND created_at >= datetime('now','-6 months')
         GROUP BY month ORDER BY month ASC`
      ).all()
    ]);

    return json({
      totalBookings: bookings.c,
      upcomingBookings: upcoming.c,
      totalContacts: contacts.c,
      newContacts: newContacts.c,
      paidOrders: paidOrders.c,
      pendingOrders: pendingOrders.c,
      revenue: revenue.total || 0,
      upcomingLessons: todayBookings.results,
      renewalsDueSoon: renewalsDueSoon.c,
      monthlyRevenue: monthlyRevenue.results
    });
  } catch (e) {
    return json({ error: 'server-error', detail: e.message }, 500);
  }
}
