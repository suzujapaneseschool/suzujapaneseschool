import { verifyStripeSignature } from './_lib/stripe.js';
import { notifyPaymentOnce } from './_lib/notify-payment.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // Must read the raw body BEFORE any JSON parsing — the signature is
  // computed over the exact bytes Stripe sent.
  const payload = await request.text();
  const sig = request.headers.get('stripe-signature');

  let verified = false;
  try {
    verified = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    verified = false;
  }

  if (!verified) {
    // Someone posting fake events to this URL, or a misconfigured
    // STRIPE_WEBHOOK_SECRET — reject without acting on it.
    return new Response('signature verification failed', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch (e) {
    return new Response('invalid body', { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      const details = session.customer_details || {};
      const meta = session.metadata || {};

      await notifyPaymentOnce(env, {
        captureId: session.payment_intent,
        orderID: session.id,
        planKey: meta.plan,
        amount: session.amount_total,
        payerEmail: details.email || meta.email,
        payerName: details.name || meta.name
      });
    }
  }

  // Stripe only cares that we return 2xx quickly — it retries otherwise.
  return new Response('ok', { status: 200 });
}
