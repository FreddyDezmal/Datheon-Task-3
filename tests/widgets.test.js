/**
 * Unit tests for the dashboard widgets' data logic in js/weather.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dewPoint,
  describeDewPoint,
  explainFeelsLike,
  describeWind,
  celsiusToFahrenheit,
  toDisplayTemp,
  formatTemp,
  buildUpcomingSlots,
  buildSeries,
  niceTicks,
  sunProgress,
  totalPrecipitation,
  recentPrecipitation,
  buildDailySummary,
} from '../js/weather.js';

const H = 3600;
const entry = (dt, temp, { pop = 0, id = 800, rain } = {}) => ({
  dt,
  main: { temp, temp_min: temp - 1, temp_max: temp + 1, humidity: 70, pressure: 1012 },
  wind: { speed: 4 },
  weather: [{ id, description: id >= 600 && id < 700 ? 'light snow' : 'clear sky', icon: '01d' }],
  pop,
  ...(rain ? { rain: { '3h': rain } } : {}),
});

test('dew point (Magnus) matches reference values', () => {
  assert.equal(Math.round(dewPoint(28, 82)), 25);  // the reference design shows 25° at 28°/82%
  assert.equal(Math.round(dewPoint(20, 50)), 9);
  assert.equal(dewPoint(20, 0), null);
  assert.equal(describeDewPoint(24.6), 'Oppressive');
  assert.equal(describeDewPoint(5), 'Dry');
});

test('feels-like explanations', () => {
  assert.equal(explainFeelsLike(28, 30, 82, 1), 'Humidity is making it feel warmer');
  assert.equal(explainFeelsLike(5, 1, 60, 8), 'Wind is making it feel cooler');
  assert.equal(explainFeelsLike(20, 20.4, 50, 2), 'Similar to the actual temperature');
  assert.equal(describeWind(4.6), 'Moderate breeze');
  assert.equal(describeWind(0.2), 'Calm');
});

test('°F conversion is display-only and rounds correctly', () => {
  assert.equal(celsiusToFahrenheit(100), 212);
  assert.equal(toDisplayTemp(25, 'F'), 77);
  assert.equal(toDisplayTemp(-0.3, 'C'), 0);
  assert.equal(formatTemp(10, 'F'), '50°');
});

test('upcoming slots skip the past and cover 24 h', () => {
  const now = 1_000_000;
  const list = Array.from({ length: 12 }, (_, i) => entry(now - 6 * H + i * 3 * H, 10 + i));
  const slots = buildUpcomingSlots(list, 0, { count: 8, nowUnix: now });
  assert.equal(slots.length, 8);
  assert.ok(slots[0].dt + 3 * H > now);
  assert.equal(slots[0].tempC, 12); // a slot that ended exactly now is excluded
  const later = buildUpcomingSlots(list, 0, { count: 8, nowUnix: now + H });
  assert.equal(later[0].tempC, 12); // the slot that started 1 h ago is still running
});

test('chart series + nice ticks', () => {
  const slots = buildUpcomingSlots([entry(0, 10), entry(3 * H, 20)], 0, { nowUnix: 0 });
  assert.deepEqual(buildSeries(slots, 'temperature', 'F').map((p) => p.value), [50, 68]);
  assert.deepEqual(buildSeries(slots, 'humidity').map((p) => p.value), [70, 70]);
  assert.deepEqual(buildSeries(slots, 'nope'), []);
  assert.deepEqual(niceTicks(3.2, 17.8), [0, 5, 10, 15, 20]);
  assert.deepEqual(niceTicks(0, 100), [0, 25, 50, 75, 100]);
  assert.ok(niceTicks(5, 5).length >= 2);
});

test('sun progress and precipitation totals', () => {
  assert.equal(sunProgress(150, 100, 200), 0.5);
  assert.equal(sunProgress(50, 100, 200), null);
  assert.equal(totalPrecipitation([entry(0, 1, { rain: 1.2 }), entry(0, 1), { ...entry(0, 1), snow: { '3h': 0.3 } }]).toFixed(1), '1.5');
  assert.equal(recentPrecipitation({ rain: { '1h': 0.4 }, snow: { '1h': 0.1 } }), 0.5);
  assert.equal(recentPrecipitation({}), 0);
});

test('daily summary uses real values and names the precipitation type', () => {
  const current = { tempC: 12, windSpeed: 3, description: 'Light Rain' };
  const rainy = buildUpcomingSlots([entry(H, 10, { pop: 0.8, id: 500, rain: 2 }), entry(4 * H, 15)], 0, { nowUnix: 0 });
  const text = buildDailySummary(current, rainy, 'C');
  assert.match(text, /between 10° and 15°/);
  assert.match(text, /Rain is likely around 01:00 \(about 2\.0 mm in total\)/);

  const snowy = buildUpcomingSlots([entry(H, -2, { pop: 0.9, id: 600 })], 0, { nowUnix: 0 });
  assert.match(buildDailySummary({ ...current, tempC: -1 }, snowy, 'C'), /Snow is likely/);

  const dry = buildUpcomingSlots([entry(H, 20)], 0, { nowUnix: 0 });
  assert.match(buildDailySummary(current, dry, 'F'), /between 54° and 68°.*Little chance/);
});
