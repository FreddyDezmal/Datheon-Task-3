# Work Report 001: Atmosphere Weather App

**Project:** Datheon Task 3, Real-Time Weather Forecast & Climate Telemetry Web App
**Repository:** `FreddyDezmal/Datheon-Task-3` (branch `main`)
**Date:** Sunday, 1 November 2026
**Status:** Feature-complete; waiting for verification against the live OpenWeatherMap API, then commit and deployment

---

## 1. Summary

The project began as a placeholder skeleton: one commit with a heading-only `index.html`, a one-line stylesheet and a `console.log` in `app.js`. It is now a working vanilla-JavaScript weather dashboard. The app searches any city worldwide, shows current conditions and a five-day forecast from OpenWeatherMap, and adapts its visual theme to the weather.

The work ran in two phases:

1. **Baseline build.** The app was built to the brief in `Documentation/Prompts/001_baselineStart.md`.
2. **Design iteration.** The layout was reworked to include elements from three reference dashboard designs.

All 19 unit tests pass on the local machine. All 47 automated browser checks pass against mocked API responses. The app has **not yet been run against the live API**, because no API key had been configured and the development sandbox could not reach OpenWeatherMap.

---

## 2. Starting point

| Item | State at commit `afeb25a` ("First commit") |
|---|---|
| `index.html` | Title and `<h1>` only; it linked to `style.css` and `script.js`, neither of which existed at those paths |
| `css/style.css` | `body { background-color: lightblue; }` |
| `js/app.js` | `console.log("App is connected");` |
| `.gitignore` | `.vscode/`, `.DS_Store`, `config.js` |
| `README` | Empty file |

---

## 3. Phase 1: Baseline build

### 3.1 Architecture

The JavaScript is split by responsibility, as the brief requires:

| File | Responsibility |
|---|---|
| `js/config.js` | API URLs, metric units, timeouts, validation rules and storage keys. Loads the API key from a git-ignored `js/env.js`. |
| `js/api.js` | `fetch` with `async`/`await`, a 10-second timeout and `AbortController` cancellation. Maps HTTP status codes to typed errors and checks the shape of each response. |
| `js/weather.js` | Pure data processing with no DOM access: grouping forecasts by day, highs and lows, theme selection, icon URLs and formatting. |
| `js/app.js` | DOM, events, loading and error states, rendering, and `localStorage`. |

Both endpoints are fetched in parallel with `Promise.all()`. Searches can't overlap because:
- the Search button is disabled while a request runs;
- each new search aborts the previous one;
- each response carries a request ID, and only the latest response is rendered.

### 3.2 Features delivered

- **Search:** worldwide city search, submitted by button or Enter key. Validation catches empty, too-short, too-long and invalid input without making an API call. The last city is remembered.
- **Current weather:** city and country, the city's own local time, temperature, description, icon, feels-like, high and low, humidity, wind, pressure, visibility, sunrise and sunset.
- **Five-day forecast:** the 3-hour API data is grouped by calendar day **in the city's time zone**. Each day shows the highest `temp_max` and lowest `temp_min` of its slots. Days the API only partly covers are labelled.
- **Dynamic themes:** six backgrounds (clear, cloudy, rain, thunderstorm, snow and night) that cross-fade smoothly.
- **Error handling:**
  - empty input;
  - city not found (404);
  - invalid key (401) and missing key;
  - rate limit (429) and server errors (5xx);
  - network failure and timeout;
  - malformed responses.

  A failed search never replaces the data already on screen.

### 3.3 API key security

- The key lives in `.env`, which is git-ignored. `.env.example` is committed as a template.
- `npm start` runs a zero-dependency dev server that generates `js/env.js` in memory, so the key is never written into the project.
- For public hosting there is a **Netlify Function proxy** (`netlify/functions/owm.js`) that adds the key on the server. It only accepts the two endpoints and the parameters the app needs.
- The README explains that a key used directly from browser code is always visible to visitors, which is why the proxy exists.

---

## 4. Phase 2: Design iteration

Three reference dashboard designs were reviewed. The layout was rebuilt as a dark (or light) dashboard frame over the weather-reactive sky.

| Reference | Elements adopted |
|---|---|
| Design 1 (dark dashboard) | Dark frame, location pill, light/dark toggle, day tiles with a highlighted selected day, "Chance of rain" bar chart, "Other large cities" list |
| Design 2 (rainy hero) | Large hero card with animated weather particles, plain-language daily summary, hourly strip starting at "Now", detail cards with explanations (feels-like, dew point, precipitation), wind compass |
| Design 3 (Berlin dashboard) | °C/°F toggle, "Overview" line chart with metric tabs |

**Additional work in this phase:**
- **Selecting a day** switches the hourly strip and rain chart to that day.
- **Sun-position arc** for sunrise and sunset.
- **Charts are hand-built**, with no chart library: hover tooltips, arrow-key navigation, and a screen-reader data table.
- **Preferences:** °C/°F and dark/light mode are saved between visits.

**Deliberately not adopted:**

| Element | Reason |
|---|---|
| Global weather map | Needs a mapping library and a tile service |
| UV index, 10-day forecast | Only available on OpenWeatherMap's paid One Call API 3.0 |
| Subscribe card, avatar, sidebar navigation | No real feature would sit behind them |

---

## 5. Requirements checklist

Measured against the final acceptance criteria in `001_baselineStart.md`:

| Criterion | Status |
|---|---|
| Users can search global cities | ✅ Done |
| Real weather data is retrieved | ⚠️ Implemented to the documented API; live run still to be done |
| Conditions and icons update dynamically | ✅ Done |
| Current weather metrics display correctly | ✅ Done (verified with mocked data) |
| Five forecast days displayed | ✅ Done; distinct calendar days verified |
| Invalid searches handled gracefully | ✅ Done |
| Loading states work | ✅ Done |
| Network and API errors handled | ✅ Done (offline, 401, 404, 429, 5xx, timeout, malformed) |
| Works on desktop, tablet and mobile | ✅ Verified at 1366, 768, 375 and 320 px with no horizontal overflow |
| Code organised and documented | ✅ Done; comment headers in every module, plus a full README |
| API credentials not exposed in the repo | ✅ `.env` and `js/env.js` confirmed ignored with `git check-ignore` |

---

## 6. Testing

| Type | Tool | Result |
|---|---|---|
| Unit tests (`npm test`) | Node built-in test runner | **19 / 19 pass**, confirmed on the local machine |
| End-to-end checks | Playwright, headless Chromium, mocked API | **47 / 47 pass** |

**Unit tests cover:**
- day grouping across time zones, highs and lows, and themes;
- dew point, feels-like explanations, °F conversion and the hourly window;
- chart ticks, the sun arc and the summary text;
- URL building (including a check that the key never appears in proxy URLs), error mapping and response validation.

**End-to-end checks cover:**
- the four test cities from the brief, a nonexistent city and an empty search;
- network failure, invalid key, rate limit and malformed responses;
- the loading state and blocking of repeat submissions;
- restoring the last city after a reload;
- every theme;
- day selection, chart tabs and tooltips, the °F toggle, light mode and city cards;
- mobile and tablet overflow.

The end-to-end harness lived in the development sandbox and is not part of the repository.

---

## 7. Files

| File | Lines | Status |
|---|---|---|
| `index.html` | 283 | Rewritten |
| `css/style.css` | 703 | Rewritten |
| `js/app.js` | 1161 | Rewritten |
| `js/weather.js` | 492 | New |
| `js/api.js` | 229 | New |
| `js/config.js` | 70 | New |
| `scripts/dev-server.js`, `generate-env.js`, `load-env.js` | 162 | New |
| `netlify/functions/owm.js`, `netlify.toml` | 60 + config | New |
| `tests/` (3 files) | 300 | New |
| `README.md` | 380 | New |
| `assets/icons/` | 15 SVGs | New |
| `docs/screenshots/` | 4 images | New |
| `package.json`, `.env.example` | — | New |
| `.gitignore` | — | Changed (see below) |

About 3,840 lines in total. The browser code has no runtime dependencies, and `package.json` lists no npm packages.

---

## 8. Decisions and deviations

- **`.gitignore` no longer ignores `config.js`.** The brief requires `config.js` in the repository, so it now holds only public constants. The secret moved to `.env` and the generated `js/env.js`, which are both ignored.
- **Extra files beyond the suggested structure:** `scripts/`, `netlify/`, `tests/` and `docs/`. They provide the dev server, the secure deployment path, the tests and the README images.
- **"Other large cities" uses extra API calls:** up to 4 per load, cached for 10 minutes. This stays well within the free plan's 60 calls per minute.

---

## 9. Known limitations

- **Live API not yet verified.** Everything was tested with realistic mocked responses that follow OpenWeatherMap's documented format.
- **The fifth forecast day is usually partial.** The free forecast covers about 120 hours, so that day's high/low can understate the full day; it is labelled "Partial day".
- **City names can be ambiguous.** "Springfield" returns OpenWeatherMap's best match; adding a country code narrows it.
- **README screenshots use mock data.** All weather icons in them are the same placeholder.

---

## 10. Next steps

1. **Get an API key** from OpenWeatherMap and put it in `.env`. New keys can take up to about 2 hours to activate.
2. **Run `npm start`** and repeat QA scenarios 1–4 (Johannesburg, London, Tokyo, New York) against live data.
3. **Replace the README screenshots** with ones showing live data.
4. **Clean up:** delete the empty `README` file (now replaced by `README.md`) and the unused `docs/screenshots/desktop-snow.jpg`.
5. **Commit and push.** Check with `git status` first that `.env` and `js/env.js` are not listed.
6. **Deploy to Netlify** and set `OPENWEATHER_API_KEY` in the site's environment variables, so the public site uses the key-hiding proxy.
