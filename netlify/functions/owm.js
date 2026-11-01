/**
 * Netlify Function — OpenWeatherMap proxy.
 *
 * The browser calls  /.netlify/functions/owm?endpoint=weather&q=London&units=metric
 * and this function forwards the request to OpenWeatherMap, adding the API key
 * from the OPENWEATHER_API_KEY environment variable (set in the Netlify UI).
 * The key therefore never reaches the browser or the Git repository.
 *
 * Only the two endpoints and the parameters this app needs are allowed, so the
 * proxy can't be abused as a general-purpose relay for your key.
 */

const UPSTREAM = 'https://api.openweathermap.org/data/2.5';
const ALLOWED_ENDPOINTS = new Set(['weather', 'forecast']);
const ALLOWED_PARAMS = ['q', 'lat', 'lon', 'units', 'lang', 'cnt'];

const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });

export default async (request) => {
  if (request.method !== 'GET') return json(405, { cod: 405, message: 'Method not allowed' });

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return json(500, { cod: 500, message: 'Proxy is missing OPENWEATHER_API_KEY' });

  const incoming = new URL(request.url).searchParams;
  const endpoint = incoming.get('endpoint');
  if (!ALLOWED_ENDPOINTS.has(endpoint)) return json(400, { cod: 400, message: 'Unknown endpoint' });

  const query = (incoming.get('q') ?? '').trim();
  if (!query && !(incoming.get('lat') && incoming.get('lon'))) {
    return json(400, { cod: 400, message: 'Missing location' });
  }
  if (query.length > 100) return json(400, { cod: 400, message: 'Location too long' });

  const upstream = new URL(`${UPSTREAM}/${endpoint}`);
  for (const key of ALLOWED_PARAMS) {
    const value = incoming.get(key);
    if (value) upstream.searchParams.set(key, value);
  }
  upstream.searchParams.set('appid', apiKey);

  try {
    const response = await fetch(upstream, { headers: { Accept: 'application/json' } });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Weather changes slowly; a short CDN cache protects the rate limit.
        'Cache-Control': response.ok ? 'public, max-age=300' : 'no-store',
      },
    });
  } catch {
    return json(502, { cod: 502, message: 'Could not reach OpenWeatherMap' });
  }
};
