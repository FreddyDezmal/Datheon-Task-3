/**
 * weather.js — pure data processing. No DOM, no network.
 *
 *   - time-zone aware date/time formatting for the searched city
 *   - grouping 3-hour forecast entries into calendar days
 *   - daily high/low calculations
 *   - weather theme selection
 *   - icon URL mapping
 *
 * Every function here is deterministic so it can be unit-tested in Node
 * (see tests/weather.test.mjs).
 */

const ICON_BASE_URL = 'https://openweathermap.org/img/wn';

/* ---------------------------------------------------------------------------
 * Time helpers
 *
 * OpenWeatherMap gives timestamps in UTC seconds plus the city's offset from
 * UTC in seconds (`timezone`). We shift the instant by that offset and then
 * format it *as UTC*, which yields the wall-clock time in the searched city
 * regardless of the visitor's own time zone.
 * ------------------------------------------------------------------------- */

/** @returns {Date} a Date whose UTC fields equal the city's local wall-clock. */
export function toCityDate(unixSeconds, timezoneOffsetSeconds) {
  return new Date((unixSeconds + timezoneOffsetSeconds) * 1000);
}

const fmt = (options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options });
const timeFormatter = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const longDateFormatter = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const weekdayFormatter = fmt({ weekday: 'long' });
const shortWeekdayFormatter = fmt({ weekday: 'short' });
const shortDateFormatter = fmt({ day: 'numeric', month: 'short' });

export function formatCityTime(unixSeconds, tz) {
  return timeFormatter.format(toCityDate(unixSeconds, tz));
}

export function formatCityDateTime(unixSeconds, tz) {
  const date = toCityDate(unixSeconds, tz);
  return `${longDateFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

/** "UTC+2", "UTC−5", "UTC+5:30" */
export function formatUtcOffset(timezoneOffsetSeconds) {
  const sign = timezoneOffsetSeconds >= 0 ? '+' : '−';
  const total = Math.abs(timezoneOffsetSeconds) / 60;
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

/** Calendar-day key ("2026-11-01") in the city's local time. */
export function cityDateKey(unixSeconds, tz) {
  return toCityDate(unixSeconds, tz).toISOString().slice(0, 10);
}

/** "3h 12m" */
export function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/* ---------------------------------------------------------------------------
 * Unit formatting
 * ------------------------------------------------------------------------- */

export const roundTemp = (celsius) => {
  const rounded = Math.round(celsius);
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** All data is fetched in metric; Fahrenheit is a display-only conversion. */
export const celsiusToFahrenheit = (celsius) => (celsius * 9) / 5 + 32;

/** Convert (if needed) and round a Celsius value for display. */
export const toDisplayTemp = (celsius, unit = 'C') =>
  roundTemp(unit === 'F' ? celsiusToFahrenheit(celsius) : celsius);

export const formatTemp = (celsius, unit = 'C') => `${toDisplayTemp(celsius, unit)}°`;

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Meteorological degrees (direction the wind comes FROM) → 16-point compass. */
export function degreesToCompass(degrees) {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return null;
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalised / 22.5) % 16];
}

/** OWM caps visibility at 10 000 m. */
export function formatVisibility(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return { value: 'N/A', note: 'Not reported' };
  const km = meters / 1000;
  const value = km >= 10 ? '10+ km' : `${km.toFixed(km < 1 ? 2 : 1)} km`;
  let note = 'Excellent';
  if (meters < 1000) note = 'Fog-level';
  else if (meters < 4000) note = 'Poor';
  else if (meters < 10000) note = 'Moderate';
  return { value, note };
}

/** Rough description of sea-level pressure relative to the 1013 hPa standard. */
export function describePressure(hpa) {
  if (hpa < 1000) return 'Low — unsettled';
  if (hpa > 1022) return 'High — settled';
  return 'Normal';
}

/** Capitalise each word: "light rain" → "Light Rain". */
export function titleCase(text = '') {
  return text.replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

/* ---------------------------------------------------------------------------
 * Icons
 * ------------------------------------------------------------------------- */

/** OWM icon code ("10d") → image URL. `size` is 1, 2 or 4 (×). */
export function getIconUrl(iconCode, size = 2) {
  const safe = /^\d{2}[dn]$/.test(iconCode) ? iconCode : '03d';
  const suffix = size === 1 ? '' : `@${size}x`;
  return `${ICON_BASE_URL}/${safe}${suffix}.png`;
}

/** Forecast cards always represent the day, so force the daytime icon variant. */
export const toDayIcon = (iconCode = '03d') => iconCode.replace(/n$/, 'd');

/* ---------------------------------------------------------------------------
 * Themes
 * ------------------------------------------------------------------------- */

export const THEMES = Object.freeze(['clear', 'clouds', 'rain', 'storm', 'snow', 'night']);

/**
 * Pick a visual theme from OWM condition codes
 * (https://openweathermap.org/weather-conditions).
 *
 * Severe/precipitating weather wins over night so a rainy night still looks
 * rainy; otherwise night wins over clear/cloudy.
 *
 * @param {number} conditionId  weather[0].id
 * @param {boolean} isNight
 */
export function getThemeKey(conditionId, isNight) {
  const group = Math.floor(conditionId / 100);
  if (group === 2) return 'storm';                       // 2xx Thunderstorm
  if (group === 6 || conditionId === 511) return 'snow';  // 6xx Snow, freezing rain
  if (group === 3 || group === 5) return 'rain';          // 3xx Drizzle, 5xx Rain
  if (isNight) return 'night';
  if (conditionId === 800) return 'clear';                // Clear
  if (conditionId === 801) return 'clear';                // Few clouds (11–25 %) still reads as sunny
  return 'clouds';                                        // 7xx Atmosphere, 802–804 Clouds
}

/** Night if the icon says so, or the observation falls outside sunrise–sunset. */
export function isNightTime({ dt, sunrise, sunset, icon }) {
  if (typeof icon === 'string' && icon.endsWith('n')) return true;
  if (typeof icon === 'string' && icon.endsWith('d')) return false;
  return dt < sunrise || dt >= sunset;
}

/* ---------------------------------------------------------------------------
 * Current weather → view model
 * ------------------------------------------------------------------------- */

/**
 * Dew point (°C) from air temperature and relative humidity — Magnus formula
 * (Alduchov & Eskridge constants), accurate to ~0.4 °C for normal weather.
 */
export function dewPoint(tempC, humidityPct) {
  if (!(humidityPct > 0)) return null;
  const a = 17.62;
  const b = 243.12;
  const gamma = Math.log(humidityPct / 100) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}

/** Short explanation of why "feels like" differs from the actual temperature. */
export function explainFeelsLike(tempC, feelsC, humidityPct, windMs) {
  const diff = feelsC - tempC;
  if (diff <= -1.5 && windMs >= 3) return 'Wind is making it feel cooler';
  if (diff <= -1.5) return 'Feels cooler than the actual temperature';
  if (diff >= 1.5 && humidityPct >= 55) return 'Humidity is making it feel warmer';
  if (diff >= 1.5) return 'Feels warmer than the actual temperature';
  return 'Similar to the actual temperature';
}

/** Comfort description for relative humidity based on the dew point. */
export function describeDewPoint(dewC) {
  if (dewC === null) return '';
  if (dewC >= 21) return 'Oppressive';
  if (dewC >= 16) return 'Muggy';
  if (dewC >= 10) return 'Comfortable';
  return 'Dry';
}

/** Beaufort-style label for wind speed in m/s. */
export function describeWind(ms) {
  if (ms < 0.5) return 'Calm';
  if (ms < 3.4) return 'Light breeze';
  if (ms < 8) return 'Moderate breeze';
  if (ms < 10.8) return 'Fresh breeze';
  if (ms < 17.2) return 'Strong wind';
  return 'Gale';
}

/** Rain + snow (mm) recorded in the last hour, from the current-weather payload. */
export function recentPrecipitation(raw) {
  const rain = raw.rain?.['1h'] ?? 0;
  const snow = raw.snow?.['1h'] ?? 0;
  return rain + snow;
}

/** Total precipitation (mm) forecast across the given 3-hour entries. */
export function totalPrecipitation(entries) {
  return entries.reduce((sum, entry) => sum + (entry.rain?.['3h'] ?? 0) + (entry.snow?.['3h'] ?? 0), 0);
}

/**
 * Where the sun is on its arc: 0 = sunrise, 1 = sunset.
 * Returns null at night.
 */
export function sunProgress(nowUnix, sunrise, sunset) {
  if (nowUnix < sunrise || nowUnix > sunset) return null;
  return (nowUnix - sunrise) / (sunset - sunrise);
}

export function buildCurrentViewModel(raw) {
  const condition = raw.weather[0];
  const tz = raw.timezone;
  const night = isNightTime({ dt: raw.dt, sunrise: raw.sys.sunrise, sunset: raw.sys.sunset, icon: condition.icon });
  const visibility = formatVisibility(raw.visibility);
  const dew = dewPoint(raw.main.temp, raw.main.humidity);

  return {
    tempC: raw.main.temp,
    feelsLikeC: raw.main.feels_like,
    tempMinC: raw.main.temp_min,
    tempMaxC: raw.main.temp_max,
    dewPointC: dew,
    dewPointNote: describeDewPoint(dew),
    feelsLikeNote: explainFeelsLike(raw.main.temp, raw.main.feels_like, raw.main.humidity, raw.wind.speed),
    windDeg: typeof raw.wind.deg === 'number' ? raw.wind.deg : null,
    windNote: describeWind(raw.wind.speed),
    precipLastHour: recentPrecipitation(raw),
    sunriseUnix: raw.sys.sunrise,
    sunsetUnix: raw.sys.sunset,
    id: raw.id,
    city: raw.name,
    country: raw.sys.country ?? '',
    timezone: tz,
    observedAt: raw.dt,
    temperature: roundTemp(raw.main.temp),
    feelsLike: roundTemp(raw.main.feels_like),
    tempMin: roundTemp(raw.main.temp_min),
    tempMax: roundTemp(raw.main.temp_max),
    description: titleCase(condition.description ?? condition.main ?? ''),
    conditionId: condition.id,
    icon: condition.icon,
    humidity: raw.main.humidity,
    windSpeed: raw.wind.speed,
    windGust: raw.wind.gust ?? null,
    windDirection: degreesToCompass(raw.wind.deg),
    pressure: raw.main.pressure,
    pressureNote: describePressure(raw.main.pressure),
    visibility: visibility.value,
    visibilityNote: visibility.note,
    sunrise: formatCityTime(raw.sys.sunrise, tz),
    sunset: formatCityTime(raw.sys.sunset, tz),
    daylight: formatDuration(raw.sys.sunset - raw.sys.sunrise),
    isNight: night,
    theme: getThemeKey(condition.id, night),
  };
}

/* ---------------------------------------------------------------------------
 * Forecast grouping
 * ------------------------------------------------------------------------- */

/**
 * Group 3-hour entries by the city's local calendar day.
 * @returns {Map<string, object[]>} insertion-ordered: earliest day first
 */
export function groupForecastByDay(list, tz) {
  const days = new Map();
  for (const entry of list) {
    const key = cityDateKey(entry.dt, tz);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(entry);
  }
  return days;
}

/** The entry closest to 12:00 local time best represents "the day's weather". */
function pickRepresentativeEntry(entries, tz) {
  let best = entries[0];
  let bestDistance = Infinity;
  for (const entry of entries) {
    const hour = toCityDate(entry.dt, tz).getUTCHours();
    const distance = Math.abs(hour - 12);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

/** Condition id seen most often during daytime hours (06:00–21:00); ties go to the most severe. */
function dominantCondition(entries, tz) {
  const daytime = entries.filter((entry) => {
    const hour = toCityDate(entry.dt, tz).getUTCHours();
    return hour >= 6 && hour <= 21;
  });
  const pool = daytime.length ? daytime : entries;
  const counts = new Map();
  for (const entry of pool) {
    const id = entry.weather[0].id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // Severity: storm > snow > rain > drizzle > atmosphere > clouds > clear
  const severity = (id) => ({ 2: 6, 6: 5, 5: 4, 3: 3, 7: 2 }[Math.floor(id / 100)] ?? (id === 800 ? 0 : 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || severity(b[0]) - severity(a[0]))[0][0];
}

/**
 * Summarise one day of 3-hour entries.
 * High = max of every entry's temp_max; low = min of every entry's temp_min.
 */
export function summariseDay(dateKey, entries, tz) {
  const highs = entries.map((entry) => entry.main.temp_max);
  const lows = entries.map((entry) => entry.main.temp_min);
  const conditionId = dominantCondition(entries, tz);
  const representative =
    entries.find((entry) => entry.weather[0].id === conditionId && Math.abs(toCityDate(entry.dt, tz).getUTCHours() - 12) <= 3) ??
    entries.find((entry) => entry.weather[0].id === conditionId) ??
    pickRepresentativeEntry(entries, tz);
  const condition = representative.weather[0];
  const date = new Date(`${dateKey}T12:00:00Z`);
  const pops = entries.map((entry) => (typeof entry.pop === 'number' ? entry.pop : 0));

  return {
    dateKey,
    weekday: weekdayFormatter.format(date),
    weekdayShort: shortWeekdayFormatter.format(date),
    dateLabel: shortDateFormatter.format(date),
    high: roundTemp(Math.max(...highs)),
    low: roundTemp(Math.min(...lows)),
    conditionId,
    description: titleCase(condition.description ?? condition.main ?? ''),
    icon: toDayIcon(condition.icon),
    precipitationChance: Math.round(Math.max(...pops) * 100),
    samples: entries.length,
    /** Fewer than 8 three-hour slots → the high/low only covers part of the day. */
    isPartial: entries.length < 8,
    highC: Math.max(...highs),
    lowC: Math.min(...lows),
    /** The day's own 3-hour slots, for the hourly strip and rain chart. */
    slots: entries.map((entry) => buildSlot(entry, tz)),
  };
}

/**
 * Turn the 40-entry forecast into `dayCount` distinct calendar days.
 *
 * The free forecast covers ~120 hours starting at the next 3-hour slot, so it
 * usually spans 6 calendar days: a partial "today", four full days and a
 * partial sixth day. We skip today when it would push a later day out of the
 * list, and we skip days with too few samples to give an honest high/low.
 *
 * @param {object[]} list            forecast.list
 * @param {number}   tz              forecast.city.timezone (seconds)
 * @param {{ dayCount?: number, nowUnix?: number, minSamples?: number }} [options]
 */
export function buildDailyForecast(list, tz, { dayCount = 5, nowUnix = Date.now() / 1000, minSamples = 2 } = {}) {
  const todayKey = cityDateKey(nowUnix, tz);
  const grouped = [...groupForecastByDay(list, tz).entries()];

  const futureDays = grouped.filter(([key]) => key > todayKey);
  const usable = futureDays.filter(([, entries]) => entries.length >= minSamples);

  let selected = usable.slice(0, dayCount);

  // Not enough future days (e.g. late-evening forecast with a short tail)?
  // Fall back to including today so we still show five distinct days.
  if (selected.length < dayCount) {
    const today = grouped.find(([key]) => key === todayKey);
    const pool = today ? [today, ...futureDays] : futureDays;
    selected = pool.slice(0, dayCount);
  }

  return selected.map(([key, entries]) => summariseDay(key, entries, tz));
}

/* ---------------------------------------------------------------------------
 * Hourly slots, chart series and the plain-language summary
 * ------------------------------------------------------------------------- */

/** One 3-hour forecast entry → a small view model for the hourly strip / charts. */
export function buildSlot(entry, tz) {
  const condition = entry.weather[0];
  return {
    dt: entry.dt,
    time: formatCityTime(entry.dt, tz),
    dateKey: cityDateKey(entry.dt, tz),
    tempC: entry.main.temp ?? (entry.main.temp_min + entry.main.temp_max) / 2,
    humidity: entry.main.humidity ?? null,
    pressure: entry.main.pressure ?? null,
    windSpeed: entry.wind?.speed ?? null,
    pop: Math.round((typeof entry.pop === 'number' ? entry.pop : 0) * 100),
    precipMm: (entry.rain?.['3h'] ?? 0) + (entry.snow?.['3h'] ?? 0),
    icon: condition.icon,
    description: titleCase(condition.description ?? condition.main ?? ''),
    conditionId: condition.id,
  };
}

/** The next `count` 3-hour slots that are still in the future (default: 24 h). */
export function buildUpcomingSlots(list, tz, { count = 8, nowUnix = Date.now() / 1000 } = {}) {
  return list
    .filter((entry) => entry.dt + 3 * 3600 > nowUnix)
    .slice(0, count)
    .map((entry) => buildSlot(entry, tz));
}

/** Metric definitions for the Overview line chart. Values are in display units. */
export const OVERVIEW_METRICS = Object.freeze({
  temperature: { label: 'Temperature', unit: '°', pick: (slot, unit) => toDisplayTemp(slot.tempC, unit) },
  humidity: { label: 'Humidity', unit: '%', pick: (slot) => slot.humidity, domain: [0, 100] },
  pressure: { label: 'Pressure', unit: ' hPa', pick: (slot) => slot.pressure },
  wind: { label: 'Wind', unit: ' m/s', pick: (slot) => (slot.windSpeed === null ? null : Math.round(slot.windSpeed * 10) / 10), floor: 0 },
});

/** Points for the Overview chart: [{ dt, value, label }], skipping missing values. */
export function buildSeries(slots, metricKey, unit = 'C') {
  const metric = OVERVIEW_METRICS[metricKey];
  if (!metric) return [];
  return slots
    .map((slot) => ({ dt: slot.dt, value: metric.pick(slot, unit), slot }))
    .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min, max, target = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= target) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return ticks;
}

/**
 * One or two sentences describing the next 24 hours, like a forecaster would.
 * Uses only the data we have — no invented values.
 */
export function buildDailySummary(current, upcoming, unit = 'C') {
  const temps = [current.tempC, ...upcoming.map((slot) => slot.tempC)];
  const low = formatTemp(Math.min(...temps), unit);
  const high = formatTemp(Math.max(...temps), unit);
  const condition = current.description.toLowerCase();
  const sentences = [`Expect ${condition} now, with temperatures between ${low} and ${high} over the next 24 hours.`];

  const wettest = upcoming.reduce((best, slot) => (slot.pop > (best?.pop ?? -1) ? slot : best), null);
  const totalMm = upcoming.reduce((sum, slot) => sum + slot.precipMm, 0);
  const isSnow = wettest && Math.floor(wettest.conditionId / 100) === 6;
  if (wettest && wettest.pop >= 50) {
    const amount = totalMm >= 0.5 ? ` (about ${totalMm.toFixed(1)} mm in total)` : '';
    sentences.push(isSnow
      ? `Snow is likely around ${wettest.time}${amount}. Dress warmly.`
      : `Rain is likely around ${wettest.time}${amount}. Take an umbrella.`);
  } else if (wettest && wettest.pop >= 20) {
    sentences.push(`There's a ${wettest.pop}% chance of ${isSnow ? 'snow' : 'showers'} around ${wettest.time}.`);
  } else {
    sentences.push('Little chance of rain or snow.');
  }

  const windiest = Math.max(current.windSpeed, ...upcoming.map((slot) => slot.windSpeed ?? 0));
  if (windiest >= 10.8) sentences.push(`Strong winds up to ${windiest.toFixed(0)} m/s.`);
  return sentences.join(' ');
}
