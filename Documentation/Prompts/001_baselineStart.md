# ROLE & EXPERTISE

Act as a Senior Frontend Developer, UI/UX Designer, JavaScript Engineer, and API Integration Specialist.

Your task is to design and develop a production-quality, fully functional Real-Time Weather Forecast & Climate Telemetry Web Application.

The application must demonstrate professional frontend development practices, asynchronous API integration, responsive interface design, dynamic rendering, and robust error handling.

This is an intermediate-level development assessment. Prioritize clean architecture, functional completeness, usability, accessibility, and polished visual design.

# 1. DECONSTRUCT — PROJECT REQUIREMENTS

## Project Objective

Build a live weather dashboard that allows users to search for any city worldwide and retrieve its current weather conditions and a five-day weather forecast.

The application must retrieve real weather information from OpenWeatherMap through asynchronous REST API requests.

## Required Technologies

- HTML5 for semantic structure.
- CSS3 for styling, animations, Flexbox, and responsive layouts.
- Vanilla JavaScript (ES6+) for application logic.
- Fetch API with async/await for asynchronous requests.
- OpenWeatherMap API for weather information.
- Local storage for optional persistence of the user's last searched city.

Do not use React, Vue, Angular, or other frontend frameworks. The objective is to demonstrate proficiency in vanilla JavaScript.

# 2. DIAGNOSE — TECHNICAL PLANNING

Before writing code:

1. Analyze the functional requirements.
2. Identify the API endpoints required.
3. Plan the application architecture.
4. Determine the required state-management approach.
5. Identify possible API, network, and input-validation errors.
6. Establish a responsive design strategy.
7. Ensure API credentials are handled securely.

Use the following API endpoints:

Current Weather:
https://api.openweathermap.org/data/2.5/weather

Five-Day Forecast:
https://api.openweathermap.org/data/2.5/forecast

Use metric units (Celsius, meters per second, and hPa).

Important: OpenWeatherMap API access requires a valid API key. Do not invent credentials or assume the key is active. Provide clear setup instructions and an environment configuration approach. Never commit API keys to a public GitHub repository.

# 3. DEVELOP — APPLICATION FEATURES

## A. Weather Search Interface

Create an intuitive search interface containing:

- Application logo or weather-themed branding.
- Search input for global city searches.
- Search button.
- Enter-key submission support.
- Search loading indicator.
- Clear feedback for empty or invalid searches.
- Last searched city persistence.

The user must be able to search for cities worldwide.

## B. Current Weather Dashboard

Display the following information:

- City name and country.
- Current local date and time.
- Current temperature in Celsius.
- Weather description.
- Dynamic weather icon.
- Feels-like temperature.
- Minimum and maximum temperature.
- Humidity percentage.
- Wind speed.
- Atmospheric pressure.
- Visibility.
- Sunrise and sunset times.

Use the actual API response rather than hardcoded weather values.

## C. Dynamic Weather Visualization

The interface must visually respond to the retrieved weather conditions.

Implement different background gradients or visual themes for:

- Sunny / clear skies: warm, bright gradients.
- Cloudy / overcast: muted grey-blue gradients.
- Rainy: cool blue gradients.
- Thunderstorms: dark dramatic gradients.
- Snow: icy blue and white gradients.
- Nighttime: deep navy and purple gradients.

Use appropriate weather icons from OpenWeatherMap's icon system.

The visual theme should update automatically whenever a new city is searched.

## D. Five-Day Weather Forecast

Create a five-day forecast section using the OpenWeatherMap five-day forecast endpoint.

Each forecast card should display:

- Day of the week.
- Weather icon.
- Weather description.
- Maximum temperature.
- Minimum temperature.

Important implementation detail:

The forecast API returns data in three-hour intervals. Group the forecast entries by calendar day and calculate representative daily temperatures using the available forecast data.

Avoid displaying five duplicate forecast cards for individual time intervals.

Use JavaScript Array.map() to dynamically render the forecast cards.

## E. Loading States and Error Handling

Implement comprehensive error handling.

Loading states:
- Display an animated loading spinner while fetching data.
- Disable repeated search submissions while a request is processing.
- Display appropriate loading feedback.

Error states:
- Invalid city name.
- Empty search input.
- Network connectivity failure.
- API request failure.
- Invalid or missing API key.
- API rate-limit errors.
- Unexpected API response.

Display friendly, informative error messages.

Never allow a failed request to crash the application.

If a new search fails, do not silently replace previously retrieved weather information with fabricated data.

## F. User Experience Enhancements

Implement the following where practical:

- Smooth transitions between weather themes.
- Responsive forecast cards.
- Hover effects on interactive elements.
- Subtle loading animations.
- Search input focus styling.
- Accessible labels and keyboard navigation.
- Clear empty states.
- Mobile-friendly layouts.

# 4. DELIVER — DESIGN AND IMPLEMENTATION

## Visual Design Direction

Create a premium, modern weather dashboard.

Design inspiration:
- Modern SaaS dashboards.
- Glassmorphism.
- Minimalist weather applications.
- Soft gradients.
- Clean typography.
- Rounded cards.
- Subtle shadows.
- Spacious layouts.

Suggested layout:

1. Header with branding.
2. City search section.
3. Main current-weather display.
4. Weather metrics grid.
5. Five-day forecast section.
6. Small footer with API attribution.

Desktop:
- Centered dashboard with a maximum content width.
- Flexible two-column layout where appropriate.
- Forecast cards displayed horizontally.

Tablet:
- Adaptable two-column or stacked layout.

Mobile:
- Single-column layout.
- Full-width search input.
- Readable weather metrics.
- Horizontally scrollable forecast cards if necessary.
- No horizontal page overflow.

## PROJECT STRUCTURE

Organize the project into a maintainable structure:

weather-telemetry-app/
│
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── api.js
│   ├── weather.js
│   └── app.js
├── assets/
│   └── icons/
├── .gitignore
├── .env.example
└── README.md

For a static frontend application, explain that environment variables are not automatically protected in browser code. Provide a secure deployment option using a backend API proxy or serverless function if credentials must remain private.

Ensure the application can be run locally using a development server.

## JAVASCRIPT ARCHITECTURE

Separate responsibilities:

config.js:
- API configuration.
- Units and application constants.

api.js:
- Asynchronous Fetch API functions.
- Current weather requests.
- Five-day forecast requests.
- HTTP status validation.
- API error handling.

weather.js:
- Weather data processing.
- Forecast grouping.
- Temperature calculations.
- Dynamic weather theme selection.
- Weather icon mapping.

app.js:
- DOM manipulation.
- Search event listeners.
- Loading states.
- Error messages.
- Rendering current weather.
- Rendering forecast cards.

Use async/await, try/catch, reusable functions, and descriptive variable names.

Use Promise.all() where appropriate to retrieve current weather and forecast data efficiently.

Prevent race conditions caused by multiple searches by disabling submissions or using request cancellation with AbortController.

# 5. TESTING AND QUALITY ASSURANCE

Test the application against the following scenarios:

1. Search for Johannesburg.
2. Search for London.
3. Search for Tokyo.
4. Search for New York.
5. Search for a nonexistent city.
6. Submit an empty search.
7. Simulate a network failure.
8. Test an invalid API key.
9. Test the application on mobile screen dimensions.
10. Verify that weather themes update correctly.
11. Verify that the five-day forecast displays distinct calendar days.
12. Confirm that no API keys are exposed in the public repository.

Ensure all essential features work before declaring the project complete.

# 6. DELIVERABLES

Provide:

1. Complete functional source code for every project file.
2. A polished, responsive weather dashboard.
3. Working global city search.
4. Real-time weather information.
5. Dynamic weather icons and backgrounds.
6. Five-day forecast.
7. Loading indicators and robust error handling.
8. API configuration instructions.
9. Comprehensive README.md.
10. Installation and local development instructions.
11. API documentation and architecture explanation.
12. GitHub deployment instructions.
13. Production deployment guidance.

## README REQUIREMENTS

Include:

- Project overview.
- Features.
- Technologies used.
- Screenshots section.
- Project structure.
- API registration instructions.
- API configuration.
- Local installation instructions.
- How to run the application.
- API endpoints.
- Error-handling explanation.
- Architecture overview.
- Deployment instructions.

# 7. FINAL ACCEPTANCE CRITERIA

The project is only complete when:

- A user can search for global cities.
- Real weather data is successfully retrieved.
- Weather conditions and icons update dynamically.
- Current weather metrics display correctly.
- Five forecast days are displayed.
- Invalid searches are handled gracefully.
- Loading states function correctly.
- Network and API errors are handled.
- The interface works across desktop, tablet, and mobile.
- The source code is organized and documented.
- API credentials are not exposed in the public GitHub repository.

# FINAL INSTRUCTION

Do not provide a superficial mockup or a static demonstration.

Build a genuinely functional application with real API integration.

Generate the complete project source code, explain the purpose of each file, and provide clear instructions for configuring the API key and running the application.

Prioritize functionality first, followed by visual refinement and production readiness.

If a feature cannot be implemented or verified, explicitly explain the limitation rather than claiming it works.

The final result must be suitable for a professional internship portfolio and public GitHub submission.