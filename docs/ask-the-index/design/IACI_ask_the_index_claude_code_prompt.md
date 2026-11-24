# Prompt for Claude Code: "Ask the Index" agentic layer for climateindex.sssia.org (unattended overnight run)

## 1. Context

You are working on the codebase of **climateindex.sssia.org**, the Actuaries Climate Index platform run by the Sri Sathya Sai Institute of Actuaries (SSSIA). The site appears to be a Next.js app. It has three country portals:

- **India: IACI.** 782 districts and 36 states/UTs, monthly values 1991–2026, Draft 1.0.
- **United Kingdom: UKACI.**
- **Nepal: NACI.**

Each portal has an explore page, an interactive district map, and historical time series.

The index is a standardized measure of climate extremes. It is adapted from the North American Actuaries Climate Index and built on Copernicus ERA5-Land and ORAS5 reanalysis. For India the components are:

| Code | Plain-language name |
|---|---|
| T90 | Extreme heat (warm days) |
| T10 | Extreme cold (cool days); this enters the composite with a negative sign |
| P | Heavy rainfall (Rx5day) |
| D | Drought (consecutive dry days) |
| W | Strong wind |
| SS | Sea level; coastal districts only |

Values are standardized anomalies against a **1991–2020 baseline**. The composite is an equal-weight combination of the components. Read the exact composite formula and the per-country component list from the codebase or the methodology page. Do not assume them.

## 2. The problem we are solving

The index is rich, but today it is only usable by people who already know how to read it. To answer a simple business question like "How unusual was 2024 for Guntur?", "Is Chennai riskier than Hyderabad?" or "Which Odisha districts had the worst monsoon rainfall?", a user has to:

- know the component codes,
- click through maps and charts,
- compare values by eye,
- write up the conclusion themselves.

Most of the people we want to serve won't do that: underwriters, risk managers, regulators, journalists, district officials and students.

Concretely:

- **Insurers, reinsurers and banks** need climate context for annual portfolio reviews, pricing, claims review after catastrophes, and climate-risk disclosure.
- **Location and expansion decisions** need fair, like-for-like comparisons between places.
- **Media and government** need fast, authoritative context when an extreme event happens.

We want an **AI assistant layer ("Ask the Index")**. It turns plain-language questions into consistent, citable answers built **only from the index's own values**. Trust is the product: every number must be traceable, and every answer must say how it was worked out.

## 3. What to build: four features, one assistant

Everything lives behind one assistant with a single question box. The user can type a free question, or pick one of four starting points that each open a short guided form. The assistant works out which feature a question needs.

### Feature 1: Place year-in-review
- **Input:** a district or state, and a year.
- **Output:** a structured report with these sections, in this order:
  1. **Headline:** 1–2 sentences on what defined the year.
  2. **Scorecard:** the composite and each component for the year, as anomalies, each with its rank among all years since 1991.
  3. **Month by month:** the standout months and which component drove each.
  4. **Trend context:** whether the year fits a longer trend or is a one-off. Use a trend test (Sen's slope with Mann-Kendall) on annual values.
  5. **Regional context:** how neighbouring districts and the parent state compared.
  6. **Notes:** baseline, data source, index version, and caveats such as a partial current year.
- **Format:** follow the shape of annual climate statements (WMO State of the Climate, IMD's annual Statement on Climate of India).

### Feature 2: Two-place comparison
- **Input:** two places and a period. Cross-country comparison is allowed (India vs UK vs Nepal).
- **Output:**
  1. **Headline verdict:** the main difference.
  2. **Side-by-side scorecard:** per component.
  3. **Change over time:** both places' trends on one chart, and whether they are converging or diverging.
  4. **Why they differ:** for example coastal vs inland, or monsoon-driven vs heat-driven.
  5. **Notes.**
- **Rules:** compare anomalies on the same baseline, never raw values. Prefer multi-year means (such as 5-year rolling means) over single months, and say that single months are noisy. If a component exists for one place but not the other (sea level is coastal only; Nepal has 5 hazards), say so explicitly. Do not silently drop it.

### Feature 3: Ask-the-index questions (natural-language screening)
- **Input:** a free question, such as "Which Odisha districts had the worst extreme rainfall in monsoon 2024?" or "Where is drought getting worse fastest?"
- **Output:**
  1. **Direct answer:** 1–2 sentences.
  2. **Ranked table:** the values behind the answer.
  3. **Map or chart:** with the result highlighted.
  4. **How this was worked out:** what was measured, for which period, against which baseline.
  5. **Suggested follow-up questions.**
- **Ambiguity:** if a question is ambiguous (an unknown place, a renamed district such as Gurgaon/Gurugram, an unclear period), ask a short clarifying question instead of guessing.
- **Front door:** this feature is the entry point and should hand off naturally to Features 1, 2 and 4.

### Feature 4: Event explainer
- **Input:** a place and a month/year, such as "Wayanad, July 2024".
- **Output:**
  1. **Event summary.**
  2. **What the index recorded:** the relevant component values that month.
  3. **How extreme it was:** the rank against that place's own history, for example "highest July on record since 1991".
  4. **Component breakdown:** which hazards drove the reading.
  5. **Reported context:** an optional short summary of news coverage, in a visually separate, clearly labelled box. It is never mixed with index values.
  6. **Notes:** monthly district averages smooth out very local or short events.
- **Hard rule:** this is context, **not attribution**. Never claim an event was caused by climate change.

### Design reference for the Ask page
A static mockup of the Ask page is at `docs/ask-the-index/design/ask-page-mockup.html`. Open it in a browser and read its source. Build the Ask page to match its structure, in this order:

1. Header with an "Ask the Index" nav item.
2. Large question box with a country switcher (India, UK, Nepal) and an Ask button.
3. Four starting-point cards. Selecting one opens that feature's guided form underneath.
4. "Try asking" example question chips that fill the question box.
5. "How answers work" trust notes.
6. Footer.

Use the site's real components, fonts and colours rather than copying the mockup's CSS. Its teal accent and fonts are placeholders. Add the "Connect your API key" step (Section 4) near the question box. It is not in the mockup.

### Shared output conventions (all features)
- Every answer is rendered as a **report card** with a consistent layout.
- Every card ends with:
  - a **"How this was worked out"** panel listing the tool calls made, with their parameters (places, components, periods, baseline, version);
  - a **follow-up box** that keeps the conversation going ("now just monsoon months", "add Vijayawada");
  - **Copy link** and **Download as PDF**.
- Use plain-language hazard names in the UI ("Extreme heat"), never bare codes.

## 4. Bring-your-own API key

Users supply **their own LLM API key**. Start with Anthropic Claude, but keep the provider behind a small interface so OpenAI or others can be added later. We do not pay for usage, and we must never be custodians of users' keys.

Requirements:

1. **Key entry UI.** On the Ask page there is a clear "Connect your API key" step: a password-type input, a "Test key" button, and a link explaining how to get a key from the provider's console. Show a short plain-language note on what happens to the key.
2. **Storage.** By default keep the key only in the browser, in memory or `sessionStorage`, so it is gone when the tab closes. Offer an opt-in "Remember on this device" (`localStorage`) with a clear warning. Provide a "Forget key" button. **Never persist the key on our servers or in any database.**
3. **Transport.** Pass the key per request over HTTPS, in a request header, to our server route. That route runs the agent loop and calls the provider. It must never write the key to logs, error messages, analytics or traces. Redact it anywhere a request object might be logged. Use a server route, because the tools need server-side data access. If you find the data is fully available client-side and direct browser calls would be simpler, still build the server route, and describe the alternative and its trade-offs in the morning report.
4. **Errors.** Handle and explain these in plain language: invalid key, insufficient credit, rate limits and model errors. Never show the raw key in an error.
5. **Cost awareness.** Show an approximate token or cost estimate per answer, and keep prompts lean.
6. **Model choice.** Default to a current Claude model and make it configurable. Check Anthropic's current docs for model names rather than hardcoding from memory.
7. **No key, no LLM.** Without a key, the page still shows the four starting points and the guided forms. Explain that answers need a key.

## 5. Core architecture principle: the LLM decides, our code computes

This is the most important rule. **The LLM must never produce or estimate a number.** It plans which tools to call, calls them, and writes the narrative around the results.

- **Deterministic tool layer.** Implement a small set of typed tools over the existing index data. Suggested set; adjust to the real data model:
  - `resolve_place(name, country)` returns canonical IDs plus candidates for fuzzy matches and renamed districts.
  - `get_series(place_id, components, start, end, freq)`
  - `get_annual_summary(place_id, year)` returns composite and component anomalies plus ranks.
  - `compare_places(place_ids, components, start, end)`
  - `rank_places(region, component, period, rank_by)`, where `rank_by` is `"most_extreme"` or `"fastest_worsening"`.
  - `trend(place_id, component, start, end)` returns Sen's slope, Mann-Kendall p-value and direction.
  - `neighbours(place_id)`
  - `get_methodology_facts(country)` returns baseline, version, component list and caveats.
- Every tool returns structured JSON with the **values and the exact parameters used**.
- **Grounding check.** After the narrative is written, verify that every number in it appears in a tool result. If any doesn't, regenerate the narrative or remove the number.
- **Report templates.** The section structure of each feature is fixed in code or templates, not left to the model.
- **Caching.** Cache tool results, and finished reports for common requests, where safe.
- **News context (Feature 4).** Optional and off by default in phase 1. If added, use the provider's web-search tool and render the result in the separate "Reported context" box.

## 6. How I want you to work: unattended overnight run

I'm starting this before I sleep and will review it in the morning. **Nobody will be there to answer questions, so do not stop to ask.** When something is unclear:

- take the most reasonable reading;
- record it in the decision log (below);
- keep going.

Never wait for input.

### Safety boundaries (non-negotiable)
- Work only on a new local branch, `feature/ask-the-index`, created from the current default branch. **Do not push, open PRs, merge or deploy.**
- Do not touch production. That means no production database writes, no migrations against remote databases, no changes to hosting or DNS config, and no environment variables on any hosting platform.
- Do not delete or rewrite existing data files or pipeline outputs. Read them only.
- Do not modify existing pages or behaviour beyond adding the new Ask page, a nav link to it, and any small shared changes the feature truly needs. List every touched existing file in the morning report.
- Never commit secrets. Add any config to `.env.example` with placeholder values.
- If a step would need any of the above, skip it, do everything around it, and write it up in the morning report as "needs Ram Sai's decision".

### No real API key will be available
- Build the provider behind an interface.
- Add a **mock provider** with scripted tool-calling responses, so the whole flow (agent loop, tool calls, grounding check, report card rendering) can be run and tested end to end without a key.
- Make the real Anthropic provider ready to use, so that in the morning I can paste my key and test it straight away.

### Stages, in order
Commit at the end of each stage, with a clear message. That way, if the run stops partway, everything finished so far is saved and usable.

1. **Explore.** Map the repo: framework, routing, how and where index data is stored and served (files, DB, API routes), the data schema per country, the place-name and ID handling, and the existing map and chart components. Write this up as `docs/ask-the-index/01-codebase-notes.md`. Include where the tool layer will read data from and any gaps, such as "trends aren't precomputed" or "no neighbour lookup". Then continue without stopping.
2. **Tool layer.** Implement the deterministic tools with unit tests against values read directly from the data. Add a script (for example `scripts/ask-tools-demo`) that calls each tool for a sample place and prints the output.
3. **Agent loop and API key handling.** The server route, provider interface, mock provider, real Anthropic provider, tool calling, the grounding check, key UI and error handling.
4. **Features, in order: 3, then 1, then 2, then 4.** Finish each one end to end, with its report card UI and tests passing on the mock provider, before starting the next. **If time or context runs short, a fully working Feature 3 and Feature 1 is better than four half-built features.**
5. **Polish, if there is time.** The "How this was worked out" panel, follow-ups, copy link, PDF export, mobile layout and accessibility (keyboard navigation, labels, contrast).

### Keep yourself honest
- Run the test suite, the type check, lint and the production build after each stage. Fix what you broke before moving on.
- If something keeps failing after a few genuine attempts, don't loop on it. Note it in the morning report, work around it if possible, and move to the next task.
- Match the site's existing styling and components. Don't introduce a new design system.
- Keep changes scoped. Don't refactor unrelated code.

### Decision log
Keep `docs/ask-the-index/02-decisions.md` updated as you go. Every assumption or judgement call gets one line: what you decided, why, and how to reverse it. Examples: where trend values come from, how districts are matched, which chart library you reused.

### Morning report (last thing you do)
Write `docs/ask-the-index/00-MORNING-REPORT.md` and commit it. It must contain:

1. **Status:** what's done and working, what's partial, what wasn't started, against the stages above.
2. **How to try it:** exact commands to install, run the dev server, run the tests and run the tools demo, plus the URL of the Ask page. Include how to switch from the mock provider to my real key.
3. **What to test first:** 5–10 specific questions to ask, with what a correct answer should look like.
4. **Needs my decision:** anything skipped because of the safety boundaries, plus open questions about data or methodology.
5. **Known issues and risks:** failing tests, shortcuts taken, anything you're unsure is correct, especially anything about numbers or methodology.
6. **Files changed:** new files, and existing files touched, with one line each on why.
7. **Suggested next steps.**

## 7. Acceptance criteria

- A user can paste their key, test it, ask any of the four kinds of question, and get a structured report card.
- Every number in an answer traces to a tool result, visible in "How this was worked out".
- The key never appears in server logs, the database, error messages or the network responses we return.
- Ambiguous places trigger a clarifying question, not a guess.
- Outputs always state the baseline (1991–2020), the index version and the relevant caveats.
- The Event explainer never makes attribution claims, and keeps news separate from index values.
- Without a key, the page loads and explains clearly what's needed.
- The full flow runs end to end on the mock provider, and tests, the type check and the build pass.
- All work is committed on `feature/ask-the-index`, nothing is pushed or deployed, and `00-MORNING-REPORT.md` exists.
