import { PLANS } from './stripe.js';
import { escapeHtml, emailShell, detailRow, detailCard, paragraph, heading } from './email-template.js';

async function sendResendEmail(env, { to, replyTo, subject, html }) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || 'Suzu Sensei Website <onboarding@resend.dev>',
        to,
        reply_to: replyTo,
        subject,
        html
      })
    });
  } catch (e) {
    // Best-effort — a failed notification/confirmation email should
    // never undo a payment that already went through.
  }
}

/**
 * Sends exactly one "payment received" email (to the teacher, with the
 * customer's info + their optional message) for a given Stripe payment —
 * but only once. Both the customer's return trip
 * (stripe-session-status.js) and the async webhook (stripe-webhook.js)
 * call this for the same payment; whichever runs first claims the dedupe
 * key in KV and sends, the other sees the key already set and silently
 * skips. Deliberately doesn't also email the customer a receipt — that
 * needs a verified custom domain in Resend to even deliver (see
 * functions/send-message.js), and doubles the Resend usage for no benefit
 * on the free plan.
 */
export async function notifyPaymentOnce(env, { captureId, orderID, planKey, amount, payerEmail, payerName, message }) {
  if (!captureId) return; // nothing to dedupe against — skip rather than risk a duplicate

  if (env.PAYMENTS_KV) {
    const dedupeKey = 'paid:' + captureId;
    const already = await env.PAYMENTS_KV.get(dedupeKey);
    if (already) return;
    // Claim the key immediately, before doing any network calls, to keep
    // the race window between the two trigger paths as small as possible.
    await env.PAYMENTS_KV.put(dedupeKey, '1', { expirationTtl: 60 * 60 * 24 * 7 }); // 7 days
  }

  const plan = PLANS[planKey];
  const planLabel = plan ? plan.name : 'Lesson Plan';
  const displayAmount = amount || (plan ? plan.amount : '');

  // Flip the "pending" row created at checkout start over to "completed".
  // Both trigger paths (sync capture + async webhook) land here only once
  // per capture, thanks to the KV dedupe claim above, so this never
  // double-updates. Falls back to inserting a fresh row for the rare case
  // where no matching pending order exists (e.g. it predates this table).
  if (env.DB) {
    try {
      const updated = await env.DB.prepare(
        `UPDATE orders SET status = 'completed', capture_id = ?,
           amount = COALESCE(NULLIF(?, ''), amount),
           payer_name = COALESCE(NULLIF(?, ''), payer_name),
           payer_email = COALESCE(NULLIF(?, ''), payer_email),
           updated_at = datetime('now')
         WHERE order_id = ?`
      ).bind(captureId, displayAmount || '', payerName || '', payerEmail || '', orderID || '').run();

      if (!updated.meta.changes) {
        await env.DB.prepare(
          `INSERT INTO orders (order_id, capture_id, plan_key, plan_name, amount, payer_name, payer_email, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`
        ).bind(orderID || null, captureId, planKey || '', planLabel, displayAmount || '', payerName || '', payerEmail || '').run();
      }
    } catch (e) {}
  }

  // Notify the teacher — works today via the Resend sandbox sender,
  // since it's delivered to RESEND_TO_EMAIL (the account owner).
  if (env.RESEND_API_KEY && env.RESEND_TO_EMAIL) {
    const teacherRows = detailRow('Plan', escapeHtml(planLabel))
      + detailRow('Amount', displayAmount ? `¥${escapeHtml(String(displayAmount))}` : '')
      + detailRow('Payer', payerName ? escapeHtml(payerName) : '')
      + detailRow('Email', payerEmail ? escapeHtml(payerEmail) : '')
      + detailRow('Message', message ? escapeHtml(message).replace(/\n/g, '<br>') : '')
      + detailRow('Stripe Session', orderID ? escapeHtml(orderID) : '')
      + detailRow('Payment Intent', escapeHtml(captureId));

    const teacherHtml = emailShell({
      title: 'Payment received',
      kicker: 'Payment Received',
      bodyHtml: heading('Cha-ching! 💰 A payment just came in.')
        + paragraph('A student completed checkout on the pricing page. Here are the details:')
        + detailCard(teacherRows)
        + paragraph('<span style="color:#8a8072;font-size:14px;">Reach out to schedule their first lesson.</span>')
    });

    await sendResendEmail(env, {
      to: env.RESEND_TO_EMAIL,
      replyTo: payerEmail || undefined,
      subject: `Payment received — ${planLabel}`,
      html: teacherHtml
    });
  }
}
