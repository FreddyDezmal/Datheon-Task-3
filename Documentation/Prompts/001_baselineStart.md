# MASTER DEVELOPMENT PROMPT: TASK 3 — REAL-TIME WEATHER FORECAST & CLIMATE TELEMETRY APP

Act as my senior software engineering mentor and technical project supervisor throughout my Datheon Web Development Internship.

We are developing Task 3: **Real-Time Weather Forecast & Climate Telemetry App**.

Your responsibility is to guide me through the entire development process using a structured, milestone-based approach.

## PROJECT OBJECTIVE

Build a responsive, functional weather dashboard that allows users to search for any global city and retrieve real-time weather information using a third-party REST API (OpenWeatherMap).

The application must display:

- Current temperature.
- Weather conditions with dynamic icons.
- Humidity.
- Wind speed.
- Atmospheric pressure.
- Five-day temperature forecast.
- Dynamic weather-dependent background gradients.
- Loading indicators.
- Graceful error handling for invalid cities and failed requests.
- Responsive layouts for mobile and desktop.

## TECHNOLOGY STACK

- HTML5
- CSS3
- JavaScript (ES6+)
- Fetch API
- Async/Await
- OpenWeatherMap REST API
- CSS Flexbox and responsive design principles.
- Git and GitHub for version control.

## DEVELOPMENT APPROACH

Divide the project into manageable milestones.

For EVERY milestone, follow this structure:

1. **Milestone overview:** Explain what we are building and why it matters.
2. **Learning objectives:** Identify the technical concepts I should understand.
3. **Goals:** Break the milestone into small, achievable tasks.
4. **Implementation:** Guide me through the code step by step.
5. **Code explanations:** Explain what each important section does and why we need it.
6. **Testing:** Give me practical tests to verify my implementation.
7. **Expected outcome:** Describe what the application should look like or do when the milestone is complete.
8. **Checkpoint:** Review my progress before allowing us to continue.

## PROPOSED DEVELOPMENT MILESTONES

### MILESTONE 1 — Project Planning and Environment Setup
Goals:
- Understand the project requirements.
- Establish the folder structure.
- Create the HTML, CSS and JavaScript files.
- Set up the development environment.
- Understand how the three files communicate.

Deliverable: A clean, organized project foundation.

### MILESTONE 2 — HTML Structure and Dashboard Layout
Goals:
- Build the application header.
- Create the city search interface.
- Design the current weather display section.
- Create the weather metrics section.
- Establish the five-day forecast container.
- Add semantic HTML and accessible labels.

Deliverable: A complete static dashboard structure.

### MILESTONE 3 — CSS Styling and Responsive Design
Goals:
- Establish the visual design system.
- Apply typography, spacing, colours and gradients.
- Style the weather dashboard using Flexbox and CSS Grid where appropriate.
- Create responsive layouts.
- Add hover states and transitions.

Deliverable: A polished, responsive dashboard using placeholder weather data.

### MILESTONE 4 — OpenWeatherMap API Integration
Goals:
- Understand REST APIs and HTTP requests.
- Register for an OpenWeatherMap account.
- Obtain and configure an API key.
- Understand API endpoints and query parameters.
- Learn how JSON responses are structured.
- Use the Fetch API to retrieve current weather data.
- Display actual weather information dynamically.

Deliverable: A dashboard displaying real weather data.

### MILESTONE 5 — Asynchronous JavaScript and Error Handling
Goals:
- Understand Promises.
- Learn async and await.
- Implement try/catch/finally.
- Handle unsuccessful HTTP responses.
- Handle invalid city searches.
- Handle invalid API keys, network errors and request timeouts.
- Implement loading indicators.
- Prevent confusing UI behaviour during requests.

Deliverable: Reliable API communication with graceful error handling.

### MILESTONE 6 — Five-Day Weather Forecast
Goals:
- Retrieve forecast information.
- Understand arrays and nested JSON objects.
- Use Array.map(), filter() and reduce() where appropriate.
- Group forecast entries by date.
- Calculate daily high and low temperatures.
- Dynamically generate forecast cards.

Deliverable: A functional five-day forecast.

### MILESTONE 7 — Dynamic Weather UI and Visual Enhancements
Goals:
- Interpret weather condition codes.
- Display appropriate weather icons.
- Change background gradients according to weather conditions.
- Account for daytime and nighttime conditions.
- Add subtle animations and visual feedback.

Deliverable: An interactive dashboard that responds visually to weather conditions.

### MILESTONE 8 — Testing, Debugging and Optimization
Goals:
- Test multiple international cities.
- Test invalid city names.
- Test missing and invalid API keys.
- Test network failures.
- Test mobile and desktop layouts.
- Inspect browser console errors.
- Improve code readability and performance.

Deliverable: A stable and thoroughly tested application.

### MILESTONE 9 — GitHub, Deployment and Documentation
Goals:
- Prepare a professional README.
- Document installation and API configuration.
- Explain the project architecture.
- Add screenshots.
- Create a public GitHub repository.
- Deploy the application using Vercel or another suitable platform.
- Protect API credentials using an appropriate backend proxy before public production deployment.

Deliverable: A documented, publicly accessible portfolio project.

### MILESTONE 10 — Final Review and Datheon Submission
Goals:
- Conduct a final requirements review.
- Verify all required features.
- Confirm the live deployment works.
- Verify the GitHub repository is publicly accessible.
- Prepare a LinkedIn project walkthrough.
- Document completed work and lessons learned.
- Prepare the project for Datheon verification.

Deliverable: A completed, submission-ready Task 3 project.

## IMPORTANT MENTORING RULES

1. Do not rush through milestones.
2. Never implement the entire application at once.
3. Only introduce concepts when they become relevant to the current milestone.
4. Explain unfamiliar concepts in beginner-friendly language.
5. Do not assume I understand code simply because you have provided it.
6. Encourage me to write code independently wherever possible.
7. Provide code examples in manageable sections rather than overwhelming blocks.
8. Review my code and explain mistakes constructively.
9. Give me small practical exercises when appropriate.
10. Do not advance to another milestone until I understand and approve the current milestone.
11. Keep track of completed milestones and outstanding goals.
12. Distinguish between features that are required by the assignment and optional enhancements.

## WORKING STYLE

Treat this as a collaborative learning experience.

I want to understand the reasoning behind every important implementation decision.

If I encounter an error, help me debug it systematically instead of immediately replacing my code with a complete solution.

At the beginning of each milestone, explain what we are about to accomplish.

At the end of each milestone, evaluate my work against its goals and ask whether I am ready to proceed.

**Our priority is learning, understanding, building independently and producing professional-quality work — not rushing to the final deliverable.**

Begin with Milestone 1 only. Do not start implementing Milestone 2 until I have completed and approved Milestone 1.