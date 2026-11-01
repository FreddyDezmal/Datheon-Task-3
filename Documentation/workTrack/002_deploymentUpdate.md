# Work Report 002: Deployment & Live Verification

**Project:** Datheon Task 3, Atmosphere Weather App
**Repository:** `FreddyDezmal/Datheon-Task-3` (branch `main`)
**Date:** Sunday, 1 November 2026
**Follows:** [`001_progressReport.md`](001_progressReport.md)
**Status:** Deployed and confirmed working with live OpenWeatherMap data

---

## 1. Summary

Since report 001, the app has been committed, deployed to Netlify and confirmed working with real OpenWeatherMap data. The README now shows screenshots from the live site instead of mock-data images, and the leftover files flagged in report 001 have been removed.

**Live site:** <https://weather-forecast-t3.netlify.app>

---

## 2. What was done

| Step | Outcome |
|---|---|
| Committed the build | Commit `ba9c235`, "working system" (11:46) |
| Deployed to Netlify | Site live at `weather-forecast-t3.netlify.app` |
| Verified against the live API | Real searches return current conditions, hourly data and the five-day forecast (see §3) |
| Replaced README screenshots | Three live screenshots replace the four mock-data images |
| Added a live demo link | Near the top of `README.md` |
| Updated README wording | Removed the "Live API not verified" limitation; the testing section now records the live run |
| Cleanup from report 001 | Deleted the empty `README` file and the unused screenshots `desktop-snow.jpg`, `desktop-rain.jpg` and `desktop-snow-light.jpg` |

---

## 3. Live verification

Three cities were captured from the deployed site:

| Screenshot | City | What it confirms |
|---|---|---|
| `desktop-clear.jpg` | Paris, FR (UTC+1) | Clear-sky theme, local time and UTC offset, hourly strip from "Now", five distinct forecast days, "Partial day" label on the fifth day, light mode |
| `desktop-clouds.jpg` | Belokurikha, RU (UTC+7) | Cloudy theme, mixed conditions including snow, precipitation chance up to 100%, a summary naming the rain time and amount ("Rain is likely around 16:00 (about 1.0 mm in total)"), negative temperatures |
| `mobile-night.jpg` | New Orleans, US (UTC−6) | Night theme with star particles, dark mode, mobile layout, a summary giving a shower probability ("28% chance of showers around 15:00") |

Together these confirm the outstanding criterion from report 001: **real weather data is successfully retrieved.** They also show that time zones on both sides of UTC are handled correctly, that the city search works for a small town as well as major cities, and that the theme, unit and mode controls work in production.

---

## 4. Updated acceptance criteria

Every criterion from `Documentation/Prompts/001_baselineStart.md` is now met:

| Criterion | Status |
|---|---|
| Users can search global cities | ✅ Confirmed live (Paris, Belokurikha, New Orleans) |
| Real weather data is retrieved | ✅ **Confirmed live**; this was ⚠️ in report 001 |
| Conditions and icons update dynamically | ✅ Clear, cloudy and night themes seen live |
| Current weather metrics display correctly | ✅ |
| Five forecast days displayed | ✅ Five distinct days visible live |
| Invalid searches handled gracefully | ✅ Covered by automated tests |
| Loading states work | ✅ |
| Network and API errors handled | ✅ Covered by automated tests |
| Works on desktop, tablet and mobile | ✅ Desktop and a real phone confirmed live |
| Code organised and documented | ✅ |
| API credentials not exposed in the repo | ✅ `.env` and `js/env.js` are not tracked by git |

---

## 5. Repository state at time of writing

These changes are ready in the working copy but **not yet committed**:

```
 D README
 M README.md
 M docs/screenshots/desktop-clear.jpg
 M docs/screenshots/mobile-night.jpg
?? docs/screenshots/desktop-clouds.jpg
 D docs/screenshots/desktop-rain.jpg
 D docs/screenshots/desktop-snow-light.jpg
?? Documentation/workTrack/002_deploymentUpdate.md
```

Suggested commit:

```bash
git add -A
git commit -m "Add live screenshots, demo link and deployment report; remove stale files"
git push origin main
```

Netlify redeploys automatically after the push, if the site is connected to the GitHub repository.

---

## 6. Remaining notes

- **Netlify badge:** the "Powered by Netlify" badge is partly visible in the two desktop screenshots. It's cosmetic; retake the shots after dismissing the badge if you want cleaner images.
- **Partial fifth day:** this is still expected behaviour. The free forecast covers about 120 hours, and the day is labelled in the UI.
- **API key exposure: confirmed safe.** The deployed `js/env.js` contains an empty `OPENWEATHER_API_KEY` and `API_PROXY_URL: "/.netlify/functions/owm"`. The site therefore runs in proxy mode: the key stays in Netlify's server-side environment variables and never reaches visitors' browsers.
