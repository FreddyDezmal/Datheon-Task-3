/**
 * app.js — DOM, events and rendering.
 *
 * Flow:  submit → validate → setLoading → fetchWeatherBundle (Promise.all)
 *        → build view models (weather.js) → render every widget → persist
 *
 * Widgets: hero (current + summary + particles), hourly strip, 5-day tiles
 * (selectable), chance-of-rain columns, highlights (feels-like, humidity/dew
 * point, precipitation, visibility, pressure, wind compass, sun arc), Overview
 * line chart (tabs), and the "Other large cities" list.
 *
 * Race-condition protection:
 *   - the search button and quick-search chips are disabled while a request runs
 *   - each search gets its own AbortController; a newer search aborts the older
 *   - a monotonically increasing request id ensures only the latest response renders
 *
 * All API-derived text is inserted with textContent / createElement — never
 * innerHTML — so data can't inject markup.
 */

import { CONFIG } from './config.js';
import { fetchWeatherBundle, fetchCitySnapshots, ErrorType, WeatherApiError } from './api.js';
import {
  buildCurrentViewModel,
  buildDailyForecast,
  buildUpcomingSlots,
  buildSlot,
  buildSeries,
  buildDailySummary,
  niceTicks,
  totalPrecipitation,
  sunProgress,
  formatCityDateTime,
  formatCityTime,
  formatDuration,
  formatUtcOffset,
  formatTemp,
  toDisplayTemp,
  getIconUrl,
  cityDateKey,
  titleCase,
  OVERVIEW_METRICS,
  THEMES,
} from './weather.js';

const FALLBACK_ICON = 'assets/icons/partly-cloudy.svg';
const SVG_NS = 'http://www.w3.org/2000/svg';
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------------------------------------------------------------------
 * DOM references
 * ------------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const dom = {
  root: document.documentElement,
  body: document.body,
  form: $('search-form'),
  input: $('city-input'),
  button: $('search-button'),
  message: $('search-message'),
  liveStatus: $('live-status'),
  connection: $('connection-status'),
  main: $('main'),
  locationPill: $('location-pill'),
  locationText: $('location-text'),
  unitButtons: [...document.querySelectorAll('[data-unit]')],
  unitLabels: [...document.querySelectorAll('[data-unit-label]')],
  modeToggle: $('mode-toggle'),

  emptyState: $('empty-state'),
  setupState: $('setup-state'),
  loadingState: $('loading-state'),
  dashboard: $('dashboard'),
  chips: [...document.querySelectorAll('.chip[data-city]')],

  hero: document.querySelector('.hero'),
  heroFx: document.querySelector('.hero__fx'),
  city: $('current-city'),
  time: $('current-time'),
  tz: $('current-tz'),
  updated: $('updated-badge'),
  icon: $('current-icon'),
  temp: $('current-temp'),
  desc: $('current-desc'),
  summary: $('current-summary'),
  feels: $('current-feels'),
  high: $('current-high'),
  low: $('current-low'),

  hourlyList: $('hourly-list'),
  hourlyScope: $('hourly-scope'),
  hourlyReset: $('hourly-reset'),
  forecastList: $('forecast-list'),
  rainChart: $('rain-chart'),
  rainScope: $('rain-scope'),

  feelsValue: $('metric-feels'),
  feelsNote: $('metric-feels-note'),
  humidity: $('metric-humidity'),
  humidityBar: $('metric-humidity-bar'),
  dew: $('metric-dew'),
  precip: $('metric-precip'),
  precipNote: $('metric-precip-note'),
  visibility: $('metric-visibility'),
  visibilitySub: $('metric-visibility-sub'),
  pressure: $('metric-pressure'),
  pressureSub: $('metric-pressure-sub'),
  wind: $('metric-wind'),
  windNote: $('metric-wind-note'),
  windGust: $('metric-wind-gust'),
  compass: $('compass'),
  compassTicks: $('compass-ticks'),
  compassNeedle: $('compass-needle'),
  sunrise: $('metric-sunrise'),
  sunset: $('metric-sunset'),
  daylight: $('metric-daylight'),
  sunArcDone: $('sun-arc-done'),
  sunArcSun: $('sun-arc-sun'),

  overviewTabs: [...document.querySelectorAll('.tabs__tab[data-metric]')],
  overviewChart: $('overview-chart'),
  citiesList: $('cities-list'),
};

/* ---------------------------------------------------------------------------
 * Local storage (wrapped: storage can throw in private mode / when disabled)
 * ------------------------------------------------------------------------- */

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable — not critical */ }
  },
};

/* ---------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------- */

const state = {
  isLoading: false,
  requestId: 0,
  controller: null,
  clockTimer: null,

  unit: storage.get(CONFIG.STORAGE_KEYS.TEMP_UNIT) === 'F' ? 'F' : 'C',
  overviewMetric: 'temperature',

  /** Last successful result — never replaced by a failed search. */
  current: null,      // current-weather view model
  timezone: 0,
  upcoming: [],       // next 24 h of 3-hour slots
  allSlots: [],       // all 40 slots (Overview chart)
  upcomingRaw: [],    // raw entries behind `upcoming` (precipitation totals)
  days: [],           // 5 daily summaries
  selectedDayKey: null,
  theme: 'default',

  /** "Other large cities": city name → { at, result } */
  cityCache: new Map(),
  cityRequestId: 0,
};

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

/** @returns {{ ok: true, value: string } | { ok: false, message: string }} */
function validateCityInput(raw) {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return { ok: false, message: 'Please enter a city name to search.' };
  if (value.length < CONFIG.CITY_MIN_LENGTH) {
    return { ok: false, message: `City names need at least ${CONFIG.CITY_MIN_LENGTH} characters.` };
  }
  if (value.length > CONFIG.CITY_MAX_LENGTH) {
    return { ok: false, message: 'That name is too long — try just the city, optionally with a country code.' };
  }
  if (!CONFIG.CITY_PATTERN.test(value)) {
    return { ok: false, message: 'City names can only contain letters, spaces, commas, hyphens, apostrophes and full stops.' };
  }
  return { ok: true, value };
}

/* ---------------------------------------------------------------------------
 * Error → friendly message
 * ------------------------------------------------------------------------- */

function describeError(error, city) {
  const type = error instanceof WeatherApiError ? error.type : null;

  switch (type) {
    case ErrorType.NOT_FOUND:
      return { tone: 'warning', title: 'City not found.', text: `We couldn't find “${city}”. Check the spelling, or add a country code like “Paris, FR”.` };
    case ErrorType.INVALID_KEY:
      return { tone: 'error', title: 'API key rejected.', text: 'OpenWeatherMap did not accept the API key. Check the key in your .env file. New keys can take up to a couple of hours to activate.' };
    case ErrorType.MISSING_KEY:
      return { tone: 'error', title: 'API key not configured.', text: 'Add your OpenWeatherMap API key to .env and restart the app — see the README for the steps.' };
    case ErrorType.RATE_LIMIT:
      return { tone: 'warning', title: 'Too many requests.', text: 'The API rate limit was reached. Wait a minute and try again.' };
    case ErrorType.NETWORK:
      return navigator.onLine === false
        ? { tone: 'error', title: 'You are offline.', text: 'Reconnect to the internet and try again.' }
        : { tone: 'error', title: 'Connection problem.', text: 'We could not reach OpenWeatherMap. Check your connection, or whether a browser extension is blocking the request.' };
    case ErrorType.TIMEOUT:
      return { tone: 'error', title: 'Request timed out.', text: 'OpenWeatherMap took too long to respond. Please try again.' };
    case ErrorType.SERVER:
      return { tone: 'error', title: 'Weather service unavailable.', text: `OpenWeatherMap returned an error${error.status ? ` (HTTP ${error.status})` : ''}. Please try again shortly.` };
    case ErrorType.BAD_REQUEST:
      return { tone: 'warning', title: 'Search not understood.', text: 'The weather service could not process that search. Try a simpler city name.' };
    case ErrorType.BAD_RESPONSE:
      return { tone: 'error', title: 'Unexpected response.', text: 'The weather service sent data in an unexpected format, so nothing was updated.' };
    default:
      return { tone: 'error', title: 'Something went wrong.', text: 'An unexpected error occurred. Please try again.' };
  }
}

/* ---------------------------------------------------------------------------
 * Small DOM helpers
 * ------------------------------------------------------------------------- */

/** createElement with class + text in one call. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** Set an <img> to an OWM icon, falling back to a bundled SVG if the CDN fails. */
function setIcon(img, iconCode, alt, size = 2) {
  img.onerror = () => {
    img.onerror = null;
    img.src = FALLBACK_ICON;
  };
  img.src = getIconUrl(iconCode, size);
  img.alt = alt;
}

function iconImg(className, iconCode, alt = '', size = 2, px = 48) {
  const img = el('img', className);
  img.width = px;
  img.height = px;
  img.decoding = 'async';
  setIcon(img, iconCode, alt, size);
  return img;
}

const t = (celsius) => formatTemp(celsius, state.unit);
const canonicalName = (view) => (view.country ? `${view.city}, ${view.country}` : view.city);

/* ---------------------------------------------------------------------------
 * Messages, view switching, loading
 * ------------------------------------------------------------------------- */

function showMessage({ tone = 'error', title = '', text = '' }) {
  dom.message.replaceChildren();
  dom.message.className = `search-message search-message--${tone}`;
  if (title) dom.message.append(el('strong', '', title), ' ');
  dom.message.append(text);
  dom.message.hidden = false;
  dom.input.setAttribute('aria-invalid', 'true');
}

function clearMessage() {
  dom.message.hidden = true;
  dom.message.replaceChildren();
  dom.input.setAttribute('aria-invalid', 'false');
}

function announce(text) {
  dom.liveStatus.textContent = '';
  requestAnimationFrame(() => { dom.liveStatus.textContent = text; });
}

/** Show exactly one of the main view states. */
function showView(view) {
  dom.emptyState.hidden = view !== 'empty';
  dom.setupState.hidden = view !== 'setup';
  dom.loadingState.hidden = view !== 'loading';
  dom.dashboard.hidden = view !== 'dashboard';
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  dom.button.disabled = isLoading;
  dom.button.classList.toggle('is-loading', isLoading);
  dom.button.querySelector('.search__button-label').textContent = isLoading ? 'Searching…' : 'Search';
  dom.chips.forEach((chip) => { chip.disabled = isLoading; });
  dom.citiesList.querySelectorAll('button.city').forEach((btn) => { btn.disabled = isLoading; });
  dom.main.setAttribute('aria-busy', String(isLoading));
  dom.dashboard.classList.toggle('is-refreshing', isLoading && Boolean(state.current));

  if (isLoading && !state.current) showView('loading');
}

/* ---------------------------------------------------------------------------
 * Theme + hero particles
 * ------------------------------------------------------------------------- */

const THEME_COLOURS = { clear: '#f08a24', clouds: '#4c5a6d', rain: '#1f4e79', storm: '#1a1b2e', snow: '#5f8fc4', night: '#141432' };

function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'default';
  if (next === state.theme) return;

  // Hold the previous hero tint on ::before, then let it fade out.
  const previousBg = getComputedStyle(dom.hero).getPropertyValue('--hero-bg');
  dom.hero.style.setProperty('--hero-prev', previousBg);
  dom.hero.classList.add('hero--fading');
  dom.body.dataset.theme = next;
  requestAnimationFrame(() => requestAnimationFrame(() => dom.hero.classList.remove('hero--fading')));

  state.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOURS[next] ?? '#11131c';
  renderParticles(next);
}

/** Spawn lightweight CSS-animated particles for the hero card. */
function renderParticles(theme) {
  dom.heroFx.replaceChildren();
  if (prefersReducedMotion.matches) return;

  const rand = (min, max) => min + Math.random() * (max - min);
  const spawn = (count, make) => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) fragment.append(make(i));
    dom.heroFx.append(fragment);
  };

  if (theme === 'rain' || theme === 'storm') {
    spawn(theme === 'storm' ? 80 : 60, () => {
      const drop = el('span', 'fx-drop');
      drop.style.left = `${rand(-10, 120)}%`;
      drop.style.animationDuration = `${rand(0.55, 0.95)}s`;
      drop.style.animationDelay = `${rand(-1, 0)}s`;
      drop.style.opacity = rand(0.35, 0.9).toFixed(2);
      return drop;
    });
    if (theme === 'storm') dom.heroFx.append(el('span', 'fx-flash'));
  } else if (theme === 'snow') {
    spawn(45, () => {
      const flake = el('span', 'fx-flake');
      const size = rand(2, 6);
      Object.assign(flake.style, {
        left: `${rand(0, 100)}%`, width: `${size}px`, height: `${size}px`,
        animationDuration: `${rand(6, 12)}s`, animationDelay: `${rand(-12, 0)}s`, opacity: rand(0.5, 1).toFixed(2),
      });
      return flake;
    });
  } else if (theme === 'night') {
    spawn(45, () => {
      const star = el('span', 'fx-star');
      Object.assign(star.style, {
        left: `${rand(0, 100)}%`, top: `${rand(0, 70)}%`,
        animationDuration: `${rand(1.5, 4)}s`, animationDelay: `${rand(-4, 0)}s`,
      });
      return star;
    });
  } else if (theme === 'clear') {
    dom.heroFx.append(el('span', 'fx-sun'));
  } else if (theme === 'clouds') {
    spawn(5, (i) => {
      const cloud = el('span', 'fx-cloud');
      const size = rand(160, 280);
      Object.assign(cloud.style, {
        width: `${size}px`, height: `${size * 0.55}px`, top: `${8 + i * 16}%`, left: '-40%',
        animationDuration: `${rand(28, 50)}s`, animationDelay: `${rand(-50, 0)}s`,
      });
      return cloud;
    });
  }
}

/* ---------------------------------------------------------------------------
 * Rendering: hero
 * ------------------------------------------------------------------------- */

function renderHero() {
  const view = state.current;
  dom.city.textContent = canonicalName(view);
  dom.tz.textContent = `Local time · ${formatUtcOffset(view.timezone)}`;
  dom.updated.textContent = `Updated ${formatCityTime(view.observedAt, view.timezone)}`;
  setIcon(dom.icon, view.icon, view.description, 4);
  dom.temp.textContent = toDisplayTemp(view.tempC, state.unit);
  dom.desc.textContent = view.description;
  dom.summary.textContent = buildDailySummary(view, state.upcoming, state.unit);
  dom.feels.textContent = t(view.feelsLikeC);
  dom.high.textContent = t(view.tempMaxC);
  dom.low.textContent = t(view.tempMinC);
  dom.locationText.textContent = canonicalName(view);
  dom.locationPill.hidden = false;
}

function updateClock() {
  if (!state.current) return;
  const nowUnix = Math.floor(Date.now() / 1000);
  dom.time.textContent = formatCityDateTime(nowUnix, state.current.timezone);
  dom.time.dateTime = new Date(nowUnix * 1000).toISOString();
  renderSunArc(nowUnix);
}

function startClock() {
  clearInterval(state.clockTimer);
  updateClock();
  state.clockTimer = setInterval(updateClock, CONFIG.CLOCK_REFRESH_MS);
}

/* ---------------------------------------------------------------------------
 * Rendering: hourly strip (next 24 h, or the selected day)
 * ------------------------------------------------------------------------- */

function selectedDay() {
  return state.days.find((day) => day.dateKey === state.selectedDayKey) ?? null;
}

function createHourItem(slot, index, isNow = false) {
  const item = el('li', `hour${isNow ? ' hour--now' : ''}`);
  item.style.setProperty('--delay', `${index * 35}ms`);
  item.append(
    el('span', 'hour__time', isNow ? 'Now' : slot.time),
    el('span', 'hour__temp', t(slot.tempC)),
    iconImg('hour__icon', slot.icon, '', 2, 44),
    el('span', 'hour__pop', slot.pop > 0 ? `💧 ${slot.pop}%` : ' '),
  );
  const pop = slot.pop > 0 ? `, ${slot.pop}% chance of rain` : '';
  item.setAttribute('aria-label', `${isNow ? 'Now' : slot.time}: ${t(slot.tempC)}, ${slot.description}${pop}`);
  return item;
}

function renderHourly() {
  const day = selectedDay();
  let items;
  if (day) {
    items = day.slots.map((slot, i) => createHourItem(slot, i));
    dom.hourlyScope.textContent = `· ${day.weekday} ${day.dateLabel}`;
  } else {
    const now = {
      time: 'Now', tempC: state.current.tempC, icon: state.current.icon,
      description: state.current.description, pop: 0,
    };
    items = [createHourItem(now, 0, true), ...state.upcoming.map((slot, i) => createHourItem(slot, i + 1))];
    dom.hourlyScope.textContent = '· Next 24 hours';
  }
  dom.hourlyReset.hidden = !day;
  dom.hourlyList.replaceChildren(...items);
}

/* ---------------------------------------------------------------------------
 * Rendering: five-day tiles (Array.map → cards)
 * ------------------------------------------------------------------------- */

function createDayTile(day, index) {
  const item = el('li');
  const button = el('button', 'day');
  button.type = 'button';
  button.dataset.date = day.dateKey;
  button.style.setProperty('--delay', `${index * 60}ms`);
  button.setAttribute('aria-pressed', String(day.dateKey === state.selectedDayKey));
  button.setAttribute(
    'aria-label',
    `${day.weekday} ${day.dateLabel}: ${day.description}, high ${t(day.highC)}, low ${t(day.lowC)}` +
      (day.precipitationChance ? `, ${day.precipitationChance}% chance of precipitation` : '') +
      (day.isPartial ? ', partial-day data' : '') + '. Show hourly detail.',
  );

  const temps = el('p', 'day__temps');
  temps.append(el('span', 'day__high', t(day.highC)), el('span', 'day__low', t(day.lowC)));

  const extras = [];
  if (day.precipitationChance > 0) extras.push(`💧 ${day.precipitationChance}%`);
  if (day.isPartial) extras.push('Partial day');

  button.append(
    el('span', 'day__name', day.isTomorrow ? 'Tomorrow' : day.weekdayShort),
    el('span', 'day__date', day.dateLabel),
    iconImg('day__icon', day.icon, '', 2, 60),
    el('span', 'day__desc', day.description),
    temps,
    el('span', 'day__extra', extras.join(' · ') || ' '),
  );
  item.append(button);
  return item;
}

function renderDaily() {
  const tomorrowKey = cityDateKey(Date.now() / 1000 + 86_400, state.timezone);
  const cards = state.days
    .map((day) => ({ ...day, isTomorrow: day.dateKey === tomorrowKey }))
    .map(createDayTile);
  dom.forecastList.replaceChildren(...cards);
}

function selectDay(dateKey) {
  state.selectedDayKey = state.selectedDayKey === dateKey ? null : dateKey;
  dom.forecastList.querySelectorAll('.day').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.date === state.selectedDayKey));
  });
  renderHourly();
  renderRainChart();
  const day = selectedDay();
  announce(day ? `Showing hourly detail for ${day.weekday}` : 'Showing the next 24 hours');
}

/* ---------------------------------------------------------------------------
 * Rendering: chance-of-rain column chart (single series)
 * ------------------------------------------------------------------------- */

function renderRainChart() {
  const day = selectedDay();
  const slots = day ? day.slots : state.upcoming;
  dom.rainScope.textContent = day ? `${day.weekday} ${day.dateLabel}` : 'Next 24 hours';

  const axis = el('div', 'rain-chart__axis');
  axis.setAttribute('aria-hidden', 'true');
  axis.append(el('span', '', '100%'), el('span', '', '50%'), el('span', '', '0%'));

  const plot = el('div', 'rain-chart__plot');
  const grid = el('div', 'rain-chart__grid');
  const bars = el('div', 'rain-chart__bars');
  bars.setAttribute('role', 'list');
  bars.setAttribute('aria-label', `Chance of rain, ${dom.rainScope.textContent}`);
  const labels = el('div', 'rain-chart__labels');
  labels.setAttribute('aria-hidden', 'true');
  const tooltip = el('div', 'tooltip');
  tooltip.hidden = true;

  // Keep time labels legible: label every other bar when there are more than six.
  const labelEvery = slots.length > 6 ? 2 : 1;

  slots.forEach((slot, index) => {
    const bar = el('div', 'rain-bar');
    bar.tabIndex = 0;
    bar.setAttribute('role', 'listitem');
    const amount = slot.precipMm > 0 ? `, about ${slot.precipMm.toFixed(1)} mm` : '';
    bar.setAttribute('aria-label', `${slot.time}: ${slot.pop}% chance of rain${amount}`);

    const fill = el('span', 'rain-bar__fill');
    fill.style.setProperty('--h', `${slot.pop}%`);
    fill.style.setProperty('--delay', `${index * 40}ms`);
    bar.append(fill);

    const show = () => {
      tooltip.replaceChildren(el('strong', '', `${slot.pop}%`), `${slot.time} · ${slot.description}${slot.precipMm > 0 ? ` · ${slot.precipMm.toFixed(1)} mm` : ''}`);
      tooltip.hidden = false;
      const plotBox = plot.getBoundingClientRect();
      const fillBox = fill.getBoundingClientRect();
      tooltip.style.left = `${fillBox.left + fillBox.width / 2 - plotBox.left}px`;
      tooltip.style.top = `${Math.max(fillBox.top - plotBox.top, 0)}px`;
    };
    const hide = () => { tooltip.hidden = true; };
    bar.addEventListener('pointerenter', show);
    bar.addEventListener('focus', show);
    bar.addEventListener('pointerleave', hide);
    bar.addEventListener('blur', hide);

    bars.append(bar);
    labels.append(el('span', '', index % labelEvery === 0 ? slot.time : ''));
  });

  plot.append(grid, bars, labels, tooltip);
  dom.rainChart.replaceChildren(axis, plot);
}

/* ---------------------------------------------------------------------------
 * Rendering: highlights
 * ------------------------------------------------------------------------- */

function buildCompassTicks() {
  for (let deg = 0; deg < 360; deg += 15) {
    const major = deg % 90 === 0;
    const rad = (deg * Math.PI) / 180;
    const inner = major ? 44 : 48;
    dom.compassTicks.append(svgEl('line', {
      x1: 60 + Math.sin(rad) * inner, y1: 60 - Math.cos(rad) * inner,
      x2: 60 + Math.sin(rad) * 52, y2: 60 - Math.cos(rad) * 52,
      class: major ? 'major' : '',
    }));
  }
}

function renderHighlights() {
  const view = state.current;

  dom.feelsValue.textContent = t(view.feelsLikeC);
  dom.feelsNote.textContent = view.feelsLikeNote;

  dom.humidity.textContent = `${view.humidity}%`;
  dom.humidityBar.style.width = `${Math.min(100, Math.max(0, view.humidity))}%`;
  dom.dew.textContent = view.dewPointC === null
    ? 'Dew point unavailable'
    : `Dew point ${t(view.dewPointC)} · ${view.dewPointNote}`;

  const next24 = totalPrecipitation(state.upcomingRaw ?? []);
  dom.precip.textContent = `${view.precipLastHour.toFixed(1)} mm`;
  dom.precipNote.textContent = `In the last hour · ${next24.toFixed(1)} mm expected in next 24h`;

  dom.visibility.textContent = view.visibility;
  dom.visibilitySub.textContent = view.visibilityNote;
  dom.pressure.textContent = `${view.pressure} hPa`;
  dom.pressureSub.textContent = view.pressureNote;

  dom.wind.textContent = `${view.windSpeed.toFixed(1)} m/s`;
  dom.windNote.textContent = view.windDirection ? `${view.windNote} from ${view.windDirection}` : view.windNote;
  dom.windGust.textContent = view.windGust ? `Gusts ${view.windGust.toFixed(1)} m/s` : 'No gust data';
  if (view.windDeg === null) {
    dom.compassNeedle.style.opacity = '0.3';
    dom.compass.setAttribute('aria-label', 'Wind direction not reported');
  } else {
    // The arrow points where the wind is blowing TO (meteorological degrees + 180°).
    dom.compassNeedle.style.opacity = '1';
    dom.compassNeedle.style.transform = `rotate(${view.windDeg + 180}deg)`;
    dom.compass.setAttribute('aria-label', `Wind from ${view.windDirection} (${Math.round(view.windDeg)}°)`);
  }

  dom.sunrise.textContent = view.sunrise;
  dom.sunset.textContent = view.sunset;
  renderSunArc(Math.floor(Date.now() / 1000));
}

/** Position the sun on the arc; ellipse centre (100,82), rx 88, ry 70. */
function renderSunArc(nowUnix) {
  const view = state.current;
  if (!view) return;
  const progress = sunProgress(nowUnix, view.sunriseUnix, view.sunsetUnix);
  const p = progress ?? (nowUnix < view.sunriseUnix ? 0 : 1);
  const angle = Math.PI * (1 - p);
  dom.sunArcSun.setAttribute('cx', (100 + 88 * Math.cos(angle)).toFixed(1));
  dom.sunArcSun.setAttribute('cy', (82 - 70 * Math.sin(angle)).toFixed(1));
  dom.sunArcSun.classList.toggle('is-night', progress === null);
  dom.sunArcDone.style.strokeDasharray = `${(progress ?? (p === 1 ? 1 : 0)) * 100} 100`;

  const daylight = formatDuration(view.sunsetUnix - view.sunriseUnix);
  let when;
  if (progress !== null) when = `sets in ${formatDuration(view.sunsetUnix - nowUnix)}`;
  else if (nowUnix < view.sunriseUnix) when = `rises in ${formatDuration(view.sunriseUnix - nowUnix)}`;
  else when = 'the sun has set';
  dom.daylight.textContent = `${daylight} of daylight · ${when}`;
}

/* ---------------------------------------------------------------------------
 * Rendering: Overview line chart (single series, crosshair + tooltip)
 * ------------------------------------------------------------------------- */

/** Monotone cubic interpolation (Fritsch–Carlson): smooth without overshooting. */
function monotonePath(points) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  tangent[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangent[i] = (3 / h) * a * slope[i];
      tangent[i + 1] = (3 / h) * b * slope[i];
    }
  }
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    d += ` C${(points[i].x + third).toFixed(1)},${(points[i].y + tangent[i] * third).toFixed(1)}`
      + ` ${(points[i + 1].x - third).toFixed(1)},${(points[i + 1].y - tangent[i + 1] * third).toFixed(1)}`
      + ` ${points[i + 1].x.toFixed(1)},${points[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function renderOverview() {
  const container = dom.overviewChart;
  const metric = OVERVIEW_METRICS[state.overviewMetric];
  const series = buildSeries(state.allSlots, state.overviewMetric, state.unit);
  const unitLabel = state.overviewMetric === 'temperature' ? `°${state.unit}` : metric.unit.trim();

  container.replaceChildren();
  if (series.length < 2) {
    container.append(el('p', 'panel__note', 'Not enough data to draw this chart.'));
    return;
  }

  const width = Math.max(container.clientWidth, 280);
  const height = Math.max(container.clientHeight, 240);
  const margin = { top: 22, right: 14, bottom: 28, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const values = series.map((point) => point.value);
  let [min, max] = metric.domain ?? [Math.min(...values), Math.max(...values)];
  if (metric.floor !== undefined) min = Math.min(min, metric.floor);
  const ticks = niceTicks(min, max, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x0 = series[0].dt;
  const x1 = series[series.length - 1].dt;
  const sx = (dt) => margin.left + ((dt - x0) / (x1 - x0)) * innerW;
  const sy = (value) => margin.top + innerH - ((value - yMin) / (yMax - yMin)) * innerH;
  const points = series.map((point) => ({ ...point, x: sx(point.dt), y: sy(point.value) }));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });

  const defs = svgEl('defs');
  const gradient = svgEl('linearGradient', { id: 'area-wash', x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(
    // CSS variables only resolve in style, not in SVG presentation attributes.
    svgEl('stop', { offset: '0%', style: 'stop-color: var(--series); stop-opacity: 0.22' }),
    svgEl('stop', { offset: '100%', style: 'stop-color: var(--series); stop-opacity: 0' }),
  );
  defs.append(gradient);
  svg.append(defs);

  // Horizontal gridlines + y labels
  const gridGroup = svgEl('g', { class: 'chart-grid' });
  const axisGroup = svgEl('g', { class: 'chart-axis' });
  ticks.forEach((tick) => {
    const y = sy(tick);
    gridGroup.append(svgEl('line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y }));
    const label = svgEl('text', { x: margin.left - 8, y: y + 4, 'text-anchor': 'end' });
    label.textContent = `${tick}${state.overviewMetric === 'temperature' ? '°' : ''}`;
    axisGroup.append(label);
  });
  const unitText = svgEl('text', { x: margin.left - 8, y: margin.top - 10, 'text-anchor': 'end' });
  unitText.textContent = unitLabel;
  axisGroup.append(unitText);

  // Day separators (local midnight) + weekday labels centred in each day
  const dayGroup = svgEl('g', { class: 'chart-day' });
  const byDay = new Map();
  points.forEach((point) => {
    const key = cityDateKey(point.dt, state.timezone);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(point);
  });
  [...byDay.entries()].forEach(([key, dayPoints], index) => {
    const start = dayPoints[0].x;
    const end = dayPoints[dayPoints.length - 1].x;
    if (index > 0) dayGroup.append(svgEl('line', { x1: start - 4, x2: start - 4, y1: margin.top, y2: margin.top + innerH }));
    if (end - start >= 34 || byDay.size <= 3) {
      const label = svgEl('text', { x: (start + end) / 2, y: height - 8, 'text-anchor': 'middle' });
      label.textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
      axisGroup.append(label);
    }
  });

  const linePath = monotonePath(points);
  const area = svgEl('path', {
    class: 'chart-area',
    d: `${linePath} L${points[points.length - 1].x},${margin.top + innerH} L${points[0].x},${margin.top + innerH} Z`,
  });
  const line = svgEl('path', { class: 'chart-line', d: linePath });

  // Selective direct labels: only the highest and lowest points.
  const extremes = svgEl('g', { class: 'chart-extreme' });
  const maxPoint = points.reduce((a, b) => (b.value > a.value ? b : a));
  const minPoint = points.reduce((a, b) => (b.value < a.value ? b : a));
  const formatValue = (value) => (state.overviewMetric === 'temperature' ? `${value}°` : `${value}${metric.unit}`);
  [[maxPoint, -10], [minPoint, 18]].forEach(([point, offset]) => {
    if (maxPoint === minPoint && offset > 0) return;
    extremes.append(svgEl('circle', { cx: point.x, cy: point.y, r: 4 }));
    const label = svgEl('text', {
      x: Math.min(Math.max(point.x, margin.left + 20), width - margin.right - 20),
      y: point.y + offset, 'text-anchor': 'middle',
    });
    label.textContent = formatValue(point.value);
    extremes.append(label);
  });

  // Crosshair
  const cross = svgEl('g', { visibility: 'hidden' });
  const crossLine = svgEl('line', { class: 'chart-cross', y1: margin.top, y2: margin.top + innerH });
  const crossDot = svgEl('circle', { class: 'chart-dot', r: 5 });
  cross.append(crossLine, crossDot);

  const overlay = svgEl('rect', { x: margin.left, y: 0, width: innerW, height: height, fill: 'transparent' });

  svg.append(gridGroup, dayGroup, area, line, extremes, axisGroup, cross, overlay);

  const tooltip = el('div', 'tooltip');
  tooltip.hidden = true;

  let activeIndex = -1;
  const showIndex = (index) => {
    activeIndex = Math.max(0, Math.min(points.length - 1, index));
    const point = points[activeIndex];
    cross.setAttribute('visibility', 'visible');
    crossLine.setAttribute('x1', point.x);
    crossLine.setAttribute('x2', point.x);
    crossDot.setAttribute('cx', point.x);
    crossDot.setAttribute('cy', point.y);
    const when = `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date((point.dt + state.timezone) * 1000))} ${point.slot.time}`;
    tooltip.replaceChildren(el('strong', '', formatValue(point.value)), `${metric.label} · ${when}`);
    tooltip.hidden = false;
    const scale = container.clientWidth / width; // viewBox matches the box, so ≈ 1
    tooltip.style.left = `${Math.min(Math.max(point.x * scale, 70), container.clientWidth - 70)}px`;
    tooltip.style.top = `${point.y * scale}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
  };

  overlay.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    let nearest = 0;
    points.forEach((point, i) => { if (Math.abs(point.x - x) < Math.abs(points[nearest].x - x)) nearest = i; });
    showIndex(nearest);
  });
  overlay.addEventListener('pointerleave', hide);

  // Keyboard: focus the chart, then use ← → (Home/End) to move the crosshair.
  container.tabIndex = 0;
  container.setAttribute('aria-label', `${metric.label} over the next five days. Use left and right arrow keys to read values.`);
  container.onkeydown = (event) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key in moves) { event.preventDefault(); showIndex((activeIndex < 0 ? 0 : activeIndex) + moves[event.key]); announceValue(); }
    if (event.key === 'Home') { event.preventDefault(); showIndex(0); announceValue(); }
    if (event.key === 'End') { event.preventDefault(); showIndex(points.length - 1); announceValue(); }
    if (event.key === 'Escape') hide();
  };
  container.onblur = hide;
  const announceValue = () => announce(tooltip.textContent);

  // Accessible table view of the same data.
  const table = el('table', 'sr-only');
  const caption = el('caption', '', `${metric.label} (${unitLabel}), 3-hourly for the next five days`);
  const body = el('tbody');
  points.forEach((point) => {
    const row = el('tr');
    row.append(el('th', '', `${cityDateKey(point.dt, state.timezone)} ${point.slot.time}`), el('td', '', formatValue(point.value)));
    body.append(row);
  });
  table.append(caption, body);

  container.append(svg, tooltip, table);
}

function selectOverviewMetric(metricKey, { focus = false } = {}) {
  state.overviewMetric = metricKey;
  dom.overviewTabs.forEach((tab) => {
    const selected = tab.dataset.metric === metricKey;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  if (state.current) renderOverview();
}

/* ---------------------------------------------------------------------------
 * Rendering: other large cities
 * ------------------------------------------------------------------------- */

function otherCityCandidates() {
  const currentName = state.current ? canonicalName(state.current).toLowerCase() : '';
  return CONFIG.OTHER_CITIES
    .filter((city) => city.toLowerCase() !== currentName)
    .slice(0, CONFIG.OTHER_CITIES_SHOWN);
}

function createCityItem(entry) {
  const item = el('li');
  if (!entry || !entry.ok) {
    const name = entry?.city ?? '';
    const box = el('div', 'city city--unavailable', `${name} — unavailable right now`);
    item.append(box);
    return item;
  }
  const data = entry.data;
  const condition = data.weather[0];
  const description = titleCase(condition.description ?? condition.main ?? '');
  const button = el('button', 'city');
  button.type = 'button';
  button.dataset.city = `${data.name}, ${data.sys?.country ?? ''}`.replace(/, $/, '');
  button.disabled = state.isLoading;
  button.setAttribute('aria-label', `${data.name}, ${data.sys?.country ?? ''}: ${t(data.main.temp)}, ${description}. Show full forecast.`);

  const side = el('span', 'city__side');
  side.append(iconImg('city__icon', condition.icon, '', 2, 52), el('span', 'city__temp', t(data.main.temp)));
  button.append(
    el('span', 'city__country', data.sys?.country ?? ''),
    el('span', 'city__name', data.name),
    el('span', 'city__desc', description),
    side,
  );
  item.append(button);
  return item;
}

function renderCities() {
  const entries = otherCityCandidates().map((city) => state.cityCache.get(city)?.result ?? null);
  if (entries.every((entry) => entry === null)) {
    dom.citiesList.replaceChildren(...otherCityCandidates().map(() => {
      const li = el('li');
      li.append(el('div', 'city city--skeleton'));
      return li;
    }));
    return;
  }
  dom.citiesList.replaceChildren(...entries.map(createCityItem));
}

/** Fetch only the cities that aren't cached (or are stale). Failures stay local to their card. */
async function loadOtherCities() {
  const requestId = ++state.cityRequestId;
  const now = Date.now();
  const stale = otherCityCandidates().filter((city) => {
    const cached = state.cityCache.get(city);
    return !cached || !cached.result.ok || now - cached.at > CONFIG.OTHER_CITIES_CACHE_MS;
  });

  renderCities();
  if (!stale.length) { dom.citiesList.setAttribute('aria-busy', 'false'); return; }

  dom.citiesList.setAttribute('aria-busy', 'true');
  const results = await fetchCitySnapshots(stale);
  results.forEach((result) => state.cityCache.set(result.city, { at: Date.now(), result }));
  if (requestId !== state.cityRequestId) return;
  dom.citiesList.setAttribute('aria-busy', 'false');
  renderCities();
}

/* ---------------------------------------------------------------------------
 * Render everything (also used when °C/°F changes — no refetch needed)
 * ------------------------------------------------------------------------- */

function renderAll() {
  if (!state.current) return;
  renderHero();
  renderHourly();
  renderDaily();
  renderRainChart();
  renderHighlights();
  renderOverview();
  renderCities();
}

/* ---------------------------------------------------------------------------
 * Search
 * ------------------------------------------------------------------------- */

async function searchCity(rawCity, { fromRestore = false } = {}) {
  const validation = validateCityInput(rawCity);
  if (!validation.ok) {
    showMessage({ tone: 'warning', text: validation.message });
    dom.input.focus();
    return;
  }
  const city = validation.value;

  // Cancel anything still in flight and claim this request.
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;

  clearMessage();
  setLoading(true);
  announce(`Loading weather for ${city}`);

  try {
    const { current, forecast } = await fetchWeatherBundle(city, { signal: controller.signal });
    if (requestId !== state.requestId) return; // a newer search has started

    // Build everything first; only commit to state once nothing has thrown.
    const tz = forecast.city.timezone;
    const nowUnix = Date.now() / 1000;
    const currentView = buildCurrentViewModel(current);
    const days = buildDailyForecast(forecast.list, tz, { dayCount: CONFIG.FORECAST_DAYS, nowUnix });
    const upcomingRaw = forecast.list.filter((entry) => entry.dt + 3 * 3600 > nowUnix).slice(0, CONFIG.HOURLY_SLOTS);
    const upcoming = buildUpcomingSlots(forecast.list, tz, { count: CONFIG.HOURLY_SLOTS, nowUnix });
    const allSlots = forecast.list.map((entry) => buildSlot(entry, tz));

    Object.assign(state, {
      current: currentView,
      timezone: tz,
      days,
      upcoming,
      upcomingRaw,
      allSlots,
      selectedDayKey: null,
    });

    showView('dashboard');
    applyTheme(currentView.theme);
    renderAll();
    startClock();
    loadOtherCities();

    const canonical = canonicalName(currentView);
    storage.set(CONFIG.STORAGE_KEYS.LAST_CITY, canonical);
    dom.input.value = canonical;
    announce(`Showing weather for ${canonical}: ${t(currentView.tempC)}, ${currentView.description}.`);
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (error instanceof WeatherApiError && error.type === ErrorType.ABORTED) return;

    console.error('[Atmosphere] Weather request failed:', error);
    const friendly = describeError(error, city);

    // Never replace good data with bad: keep the previous dashboard visible.
    if (state.current) {
      friendly.text += ` Still showing ${canonicalName(state.current)}.`;
      showView('dashboard');
    } else if (error?.type === ErrorType.MISSING_KEY || error?.type === ErrorType.INVALID_KEY) {
      showView('setup');
    } else {
      showView('empty');
    }

    // A failed restore of the saved city shouldn't shout at the user on page load.
    if (fromRestore && error?.type === ErrorType.NOT_FOUND) {
      showView('empty');
    } else {
      showMessage(friendly);
    }
    announce(`${friendly.title} ${friendly.text}`);
  } finally {
    if (requestId === state.requestId) {
      setLoading(false);
      state.controller = null;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Preferences: °C/°F and light/dark
 * ------------------------------------------------------------------------- */

function setUnit(unit) {
  state.unit = unit === 'F' ? 'F' : 'C';
  storage.set(CONFIG.STORAGE_KEYS.TEMP_UNIT, state.unit);
  dom.unitButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.unit === state.unit)));
  dom.unitLabels.forEach((label) => { label.textContent = `°${state.unit}`; });
  renderAll();
}

function setColorMode(mode) {
  const next = mode === 'light' ? 'light' : 'dark';
  dom.root.dataset.mode = next;
  storage.set(CONFIG.STORAGE_KEYS.COLOR_MODE, next);
  dom.modeToggle.setAttribute('aria-pressed', String(next === 'dark'));
  dom.modeToggle.title = next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

/* ---------------------------------------------------------------------------
 * Events & boot
 * ------------------------------------------------------------------------- */

function updateConnectionStatus() {
  dom.connection.hidden = navigator.onLine !== false;
}

function bindEvents() {
  // A <form> submit covers both the button click and the Enter key.
  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.isLoading) return;
    searchCity(dom.input.value);
  });

  dom.input.addEventListener('input', () => {
    if (!dom.message.hidden) clearMessage();
  });
  dom.input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { dom.input.value = ''; clearMessage(); }
  });

  dom.chips.forEach((chip) => chip.addEventListener('click', () => {
    if (state.isLoading) return;
    dom.input.value = chip.dataset.city;
    searchCity(chip.dataset.city);
  }));

  // Delegated: day tiles and city cards are re-rendered often.
  dom.forecastList.addEventListener('click', (event) => {
    const button = event.target.closest('.day');
    if (button) selectDay(button.dataset.date);
  });
  dom.hourlyReset.addEventListener('click', () => selectDay(state.selectedDayKey));
  dom.citiesList.addEventListener('click', (event) => {
    const button = event.target.closest('button.city');
    if (!button || state.isLoading) return;
    dom.input.value = button.dataset.city;
    searchCity(button.dataset.city);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
  });

  dom.unitButtons.forEach((btn) => btn.addEventListener('click', () => setUnit(btn.dataset.unit)));
  dom.modeToggle.addEventListener('click', () => setColorMode(dom.root.dataset.mode === 'dark' ? 'light' : 'dark'));

  // Tabs: click + arrow-key navigation (WAI-ARIA tabs pattern).
  dom.overviewTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectOverviewMetric(tab.dataset.metric));
    tab.addEventListener('keydown', (event) => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const next = dom.overviewTabs[(index + delta + dom.overviewTabs.length) % dom.overviewTabs.length];
      selectOverviewMetric(next.dataset.metric, { focus: true });
    });
  });

  // Redraw the SVG chart when its width changes.
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const size = Math.round(entry.contentRect.width) + Math.round(entry.contentRect.height) * 10_000;
    if (state.current && size !== lastWidth) {
      lastWidth = size;
      requestAnimationFrame(renderOverview);
    }
  }).observe(dom.overviewChart);

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateClock(); });
  prefersReducedMotion.addEventListener?.('change', () => renderParticles(state.theme));
}

function init() {
  buildCompassTicks();
  bindEvents();
  updateConnectionStatus();
  setColorMode(dom.root.dataset.mode);
  setUnit(state.unit);

  if (!CONFIG.IS_CONFIGURED) {
    showView('setup');
    return;
  }

  const lastCity = storage.get(CONFIG.STORAGE_KEYS.LAST_CITY);
  if (lastCity) {
    dom.input.value = lastCity;
    searchCity(lastCity, { fromRestore: true });
  } else {
    showView('empty');
  }
}

init();
