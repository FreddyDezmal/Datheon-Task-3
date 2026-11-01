/**
 * Unit tests for js/api.js helpers (no network) — run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequestUrl,
  errorFromStatus,
  assertCurrentWeatherShape,
  assertForecastShape,
  ErrorType,
} from '../js/api.js';

const base = {
  API_BASE_URL: 'https://api.openweathermap.org/data/2.5',
  UNITS: 'metric',
  LANG: 'en',
};

test('direct mode adds appid and metric units', () => {
  const url = new URL(buildRequestUrl('weather', { q: 'São Paulo, BR' }, { ...base, MODE: 'direct', API_KEY: 'abc123' }));
  assert.equal(url.origin + url.pathname, 'https://api.openweathermap.org/data/2.5/weather');
  assert.equal(url.searchParams.get('q'), 'São Paulo, BR');
  assert.equal(url.searchParams.get('appid'), 'abc123');
  assert.equal(url.searchParams.get('units'), 'metric');
});

test('proxy mode never includes the API key', () => {
  const url = new URL(buildRequestUrl('forecast', { q: 'Tokyo' }, { ...base, MODE: 'proxy', PROXY_URL: '/.netlify/functions/owm', API_KEY: 'should-not-leak' }));
  assert.equal(url.pathname, '/.netlify/functions/owm');
  assert.equal(url.searchParams.get('endpoint'), 'forecast');
  assert.equal(url.searchParams.has('appid'), false);
  assert.ok(!url.toString().includes('should-not-leak'));
});

test('HTTP status codes map to typed errors', () => {
  assert.equal(errorFromStatus(401).type, ErrorType.INVALID_KEY);
  assert.equal(errorFromStatus(404).type, ErrorType.NOT_FOUND);
  assert.equal(errorFromStatus(429).type, ErrorType.RATE_LIMIT);
  assert.equal(errorFromStatus(400).type, ErrorType.BAD_REQUEST);
  assert.equal(errorFromStatus(503).type, ErrorType.SERVER);
  assert.equal(errorFromStatus(503).status, 503);
});

test('response-shape validation rejects unexpected payloads', () => {
  assert.throws(() => assertCurrentWeatherShape({ hello: 'world' }), { type: ErrorType.BAD_RESPONSE });
  assert.throws(() => assertForecastShape({ list: [] }), { type: ErrorType.BAD_RESPONSE });
  assert.throws(() => assertCurrentWeatherShape(null), { type: ErrorType.BAD_RESPONSE });
});
