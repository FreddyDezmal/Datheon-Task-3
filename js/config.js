/**
 * config.js — API configuration and application constants.
 *
 * The API key is NEVER written in this file. It is read from `js/env.js`,
 * which is git-ignored and generated from your local `.env` file
 * (see README → "API configuration"). If `env.js` is missing the app
 * still loads and shows a "setup required" screen instead of crashing.
 *
 * Two connection modes are supported:
 *   1. Direct  — the browser calls api.openweathermap.org with your key.
 *                Fine for local development; the key is visible in DevTools.
 *   2. Proxy   — the browser calls a serverless function (API_PROXY_URL)
 *                which adds the key server-side. Use this in production.
 */

let env = {};
try {
  // Optional, git-ignored module. A failed import simply means "not configured".
  const module = await import('./env.js');
  env = module.default ?? {};
} catch {
  env = {};
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const apiKey = clean(env.OPENWEATHER_API_KEY);
const proxyUrl = clean(env.API_PROXY_URL);

export const CONFIG = Object.freeze({
  API_BASE_URL: 'https://api.openweathermap.org/data/2.5',
  ENDPOINTS: Object.freeze({
    CURRENT: 'weather',
    FORECAST: 'forecast',
  }),
  ICON_BASE_URL: 'https://openweathermap.org/img/wn',

  API_KEY: apiKey,
  PROXY_URL: proxyUrl,
  /** "proxy" when a proxy URL is configured, otherwise "direct". */
  MODE: proxyUrl ? 'proxy' : 'direct',
  /** True when the app has some way of authenticating with OpenWeatherMap. */
  IS_CONFIGURED: Boolean(proxyUrl || (apiKey && !/^your[_-]/i.test(apiKey))),

  UNITS: 'metric', // °C, m/s, hPa
  LANG: 'en',
  FORECAST_DAYS: 5,
  REQUEST_TIMEOUT_MS: 10_000,

  STORAGE_KEYS: Object.freeze({
    LAST_CITY: 'atmosphere:lastCity',
    TEMP_UNIT: 'atmosphere:tempUnit',
    COLOR_MODE: 'atmosphere:colorMode',
  }),

  /** Shown in the "Other large cities" panel (one extra API call each, cached). */
  OTHER_CITIES: Object.freeze(['New York, US', 'London, GB', 'Tokyo, JP', 'Sydney, AU', 'Cairo, EG']),
  OTHER_CITIES_SHOWN: 4,
  OTHER_CITIES_CACHE_MS: 10 * 60_000,

  /** Number of 3-hour slots in the default hourly strip (8 × 3 h = 24 h). */
  HOURLY_SLOTS: 8,

  CITY_MIN_LENGTH: 2,
  CITY_MAX_LENGTH: 85,
  /** Letters (any language), spaces, and the punctuation found in real place names. */
  CITY_PATTERN: /^[\p{L}\p{M}\s.'’,\-()]+$/u,

  CLOCK_REFRESH_MS: 30_000,
});
