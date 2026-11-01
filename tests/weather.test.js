/**
 * Unit tests for js/weather.js (pure functions) — run with `npm test`.
 * Uses Node's built-in test runner; no dependencies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyForecast,
  groupForecastByDay,
  getThemeKey,
  isNightTime,
  degreesToCompass,
  formatVisibility,
  formatUtcOffset,
  formatCityTime,
  cityDateKey,
  getIconUrl,
  toDayIcon,
  roundTemp,
  buildCurrentViewModel,
} from '../js/weather.js';

const HOUR = 3600;

/** Build a fake 40-entry forecast starting at `startUnix`, 3 h apart. */
function fakeForecast(startUnix, { count = 40, tempAt = (i) => 15 + (i % 8), conditionAt = () => 800 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    dt: startUnix + i * 3 * HOUR,
    main: { temp_min: tempAt(i) - 1, temp_max: tempAt(i) + 1, temp: tempAt(i) },
    weather: [{ id: conditionAt(i), description: 'clear sky', icon: '01n' }],
    pop: i === 5 ? 0.6 : 0,
  }));
}

test('groups 3-hour entries by the city’s local calendar day, not UTC', () => {
  // 2026-11-01 21:00 UTC is already 2026-11-02 in Tokyo (UTC+9)
  const dt = Date.UTC(2026, 10, 1, 21) / 1000;
  assert.equal(cityDateKey(dt, 0), '2026-11-01');
  assert.equal(cityDateKey(dt, 9 * HOUR), '2026-11-02');

  const list = fakeForecast(dt, { count: 4 });
  const groups = groupForecastByDay(list, 9 * HOUR);
  assert.deepEqual([...groups.keys()], ['2026-11-02']);
});

test('buildDailyForecast returns five distinct future days with correct high/low', () => {
  const tz = 2 * HOUR; // Johannesburg
  const now = Date.UTC(2026, 10, 1, 8) / 1000; // 10:00 local
  const start = Date.UTC(2026, 10, 1, 9) / 1000; // first slot 11:00 local
  const list = fakeForecast(start);

  const days = buildDailyForecast(list, tz, { nowUnix: now });
  assert.equal(days.length, 5);

  const keys = days.map((day) => day.dateKey);
  assert.equal(new Set(keys).size, 5, 'days must be distinct');
  assert.ok(!keys.includes('2026-11-01'), 'today is skipped when 5 future days exist');
  assert.deepEqual(keys, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);

  // Each full day contains temps 15..22 → temp_max up to 23, temp_min down to 14
  const full = days[1];
  assert.equal(full.samples, 8);
  assert.equal(full.isPartial, false);
  assert.equal(full.high, 23);
  assert.equal(full.low, 14);
  assert.equal(full.weekday, 'Tuesday');
});

test('forecast falls back to including today when fewer than 5 future days exist', () => {
  const tz = 0;
  const now = Date.UTC(2026, 10, 1, 0) / 1000;
  const list = fakeForecast(Date.UTC(2026, 10, 1, 0) / 1000, { count: 36 }); // 4.5 days
  const days = buildDailyForecast(list, tz, { nowUnix: now });
  assert.equal(days.length, 5);
  assert.equal(days[0].dateKey, '2026-11-01');
});

test('forecast uses daytime icon variants and the dominant condition', () => {
  const now = Date.UTC(2026, 10, 1, 0) / 1000;
  const list = fakeForecast(Date.UTC(2026, 10, 2, 0) / 1000, {
    // rain during most daytime slots
    conditionAt: (i) => ([2, 3, 4, 5].includes(i % 8) ? 500 : 800),
  });
  const [first] = buildDailyForecast(list, 0, { nowUnix: now });
  assert.equal(first.conditionId, 500);
  assert.equal(first.icon, '01d');
  assert.equal(first.precipitationChance, 60);
});

test('theme selection covers every required condition', () => {
  assert.equal(getThemeKey(800, false), 'clear');
  assert.equal(getThemeKey(803, false), 'clouds');
  assert.equal(getThemeKey(741, false), 'clouds'); // fog
  assert.equal(getThemeKey(500, false), 'rain');
  assert.equal(getThemeKey(301, false), 'rain');   // drizzle
  assert.equal(getThemeKey(211, false), 'storm');
  assert.equal(getThemeKey(601, false), 'snow');
  assert.equal(getThemeKey(800, true), 'night');
  assert.equal(getThemeKey(804, true), 'night');
  assert.equal(getThemeKey(500, true), 'rain', 'precipitation beats night');
});

test('night detection uses icon suffix, then sunrise/sunset', () => {
  assert.equal(isNightTime({ icon: '01n' }), true);
  assert.equal(isNightTime({ icon: '01d' }), false);
  assert.equal(isNightTime({ dt: 50, sunrise: 100, sunset: 200 }), true);
  assert.equal(isNightTime({ dt: 150, sunrise: 100, sunset: 200 }), false);
});

test('formatting helpers', () => {
  assert.equal(degreesToCompass(0), 'N');
  assert.equal(degreesToCompass(225), 'SW');
  assert.equal(degreesToCompass(359), 'N');
  assert.equal(degreesToCompass(undefined), null);

  assert.deepEqual(formatVisibility(10000), { value: '10+ km', note: 'Excellent' });
  assert.equal(formatVisibility(4500).value, '4.5 km');
  assert.equal(formatVisibility(800).note, 'Fog-level');
  assert.equal(formatVisibility(undefined).value, 'N/A');

  assert.equal(formatUtcOffset(7200), 'UTC+2');
  assert.equal(formatUtcOffset(-18000), 'UTC−5');
  assert.equal(formatUtcOffset(19800), 'UTC+5:30');

  // 04:30 UTC sunrise in Johannesburg is 06:30 local
  assert.equal(formatCityTime(Date.UTC(2026, 10, 1, 4, 30) / 1000, 7200), '06:30');

  assert.equal(roundTemp(-0.4), 0);
  assert.equal(getIconUrl('10d'), 'https://openweathermap.org/img/wn/10d@2x.png');
  assert.equal(getIconUrl('bogus'), 'https://openweathermap.org/img/wn/03d@2x.png');
  assert.equal(toDayIcon('02n'), '02d');
});

test('buildCurrentViewModel maps an OpenWeatherMap payload', () => {
  const view = buildCurrentViewModel({
    id: 993800,
    name: 'Johannesburg',
    dt: Date.UTC(2026, 10, 1, 10) / 1000,
    timezone: 7200,
    main: { temp: 24.6, feels_like: 24.1, temp_min: 22.2, temp_max: 26.8, humidity: 38, pressure: 1018 },
    weather: [{ id: 801, main: 'Clouds', description: 'few clouds', icon: '02d' }],
    wind: { speed: 4.12, deg: 300 },
    visibility: 10000,
    sys: { country: 'ZA', sunrise: Date.UTC(2026, 10, 1, 3, 15) / 1000, sunset: Date.UTC(2026, 10, 1, 16, 45) / 1000 },
  });
  assert.equal(view.temperature, 25);
  assert.equal(view.description, 'Few Clouds');
  assert.equal(view.windDirection, 'WNW');
  assert.equal(view.sunrise, '05:15');
  assert.equal(view.sunset, '18:45');
  assert.equal(view.daylight, '13h 30m');
  assert.equal(view.theme, 'clear');
  assert.equal(view.isNight, false);
});
