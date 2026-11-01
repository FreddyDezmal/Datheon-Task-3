/**
 * api.js — asynchronous communication with OpenWeatherMap.
 *
 * Responsibilities:
 *   - build request URLs (direct or via proxy)
 *   - fetch with timeout + cancellation (AbortController)
 *   - validate HTTP status codes and map them to typed errors
 *   - validate the shape of the JSON that comes back
 *
 * Every failure is converted into a WeatherApiError with a `type` the UI can
 * turn into a friendly message. Nothing in here touches the DOM.
 */

import { CONFIG } from './config.js';

export const ErrorType = Object.freeze({
  MISSING_KEY: 'MISSING_KEY',
  INVALID_KEY: 'INVALID_KEY',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVER: 'SERVER',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  BAD_RESPONSE: 'BAD_RESPONSE',
  ABORTED: 'ABORTED',
});

export class WeatherApiError extends Error {
  /**
   * @param {string} type    One of ErrorType
   * @param {string} message Developer-facing message
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(type, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'WeatherApiError';
    this.type = type;
    this.status = status ?? null;
  }
}

/** Build the request URL for an endpoint. In proxy mode the key is added server-side. */
export function buildRequestUrl(endpoint, params, config = CONFIG) {
  const search = new URLSearchParams({
    ...params,
    units: config.UNITS,
    lang: config.LANG,
  });

  if (config.MODE === 'proxy') {
    search.set('endpoint', endpoint);
    const base = new URL(config.PROXY_URL, globalThis.location?.href ?? 'http://localhost/');
    base.search = search.toString();
    return base.toString();
  }

  search.set('appid', config.API_KEY);
  return `${config.API_BASE_URL}/${endpoint}?${search.toString()}`;
}

/** Map a non-2xx HTTP status (plus OWM's message body) to a WeatherApiError. */
export function errorFromStatus(status, apiMessage = '') {
  const detail = apiMessage ? ` (${apiMessage})` : '';
  if (status === 401) return new WeatherApiError(ErrorType.INVALID_KEY, `Unauthorised${detail}`, { status });
  if (status === 404) return new WeatherApiError(ErrorType.NOT_FOUND, `City not found${detail}`, { status });
  if (status === 429) return new WeatherApiError(ErrorType.RATE_LIMIT, `Rate limit exceeded${detail}`, { status });
  if (status === 400) return new WeatherApiError(ErrorType.BAD_REQUEST, `Bad request${detail}`, { status });
  if (status >= 500) return new WeatherApiError(ErrorType.SERVER, `Server error ${status}${detail}`, { status });
  return new WeatherApiError(ErrorType.SERVER, `Unexpected HTTP ${status}${detail}`, { status });
}

/**
 * Combine the caller's AbortSignal with a timeout. Returns the merged signal
 * and a function that tells us *why* it aborted.
 */
function withTimeout(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** Core request helper: fetch → status check → JSON parse. */
async function requestJson(endpoint, params, { signal } = {}) {
  if (!CONFIG.IS_CONFIGURED) {
    throw new WeatherApiError(ErrorType.MISSING_KEY, 'No OpenWeatherMap API key or proxy configured');
  }

  const url = buildRequestUrl(endpoint, params);
  const timeout = withTimeout(signal, CONFIG.REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: timeout.signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    timeout.cleanup();
    if (timeout.didTimeOut()) {
      throw new WeatherApiError(ErrorType.TIMEOUT, 'Request timed out', { cause: error });
    }
    if (signal?.aborted) {
      throw new WeatherApiError(ErrorType.ABORTED, 'Request superseded by a newer search', { cause: error });
    }
    // fetch() only rejects for network-level problems (offline, DNS, CORS, blocked).
    throw new WeatherApiError(ErrorType.NETWORK, 'Network request failed', { cause: error });
  }

  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    timeout.cleanup();
    if (signal?.aborted) throw new WeatherApiError(ErrorType.ABORTED, 'Request superseded', { cause: error });
    if (!response.ok) throw errorFromStatus(response.status);
    throw new WeatherApiError(ErrorType.BAD_RESPONSE, 'Response was not valid JSON', { cause: error });
  }
  timeout.cleanup();

  if (!response.ok) {
    throw errorFromStatus(response.status, typeof body?.message === 'string' ? body.message : '');
  }

  // OWM occasionally returns 200 with an error code in the body.
  const cod = Number(body?.cod);
  if (Number.isFinite(cod) && cod >= 400) {
    throw errorFromStatus(cod, body?.message);
  }

  return body;
}

/* ---------------------------------------------------------------------------
 * Response-shape validation. We check exactly the fields the UI depends on so
 * an unexpected payload produces a clear error instead of "undefined°C".
 * ------------------------------------------------------------------------- */

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

export function assertCurrentWeatherShape(data) {
  const ok =
    data &&
    typeof data.name === 'string' &&
    isNum(data.dt) &&
    isNum(data.timezone) &&
    data.main && isNum(data.main.temp) && isNum(data.main.feels_like) &&
    isNum(data.main.temp_min) && isNum(data.main.temp_max) &&
    isNum(data.main.humidity) && isNum(data.main.pressure) &&
    Array.isArray(data.weather) && data.weather.length > 0 &&
    typeof data.weather[0].icon === 'string' &&
    data.wind && isNum(data.wind.speed) &&
    data.sys && isNum(data.sys.sunrise) && isNum(data.sys.sunset);

  if (!ok) throw new WeatherApiError(ErrorType.BAD_RESPONSE, 'Current weather response is missing required fields');
  return data;
}

export function assertForecastShape(data) {
  const ok =
    data &&
    Array.isArray(data.list) && data.list.length > 0 &&
    data.list.every((entry) =>
      entry && isNum(entry.dt) && entry.main &&
      isNum(entry.main.temp_min) && isNum(entry.main.temp_max) &&
      Array.isArray(entry.weather) && entry.weather.length > 0) &&
    data.city && isNum(data.city.timezone);

  if (!ok) throw new WeatherApiError(ErrorType.BAD_RESPONSE, 'Forecast response is missing required fields');
  return data;
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

/** GET /data/2.5/weather?q={city} */
export async function fetchCurrentWeather(city, options = {}) {
  const data = await requestJson(CONFIG.ENDPOINTS.CURRENT, { q: city }, options);
  return assertCurrentWeatherShape(data);
}

/** GET /data/2.5/forecast?q={city} — 40 entries at 3-hour intervals. */
export async function fetchForecast(city, options = {}) {
  const data = await requestJson(CONFIG.ENDPOINTS.FORECAST, { q: city }, options);
  return assertForecastShape(data);
}

/**
 * Fetch current conditions and the forecast in parallel.
 * If either request fails, the whole bundle fails — the UI never shows a
 * half-updated dashboard mixing two different cities.
 */
export async function fetchWeatherBundle(city, { signal } = {}) {
  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(city, { signal }),
    fetchForecast(city, { signal }),
  ]);
  return { current, forecast };
}

/**
 * Current conditions for several cities at once (the "Other large cities" panel).
 * Uses Promise.allSettled so one failing city never hides the others.
 * @returns {Promise<Array<{ city: string, ok: boolean, data?: object, error?: WeatherApiError }>>}
 */
export async function fetchCitySnapshots(cities, { signal } = {}) {
  const results = await Promise.allSettled(cities.map((city) => fetchCurrentWeather(city, { signal })));
  return results.map((result, index) =>
    result.status === 'fulfilled'
      ? { city: cities[index], ok: true, data: result.value }
      : { city: cities[index], ok: false, error: result.reason });
}
