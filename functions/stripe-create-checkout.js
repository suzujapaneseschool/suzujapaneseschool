import { PLANS, CURRENCY, stripeRequest } from './_lib/stripe.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid-body' }, 400);
  }

  const plan = PLANS[body.plan];
  if (!plan) return json({ error: 'invalid-plan' }, 400);

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  // Stripe metadata values cap out at 500 chars — trimmed with margin.
  const msg = typeof body.msg === 'string' ? body.msg.trim().slice(0, 450) : '';
  const origin = new URL(request.url).origin;

  // metadata carries the plan key (+ contact info + optional message)
  // through to the checkout.session.completed webhook AND to
  // /stripe-session-status, so both can send the single post-payment
  // notification email without trusting anything from the browser at
  // capture time — the price always comes from PLANS above.
  const params = {
    mode: 'payment',
    success_url: `${origin}/?plan_session={CHECKOUT_SESSION_ID}#pricing`,
    cancel_url: `${origin}/#pricing`,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: plan.amount,
        product_data: { name: plan.name }
      }
    }],
    metadata: { plan: body.plan, name, email, msg }
  };
  if (email) params.customer_email = email;

  try {
    const session = await stripeRequest(env, 'checkout/sessions', params);

    // Records the checkout as "pending" so it shows up in the admin
    // dashboard even if the customer never completes payment — the
    // webhook (or the customer's return trip) later flips this to
    // "completed" via notifyPaymentOnce.
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO orders (order_id, plan_key, plan_name, amount, currency, payer_name, payer_email, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
        ).bind(session.id, body.plan, plan.name, String(plan.amount), 'JPY', name, email).run();
      } catch (e) {}
    }

    return json({ url: session.url });
  } catch (e) {
    return json({ error: 'session-create-failed', detail: e.detail }, 502);
  }
}
