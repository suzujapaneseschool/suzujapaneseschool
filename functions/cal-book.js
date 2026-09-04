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

  const { start, name, email, notes, country, timeZone, turnstileToken } = body;

  if (!start || !name || !email || !turnstileToken) {
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

  const calRes = await fetch('https://api.cal.com/v2/bookings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CAL_API_KEY}`,
      // If this stops working, check the current value at:
      // https://cal.com/docs/api-reference/v2/bookings/create-a-booking
      'cal-api-version': '2026-02-25',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      start,
      eventTypeId: Number(env.CAL_EVENT_TYPE_ID),
      attendee: { name, email, timeZone: timeZone || 'Asia/Tokyo' },
      // "notes" is not a guaranteed default field slug in v2, so we pass
      // it via metadata instead (documented to accept arbitrary keys).
      // It will show up in the Cal.com dashboard / webhook payload for
      // this booking, though not necessarily inside the confirmation
      // email body the way a native "Additional notes" field would.
      metadata: notes ? { notes } : {}
    })
  });

  const calData = await calRes.json();

  if (!calRes.ok || calData.status !== 'success') {
    return new Response(JSON.stringify({ success: false, error: 'booking-failed', detail: calData }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Best-effort — the booking already succeeded upstream with Cal.com, so a
  // D1 hiccup here should never turn into a failed response to the visitor.
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO trial_bookings (name, email, country, message, start_iso, timezone, cal_booking_uid, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'booked')`
      ).bind(name, email, country || '', notes || '', start, timeZone || 'Asia/Tokyo', (calData.data && calData.data.uid) || '').run();
    } catch (e) {}
  }

  return new Response(JSON.stringify({ success: true, booking: calData.data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
