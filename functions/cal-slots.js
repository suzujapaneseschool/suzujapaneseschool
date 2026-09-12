export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const startTime = url.searchParams.get('start');
  const endTime = url.searchParams.get('end');
  const timeZone = url.searchParams.get('timeZone') || 'Asia/Tokyo';

  if (!startTime || !endTime) {
    return new Response(JSON.stringify({ error: 'missing-range' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const params = new URLSearchParams({
    eventTypeId: env.CAL_EVENT_TYPE_ID,
    start: startTime,
    end: endTime,
    timeZone
  });

  const calRes = await fetch(`https://api.cal.com/v2/slots?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${env.CAL_API_KEY}`,
      // Cal.com versions each v2 endpoint independently. If this stops
      // working, check the current value at:
      // https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
      'cal-api-version': '2024-09-04'
    }
  });
  const data = await calRes.json();

  if (!calRes.ok || data.status !== 'success') {
    return new Response(JSON.stringify({ error: 'cal-error', detail: data }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // v2 response shape: { status: "success", data: { "2050-09-05": [{ start: "ISO" }, ...] } }
  return new Response(JSON.stringify({ slots: data.data || {} }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
