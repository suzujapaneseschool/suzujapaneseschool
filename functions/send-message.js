import { escapeHtml, emailShell, detailRow, detailCard, paragraph, heading } from './_lib/email-template.js';

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

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'invalid-body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { name, email, level, goal, message, turnstileToken, notify } = body;

  if (!name || !email || !turnstileToken) {
    return new Response(JSON.stringify({ success: false, error: 'missing-fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return new Response(JSON.stringify({ success: false, error: 'invalid-email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const humanVerified = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
  if (!humanVerified) {
    return new Response(JSON.stringify({ success: false, error: 'turnstile-failed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const isPlanInquiry = typeof goal === 'string' && goal.startsWith('Plan purchase:');

  // Capture the lead before attempting delivery — a Resend hiccup below
  // shouldn't cost us the visitor's data. Best-effort: never blocks the reply.
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO contacts (name, email, level, goal, message, is_plan_inquiry)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(name, email, level || '', goal || '', message || '', isPlanInquiry ? 1 : 0).run();
    } catch (e) {}
  }

  // notify: false lets a caller record the lead (contacts row above)
  // without sending an email — used for the pricing-modal's pre-payment
  // capture, since a single email already goes out once payment actually
  // completes (see functions/_lib/notify-payment.js), and we don't want
  // to burn the Resend quota on two emails for one purchase.
  if (notify === false) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const kicker = isPlanInquiry ? 'Plan Interest' : 'New Message';
  const headingText = isPlanInquiry ? "Someone's interested in a plan! 🎌" : "You've got a new message! 📨";

  const rows = detailRow('Name', escapeHtml(name))
    + detailRow('Email', escapeHtml(email))
    + detailRow('Level', level ? escapeHtml(level) : '')
    + detailRow(isPlanInquiry ? 'Plan' : 'Interested in', goal ? escapeHtml(goal) : '')
    + detailRow('Message', message ? escapeHtml(message).replace(/\n/g, '<br>') : '');

  const bodyHtml = heading(headingText)
    + paragraph(isPlanInquiry
      ? 'A visitor started checking out on the pricing page and left these details before heading to payment.'
      : 'A visitor just sent a message through the contact form on your website.')
    + detailCard(rows)
    + paragraph('<span style="color:#8a8072;font-size:14px;">Just hit reply on this email to answer ' + escapeHtml(name) + ' directly.</span>');

  const html = emailShell({
    title: isPlanInquiry ? 'New plan interest' : 'New website message',
    kicker,
    bodyHtml
  });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // "onboarding@resend.dev" works with no domain verification, but
        // can only deliver to the email address that owns the Resend
        // account — which is exactly RESEND_TO_EMAIL below, so that's fine.
        // Once a custom domain is verified in Resend, switch this to an
        // address on that domain (e.g. "Suzu Sensei <notify@yourdomain.com>").
        from: env.RESEND_FROM || 'Suzu Sensei Website <onboarding@resend.dev>',
        to: env.RESEND_TO_EMAIL,
        reply_to: email,
        subject: isPlanInquiry ? `New plan interest from ${name}` : `New message from ${name}`,
        html
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: 'send-failed', detail: data }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'server-error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
