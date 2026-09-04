import { stripeRequest } from './_lib/stripe.js';
import { notifyPaymentOnce } from './_lib/notify-payment.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// Called when the customer lands back on the site after Stripe Checkout
// (success_url carries ?plan_session={CHECKOUT_SESSION_ID}), purely to
// render the "thank you" step with the right details. The webhook
// (stripe-webhook.js) is the authoritative trigger for marking the order
// completed and sending emails — this route also calls notifyPaymentOnce
// as a fast-path, but the KV dedupe key in that function means whichever
// of the two fires first is the one that actually sends anything.
export async function onRequestGet(context) {
  const { request, env } = context;
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId) return json({ error: 'missing-session-id' }, 400);

  try {
    const session = await stripeRequest(env, `checkout/sessions/${sessionId}`, {}, 'GET');
    const paid = session.payment_status === 'paid';
    const details = session.customer_details || {};
    const meta = session.metadata || {};

    if (paid) {
      await notifyPaymentOnce(env, {
        captureId: session.payment_intent,
        orderID: session.id,
        planKey: meta.plan,
        amount: session.amount_total,
        payerEmail: details.email || meta.email,
        payerName: details.name || meta.name,
        message: meta.msg
      });
    }

    return json({
      paid,
      status: session.payment_status,
      plan: meta.plan || '',
      name: details.name || meta.name || '',
      email: details.email || meta.email || ''
    });
  } catch (e) {
    return json({ error: 'lookup-failed' }, 502);
  }
}
