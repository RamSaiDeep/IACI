# Ask the Index v3: plan for the Python agent loop

Status: plan, nothing built yet. Replaces the fixed "classify, then fill slots" chain in
`backend/ask_api/pipeline.py` with a tool-using loop. Keeps everything that already works:
place lookup, the calculations, the number check, and the report card on the page.

## 1. Scope

**On the page:** the four starting points stay exactly as they are (Snapshot, Compare,
Ranking, Trend), as agreed with Kasyap. They are the examples and forms visitors see.

**Behind the chat:** the loop can answer every question type in the catalogue (section 4),
including mixed ones like "Is heat increasing in Delhi, and is Mumbai any different?".
Questions outside the climate index get the out-of-scope reply with the four examples.

No Mann-Kendall test or Sen's slope. Trend is a plain straight-line change per decade plus an
"earlier vs recent" average.

## 2. How one question flows

```
question
  │
  ├─ 1. Triage (visitor's model, forced JSON tool call): in scope? which kinds?
  │      → out of scope: the reply with the four examples, stop
  │
  ├─ 2. Loop (visitor's key, max 8 steps)
  │      the model reads the context and the question
  │      → calls a tool → our Python runs it → the result goes back to the model
  │      → repeat until the model calls final_answer, ask_user or out_of_scope
  │
  ├─ 3. Number check (existing grounding.py): every number in the text must come from a tool
  │      result; one rewrite, then strip whatever still doesn't match
  │
  └─ 4. Report card (existing ReportView): text from the model, tables and charts built by our
         code from the tool results; "How this was worked out" lists the tool calls
```

**Who decides what:**

| Decision | Made by |
|---|---|
| Which tools to call, and in what order | The model |
| Copying place names, hazard words and periods out of the question | The model, through typed tool arguments (a fixed JSON format, so no free-form parsing) |
| Whether a name is a country, state, district or locality | Our code (`find_place`) |
| What "flood", "heatwave" or "last monsoon" maps to | Our code (`resolve_hazard`, `resolve_period`) |
| Every number, table and chart | Our code |
| The sentences | The model, checked by the number check |

## 3. Place names: levels, local names, and Bharatlas

### 3.1 State, district or country: decided by code

The model only copies the name as typed ("Delhi", "Whitefield", "500032"). If the question
says "district" or "state", it passes that as `level_hint`. `find_place` then searches every
level in every country and returns the place with its level, parent and coastal flag.

| Typed | Result |
|---|---|
| India, United Kingdom, Nepal | Country |
| Delhi, Rajasthan, Scotland, Bagmati | State, nation or province |
| Hyderabad, Mumbai, Kent | District or county |
| Aurangabad | Two districts (Bihar and Maharashtra) → buttons |
| Puducherry | Both a union territory and its own district → union territory, unless the question says "district"; the answer says which |

Fuzzy matches are never picked automatically.

### 3.2 Local names: three steps

The rule throughout: **answer by the current district name, and say how the name was mapped.**
The visitor is never asked to retype unless nothing can be found.

**Step 1: our own list of alternative names (exists, keep growing it).**
About 100 entries in `labels.py` already handle old and alternative names. Checked: Bombay,
Calcutta, Gurgaon, Allahabad, Benares, Vizag, Ooty and Noida all reach the right district.
It's instant, free, and works offline.

**Step 2: Bharatlas (new).**
Used only when step 1 finds nothing, and only for India. Bharatlas (bharatlas.com) is an open
atlas of India: LGD boundaries from state down to village, city wards and PIN codes. It's free
with no API key.

Its `locate` tool works from coordinates, not names. So the lookup is two hops:

1. **Find the name in Bharatlas's layers:**
   - A 6-digit number is a PIN code: look it up in the PIN-code layer.
   - Anything else: search, in order, city wards (Whitefield, Gachibowli), towns and villages
     (`lgd_villages`), and sub-districts and blocks (`lgd_subdistricts`, `lgd_blocks`). If the
     question names a state, search only within it.
2. **Get the district:**
   - The district comes back as an LGD district code, directly or through `locate` on the
     match's coordinates.
   - A one-time table maps each LGD district code to our district (782 rows, built from
     Bharatlas's `lgd_districts` layer and checked by hand), so the match doesn't depend on
     spelling.

What the visitor sees:

| Bharatlas result | What happens |
|---|---|
| One district | The answer goes ahead with a one-line note: *"Whitefield is in Bengaluru Urban district (found via Bharatlas). The index is reported by district."* |
| Several districts (a village name that occurs in many states) | Buttons with district and state, e.g. "Rampur, Uttar Pradesh" |
| Nothing | Step 3 |

**Step 3: not found.**
*"I couldn't find 'X' in the index or in Bharatlas's list of Indian places. Try the district
name, for example Mumbai or Bengaluru Urban."* The reply includes up to 3 near-miss
suggestions from our own list, as buttons. The model never guesses a district on its own.

**How we call Bharatlas: the REST API (decided).** A few plain `httpx` calls to
`https://bharatlas.com/api/v1` inside our own `find_place`. The MCP server serves the same
data, but it's meant for AI assistants and would add a dependency and a long-lived connection.
The model never talks to Bharatlas directly: it calls our `find_place`, and our code decides
when Bharatlas is needed, which keeps the guardrails in one place.

The LGD code table is built from a dated Bharatlas release (https://w3id.org/bharatlas), and
that release code is recorded in the file, so we can say exactly which boundaries we matched against.

**Later, if the rate limit bites:** Bharatlas also offers whole layers as Parquet downloads.
The PIN-code and city-ward layers could be downloaded once, trimmed to name → district code,
and looked up offline. That means no rate limit, no network call, and nothing sent outside.
The village layer is much bigger, so it would stay on the REST API.

**Limits and care:**
- 120 reads/min and 60 `locate` calls/min per IP. All visitors share the Render server's IP,
  so answers are cached by name (a name→district result doesn't change), and lookups have a
  3-second timeout.
- If Bharatlas is down or rate-limited, we fall back to step 3 with a note that the place
  search is unavailable right now.
- Only the typed place name is sent, with a generic User-Agent. Nothing else about the visitor
  is sent.
- Credit Bharatlas and the LGD source in the report notes when it was used. Use only
  openly licensed layers (`open_only=true`), not the non-commercial NRSC ones.
- Boundaries: our data and LGD should match on current districts (Andhra Pradesh 28,
  Telangana 33). Any code that doesn't map is listed when the table is built, and fixed by hand.

## 4. The question catalogue (what the loop must answer)

| # | Group | Example | Tools |
|---|---|---|---|
| 1 | One place, one period | How was 2024 for Mumbai? | `get_snapshot` |
| 2 | | How bad was the 2023 monsoon in Kerala? | `get_snapshot` |
| 3 | | What was May 2024 like in Delhi? | `get_snapshot` |
| 4 | | Which hazard drove Chennai's 2015 score? | `get_snapshot` |
| 5 | | Was 2024 Bihar's worst year? | `get_snapshot` |
| 6 | | What was Puri's most extreme month ever? | `get_extremes` |
| 7 | | Which month of 2024 was worst in Delhi? | `get_month_profile` |
| 8 | One place over time | Is heat increasing in Delhi? | `get_trend`, `get_series` |
| 9 | | Has rainfall got worse in Assam since 2000? | `get_trend` |
| 10 | | Was 2011–2020 worse than 1991–2000 in Gujarat? | `compare_periods` |
| 11 | | How many months since 2000 was Rajasthan's drought above 2? | `count_exceedances` |
| 12 | | When did Odisha last have an extreme wind month? | `count_exceedances` |
| 13 | Many places | Top 5 Odisha districts for monsoon rainfall in 2024 | `rank_places` |
| 14 | | Which states are warming fastest? | `rank_places` (by change) |
| 15 | | Coastal districts with the highest sea level in 2023 | `rank_places` (coastal only) |
| 16 | | Maharashtra districts above 1.5 for drought in 2022 | `filter_places` |
| 17 | | Districts with both heat and drought above 1 in 2024 | `filter_places` |
| 18 | | How many districts had a record month in 2024? | `filter_places` (record condition) |
| 19 | | Which districts are worse than their own state? | `compare_to_parent` |
| 20 | Comparing places | Chennai vs Kolkata, 2015–2025 | `compare_places` |
| 21 | | Kerala vs Tamil Nadu on rainfall only | `compare_places` |
| 22 | | Is Guntur worse than its neighbours? | `neighbours` |
| 23 | | How do Kerala's districts differ from each other? | `spread_within` |
| 24 | Across countries | Is the UK warming faster than India? | `compare_places` (countries as places) |
| 25 | | Nepal's drought vs Bihar's | `compare_places` |
| 26 | Explaining the index | What is the Actuaries Climate Index? | `explain_index(overview)` |
| 27 | | How is the index calculated? | `explain_index(calculation)` |
| 28 | | What does the drought component measure? | `explain_index(drought)` |
| 29 | | Which datasets are used? What is ERA5-Land? | `explain_index(datasets)` |
| 30 | | How is Nepal's index different from India's? | `explain_index(differences)` |
| 31 | | How is Chennai's index worked out? (coastal, 6 hazards) | `explain_place_method` |
| 32 | | Why is sea level missing for Delhi? Why does Lakshadweep have no index? | `explain_place_method` |
| 33 | | What does a score of 1.5 mean? | `explain_value` |

Every question also uses the step 0 tools (`find_place`, `resolve_hazard`, `resolve_period`) as needed.

**Declined, with a reason:** forecasts, causes ("why was 2024 hot"), insurance losses or
prices, population impact, named real-world events, hazards the index doesn't measure
(earthquakes, landslides), and anything not about climate.

## 5. The tools

Every data tool returns two things: a short JSON summary the model reads, and a `result_id`
for a table or chart our code has already built. The final answer names which `result_id`s to
show, so tables and charts can never contain made-up numbers.

### 5.0 Turning words into exact inputs (code, no model)

| Tool | Purpose | Returns |
|---|---|---|
| `find_place(name, level_hint?, country?, within?)` | Name → one place, using the three steps in 3.2 | `exact` place, or `ambiguous` with buttons, or `not_found` with suggestions; plus how it was matched (`name`, `alias`, `bharatlas`) |
| `resolve_hazard(word)` | "flood" → heavy rainfall, "heatwave" → heat, "cold wave"/"frost" → cold, "cyclone" → strong wind and heavy rainfall, "dry spell" → drought | Hazard id(s) and a note when the match is approximate; `not_measured` for earthquakes and landslides |
| `resolve_period(year?, season?, month?, from?, to?, last_years?, relative?)` | Checks and labels a period: "monsoon 2024", "last 10 years", "this year (so far)" | A clean period and label, or a plain error (before 1991, after the latest month, no monsoon in the UK) |
| `data_coverage(place_id)` | What exists for a place | Hazards measured, date range, whether it has an overall index (Lakshadweep doesn't), coastal or not |

### 5.1 One place, one period

| Tool | Purpose | Returns | Catalogue |
|---|---|---|---|
| `get_snapshot(place, period)` | How one place did in one period | Per hazard: value, rank among all years (1 = highest), a level word, how much it pushed the overall index | 1–5 |
| `get_extremes(place, hazard, unit, top_n)` (new) | Record months or years | The top N highest (or lowest) months or years | 6 |
| `get_month_profile(place, year, hazard?)` (new) | Month by month within one year | 12 values and the worst month | 7 |

### 5.2 One place over time

| Tool | Purpose | Returns | Catalogue |
|---|---|---|---|
| `get_series(place, hazard, season?, from?, to?)` | Year-by-year values (also the line chart) | (year, value) pairs, the highest and lowest years | 8 |
| `get_trend(place, hazard, season?, from?, to?)` | Up or down? | Change per decade, first-10-years vs last-10-years averages, a direction word | 8–9 |
| `compare_periods(place, hazard, period_a, period_b)` (new) | Two periods at one place | The average of each period and the difference | 10 |
| `count_exceedances(place, hazard, op, value, from?, to?)` (new) | How often, and when last | The count of months, the list of years, the most recent month | 11–12 |

### 5.3 Many places

| Tool | Purpose | Returns | Catalogue |
|---|---|---|---|
| `list_places(within?, level?, coastal?)` | The set to look at | Count and places | used by the tools below |
| `rank_places(within?, level?, coastal?, hazard, period, by, order, limit)` | Order by value or by change per decade | Ranked list and bar chart | 13–15 |
| `filter_places(within?, level?, coastal?, conditions, period)` (new) | All places meeting conditions; several conditions must all hold; a condition can be "record month in this period" | Matching places, their values, the count | 16–18 |
| `compare_to_parent(within, hazard, period)` (new) | Districts vs their own state | Districts above their state, by how much | 19 |

### 5.4 Comparing places

| Tool | Purpose | Returns | Catalogue |
|---|---|---|---|
| `compare_places(places 2–4, hazard?, from, to)` | Side by side, any levels, any countries | Averages per hazard, change per decade, 5-year rolling chart, which hazards differ most | 20–21, 24–25 |
| `neighbours(place, period)` | Context | Up to 4 neighbouring places and the parent, with values | 22 |
| `spread_within(within, hazard, period)` (new) | How the districts of a state differ | Highest, lowest, middle, and the districts that stand out | 23 |

### 5.5 Explaining how the index is built

**One source of truth: `ask_api/knowledge/index_knowledge.json` (new).**
It's built once from the three About pages and their FAQs (`app/india/about`, `app/nepal/about`,
`app/uk/about` plus the UK `COUNTRY.notes`), and the general About page. It has a shared part
and per-country parts:

| Shared (all countries) | Per country |
|---|---|
| What the index is and why (physical grounding, actuarial use, comparability, policy) | Index name, version, draft status (UK is a draft) |
| How it's calculated: daily data → monthly extreme counts per grid cell → z-score against the same month in 1991–2020 → averaged into regions → composite | Components: India 6 (sea level on coasts only), Nepal 5 (landlocked, no sea level), UK per its config |
| Grid-cell-first design: computed per ERA5 cell, then averaged to district and state | Reported levels: India country/state/district; Nepal country/province/district/local level; UK nation/county |
| Each hazard: what it measures, its threshold (90th/10th percentile, 5-day rainfall, longest dry run), its dataset | Datasets: ERA5-Land, plus ORAS5 for sea level where it applies |
| Baseline, z-scores, and what the 90th/10th percentile thresholds mean | Formula: India coastal `(T90S + T10S + PS + W + DS + SS) / 6`, inland `/ 5`; Nepal `/ 5` |
| Score bands, the same as the map legend (`lib/indicators.ts`): below −1 below normal … above +3.5 extreme | Country-specific FAQs: why no sea level in Nepal, why Lakshadweep has no index |
| Applications and possible future components | |

Every explain answer is quoted from this file, never improvised by the model. The model
rewords and picks what's relevant, and the number check still applies.

Keeping it in sync: a test fails if the formulas, component lists or score bands in the JSON
differ from `labels.py` and `lib/indicators.ts`. Later, the About pages could read the same
file, so there's only one copy.

**The tools:**

| Tool | Purpose | Returns | Catalogue |
|---|---|---|---|
| `explain_index(topic, country?)` | How the index is built, in general or for one country. Topics: `overview`, `calculation`, `grid`, `baseline`, `percentiles`, `components`, one hazard (`heat`, `cold`, `rainfall`, `wind`, `drought`, `sea_level`), `datasets`, `levels`, `bands`, `applications`, `future`, `differences` (how India, Nepal and the UK differ) | The matching entries from the knowledge file for that country, or for all three when the answer differs and no country is given | 26–30 |
| `explain_place_method(place)` | How one place's index is put together, from its data | Which formula applies and why: coastal (6 hazards), inland (5), Nepal (5, landlocked), or no index (Lakshadweep, with the reason); the hazards measured there; the dataset for each | 31–32 |
| `explain_value(value, country?)` | What a number means | The band from the shared legend ("+1.6 is Elevated"), plus the z-score meaning ("1.6 standard deviations above the 1991–2020 normal for that month") | 33 |

**Which country, when the question doesn't say:**
1. If the question names a place, use that place's country, and `explain_place_method` gives
   the coastal or inland answer for that exact place.
2. Otherwise use the country selected on the page. Where the countries differ (components,
   formula, levels), the answer adds one line on how the other two differ.
3. Only `differences`, or a question like "how do the three indices differ?", gives all
   three side by side.
4. For India, questions about the formula always show both versions, coastal and inland,
   with the reason sea level applies only on coasts.

This avoids an extra "which country?" question in almost every case. `ask_user` is still there
if the model really can't tell.

### 5.6 Finishing the loop

| Tool | Purpose |
|---|---|
| `final_answer(headline, sections, show, followups)` | Ends with a report; `show` lists the `result_id`s to put on the card |
| `ask_user(question, options)` | Ends with one clarifying question and buttons (pick a place, a missing year); the visitor's pick continues the same question |
| `out_of_scope(reason)` | Ends with the out-of-scope reply and the four examples |

With `triage`, that's 25 tools. If the model starts mixing them up, the first merges to make are
`get_extremes` into `count_exceedances`, and `compare_to_parent` into `spread_within`.

## 6. Context the model gets (system prompt)

Short and fixed, so the provider can cache it:

- **The index:** monthly, standardized against 1991–2020, 0 = normal, higher = more extreme.
  The overall index is the average of the hazards.
- **Hazards in plain names:** extreme heat, extreme cold, heavy rainfall, drought, strong
  wind, sea level. Never show codes like `T90S`.
- **Coverage:**
  - India: country, 36 states and union territories, 782 districts.
  - Nepal: provinces, districts, local levels.
  - UK: a draft index.
  - Sea level only on coasts and never in Nepal; some places have no overall index.
- **Dates:** January 1991 to the latest month (filled in at startup); the current year is incomplete.
- **Defaults:** the country selected on the page, used when a question names none.
- **How to work:** resolve places, hazards and periods with the step 0 tools before fetching
  data; prefer one well-chosen tool over many.
- **Rules:** use only numbers from tool results; describe, never explain causes; no forecasts;
  say plainly when something isn't in the data.
- **Output:** finish with `final_answer` (2-sentence headline, short sections, 2–3 follow-ups),
  `ask_user`, or `out_of_scope`.

## 7. Guardrails

| Risk | Guard |
|---|---|
| Off-topic questions | The forced `triage` step first, then `out_of_scope` later in the loop as a second chance |
| In-domain but not answerable (forecasts, causes, prices) | System prompt rules + `out_of_scope` |
| Made-up numbers | Numbers only from tools; the number check with one rewrite, then strip; tables and charts built only by our code |
| Saying something caused an event | System prompt rule + the existing attribution strip in `grounding.py` |
| Wrong place silently used | Fuzzy and multi-district matches always go to buttons; Bharatlas matches are named in the answer; the model never guesses a district |
| Prompt injection ("ignore your rules…") | The question is passed as data; tools only read; output is a fixed JSON shape; the model never gets Bharatlas or web access directly |
| Runaway loops and cost | At most 8 steps and 12 tool calls, question capped at 600 characters, token cap per call, overall timeout |
| Bad tool inputs | Every tool checks its arguments (years in range, known hazards, resolved place ids, 2–4 places) and returns a plain error the model can fix |
| Bharatlas slow, down or rate-limited | 3-second timeout, cache, fallback to "couldn't find" |

**About the gate: decided, the visitor's own model does it.**
The first step of the loop is a forced tool call, `triage`, made by the model the visitor
chose. It must return:

```json
{"in_scope": true, "kinds": ["trend", "compare"], "reason": "asks whether heat is rising in Delhi and how Mumbai compares"}
```

- `in_scope: false` → the out-of-scope reply with the four examples, and the loop stops.
  Nothing else is called.
- `kinds` (snapshot, compare, rank, trend, filter, explain…) is shown in the trace
  ("Checked the question: in scope, a trend and a comparison"), which is good for the demo.
- Forcing it (`tool_choice` set to `triage`) means the reply is always JSON that matches the
  schema, whatever model the visitor picked.
- The model keeps `out_of_scope` as a second chance later in the loop.

Why this beats a separate gate model:

| | Visitor's model does triage (chosen) | Separate gate model on the site key |
|---|---|---|
| Cost to the site | Nothing | Small, but grows with traffic |
| Many visitors at once | Each visitor uses their own key and limits | Everyone shares one account's limits (free: 20/min, 50/day) |
| Moving parts | One model, one key, one adapter | A second provider, key and error path |
| Quality | As good as the model the visitor picked (usually far bigger than a gate model) | Fixed small model |
| Off-topic questions | Cost the visitor one short call on their own key | Stopped before any visitor tokens are used |

Requirement: the visitor's model must support tool calling. The existing "Test key" step checks
this against OpenRouter's model list (`supported_parameters` includes `tools`) and says so
plainly if not ("This model can't use tools. Try …"). This is needed for the loop anyway.

Mammoth-1 and the Vercel AI Gateway are no longer used for the chat. The four forms never used a
gate, because the category is already known.

*Earlier option, kept for reference: a separate gate on OpenRouter, free model first, cheap paid fallback.*
Mammoth-1 allows 5 questions a minute for the whole site and isn't on OpenRouter. The gate moves
to OpenRouter on the site's key: one call that returns a fixed JSON answer
`{"in_scope": true|false, "reason": "..."}` (strict JSON schema, so the reply always parses).

OpenRouter's limits (from its limits page, November 2026):

| Model type | Limit | What it means for us |
|---|---|---|
| Free (`:free`) | 20 requests/min and 50/day per account; 1,000/day once $10 of credits has ever been bought. Extra keys don't add capacity | Every visitor shares one site account, so free alone breaks under parallel use |
| Paid | No platform request cap; providers' own limits apply and OpenRouter reroutes around them | Scales with visitors |

So the gate uses OpenRouter's `models` fallback list: try the free model, and if it is
rate-limited or down, OpenRouter retries on the paid one automatically in the same request.

| Order | Model | Price per million tokens (in / out) | Why |
|---|---|---|---|
| 1 | `liquid/lfm-3-1.7b:free` | free | Small and fast, built for tool calling and strict JSON output |
| 2 (fallback) | `inclusionai/ling-3.0-flash` | $0.021 / $0.063 | Strict JSON output, among the cheapest paid models |

Cost when the fallback is used: about 300 tokens in and 20 out, roughly $0.00001 a question,
or about a cent per 1,000 questions. Both model choices sit in config (`ASK_GATE_MODELS`), so
they can be swapped without code changes. They are checked against the off-topic test set
(build step 6) before switching on.

Notes:
- Liquid's model page says prompts sent to the free version may be kept and used for training.
  Only the visitor's question text reaches the gate, but if that's not acceptable, the paid
  model goes first with `provider.data_collection: "deny"`.
- `require_parameters: true` is set, so OpenRouter only routes to providers that actually
  enforce the JSON schema.
- Considered and not chosen: `openrouter/free`, which picks a random free model, so behaviour
  is less predictable. `typesafe/jev-router` picks a paid model per request, so its price varies;
  it's a router, not a classifier.

## 8. Which model runs the loop

Everything goes through OpenRouter:

- **The gate and the loop:** the visitor's own OpenRouter key. The gate is the loop's forced
  first `triage` step (section 7). The site needs no AI key at all, and the Vercel AI Gateway
  key can be removed from Render once v3 is live.
- **The loop:** OpenRouter gives every model the same
  OpenAI-style tool-calling format, so one adapter covers Claude, Gemini, GPT and the open
  models. The visitor still picks any model their key can use.

**Visitor keys: all three providers stay (decided).** Anthropic, Google Gemini and OpenRouter
all support tool calling, so the key panel keeps all three. That means two adapters: Anthropic's
native tool format, and the OpenAI-style format, which covers both Gemini and OpenRouter.

**OpenRouter: a dropdown of free models that support tools.**
- The list is fetched from OpenRouter's public model list (`/api/v1/models`, no key needed),
  keeping models that are free (prompt and completion price 0) and list `tools` in
  `supported_parameters`. It's cached for a day on our API (`GET /models/free`), because free
  models come and go. If the fetch fails, the built-in list below is used.
- The visitor can still type any other model id (paid models included); the dropdown is a convenience.
- Free models on a visitor's own key are limited to 20 requests a minute and 50 a day on that
  visitor's account (1,000 a day if they have ever bought $10 of credits). That's plenty for
  one person. The panel says so in one line.

Free OpenRouter models with tool calling, as of 26 Nov 2026:

| Model | Context | Strict JSON | Notes |
|---|---|---|---|
| `google/gemma-4-31b-it:free` | 262K | – | **Default.** Well-known, stable (not a preview), solid tool use |
| `google/gemma-4-26b-a4b-it:free` | 262K | – | Faster, a little less capable |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | – | Largest; slower |
| `nvidia/nemotron-3.5-super-vl:free` | 1M | ✓ | Strong all-rounder |
| `nvidia/nemotron-3.5-lightning:free` | 1M | – | **Fallback.** Built for speed |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | – | Small reasoning model |
| `inclusionai/ling-3.2-flash:free` | 1M | ✓ | Can think before answering |
| `baidu/ernie-5.5-flash-preview:free` | 1M | ✓ | Preview, may change |
| `particle-ai/particle-1:free` | 1M | ✓ | Tuned for coding agents |
| `recursive/flint-v1.0:free` | 262K | – | |
| `liquid/lfm-3-1.7b:free` | 256K | ✓ | Very small; likely too small for a 22-tool loop |
| `openrouter/free` | 200K | ✓ | Picks a random free model each time; not recommended, since behaviour varies |

"Strict JSON" isn't needed for tool calls: our code validates every tool's arguments against its
schema and sends errors back for the model to fix. It does make malformed calls rarer.

**Default (decided): `google/gemma-4-31b-it:free`, with `nvidia/nemotron-3.5-lightning:free`
as an automatic fallback.** Requests send OpenRouter's `models` list in that order. If Gemma
is rate-limited or down, OpenRouter retries on Lightning in the same request, and the visitor
sees no error. Both are free, so the fallback never costs anything.

- Why Gemma first: a stable, well-known model that also supports JSON mode, which means fewer
  malformed tool calls.
- Why Lightning second: built for speed with a 1M-token context. It's a different provider
  (NVIDIA), so an outage on one is unlikely to hit both.
- If a visitor picks a model from the dropdown, that model goes first and the fallback stays.
- Build step 6 runs the test set on both. If Lightning does as well and is clearly faster,
  the two swap places.

Both providers in the other two options support tool calling: Anthropic (tool use in the
Messages API) and Gemini (function calling, also through its OpenAI-compatible endpoint).

Current defaults for the other two providers (`writer.py`) both support tools:
`claude-sonnet-5-5` (Anthropic) and `gemini-2.5-flash` (Gemini). The OpenRouter default changes
from the paid `google/gemini-2.5-flash` to the free default above.

The loop itself is plain Python with no framework: roughly 80–100 lines.

## 9. What changes in the code

| File | Change |
|---|---|
| `ask_api/agent.py` (new) | The loop: messages, tool dispatch, step limits, finishing tools |
| `ask_api/tools/` (new) | One module per tool group; tool definitions (name, description, JSON schema) sit next to their functions |
| `ask_api/tools/places.py` (built) | `find_place`: our names and aliases, then Bharatlas, then "not found" |
| `ask_api/tools/resolve.py` (built) | `resolve_hazard`, `resolve_period`, `data_coverage` |
| `ask_api/bharatlas.py` (built) | Bharatlas REST client with cache and timeout |
| `ask_api/geo.py` (built) | Our district boundaries: which district contains a point |
| `ask_api/reference/lgd_districts.csv` (built) | LGD and Census 2011 district codes → our district id, built by `backend/build_lgd_crosswalk.py` |
| `backend/README.md` (built) | Map of every backend file |
| `ask_api/providers.py` (new) | The two tool-calling adapters; key handling and errors shared with `writer.py` |
| `ask_api/pipeline.py` | Free-text questions go gate → agent; the four forms keep their fast direct path |
| `ask_api/categories/*` | `run()` logic moves into tools; `assemble()` reused to build tables and charts |
| `ask_api/stats.py` | Simple per-decade change replaces Mann-Kendall |
| `ask_api/knowledge/index_knowledge.json` (new) | How the index is built: shared and per-country, taken from the About pages and FAQs |
| `ask_api/categories/help.py` | Replaced by the three explain tools; `HELP_TOPICS` in `labels.py` moves into the knowledge file |
| `ask_api/main.py` | New `GET /models/free`: free OpenRouter models with tool calling, cached for a day |
| `frontend/.../KeyPanel.tsx` | OpenRouter shows a dropdown from `/models/free` (default `google/gemma-4-31b-it:free`) plus "other model id"; a one-line note on free-model limits |
| `frontend/src/lib/ask/client.ts` | OpenRouter default model changes to the free default |
| `frontend/.../AskClient.tsx` | No layout change; the progress box shows tool steps ("Looking up Whitefield", "Calculating the heat trend") |

## 10. Build order

1. **Step 0 tools:** `find_place` with Bharatlas (layer ids confirmed from its OpenAPI file),
   the LGD code table, `resolve_hazard`, `resolve_period`, `data_coverage`, all with tests.
2. **Data tools** (5.1–5.4) with unit tests; no model involved.
   **Explain tools** (5.5): build `index_knowledge.json` from the About pages, add the sync
   test, and test the coastal, inland, Nepal and Lakshadweep cases of `explain_place_method`.
3. **`agent.py`** with a fake model in tests: tool calls, step limit, ambiguous place,
   Bharatlas not found, out of scope, number-check repair.
4. **The two provider adapters**, tested once by hand with a real key each.
5. **Wiring** into `pipeline.py` behind `ASK_AGENT=1`, so the current chain stays as a fallback.
6. **A test set of ~45 questions:** all 33 catalogue types, mixed questions, local names
   (Whitefield, Secunderabad, PIN codes), off-topic, and prompt-injection attempts. Run it
   through the loop and check it by hand before switching on the preview.

## 11. Decisions to make before building

1. ~~Bharatlas through REST or MCP?~~ Decided: REST API.
2. ~~Gate model?~~ Decided: the visitor's own model, as a forced `triage` tool call at the start of the loop (section 7).
4. ~~Visitor keys?~~ Decided: Anthropic, Gemini and OpenRouter all stay; OpenRouter gets a dropdown of free tool-calling models, defaulting to `google/gemma-4-31b-it:free` with `nvidia/nemotron-3.5-lightning:free` as automatic fallback (section 8).
3. Trend: show only the change per decade and the earlier vs recent averages, or also a
   "how steady" note such as "rose in 7 of the last 10 years"?
