# backend/

Two separate things live here:

1. **Data scripts** (top-level `*.py`): turn the pipeline's output into the static JSON and
   GeoJSON the website serves. Run by hand; nothing here runs on a server.
2. **`ask_api/`**: the Ask the Index API (FastAPI), deployed on Render as `iaci-ask-api`.

## 1. Data scripts

| Script | What it does |
|---|---|
| `countries.py` | The one place a country is declared: its levels, file layout and fields |
| `process_country_data.py` | Builds `frontend/public/data/` for every country (successor to `process_iaci_data.py`) |
| `process_iaci_data.py` | The original India-only data builder; see the top-level README |
| `process_country_boundaries.py` | Builds `frontend/public/geojson/` for every country (successor to `process_boundaries.py`) |
| `process_boundaries.py` | The original India-only boundary builder |
| `prepare_uk_boundaries.py` | Turns the raw ONS county file into UK nation and county layers |
| `optimize_geojson.py` | Shrinks the boundary files sent to the browser |
| `check_pipeline_output.py` | Checks a country's pipeline output matches what the site expects |
| `inspect_region.py` | Explains why a region shows "—" on the site |
| `make_demo_data.py` | Writes fake data so a new country's pages can be built before real numbers exist |
| `build_lgd_crosswalk.py` | Builds `ask_api/reference/lgd_districts.csv` from Bharatlas (see below) |

## 2. `ask_api/`: Ask the Index

Run locally: `python -m uvicorn --app-dir backend ask_api.main:app --port 8000`
(or the `ask-api` entry in `.claude/launch.json`). Tests: `python -m pytest backend/ask_api/tests`.

The design and the plan for the agent version are in `docs/ask-the-index/`
(`03-v2-design.md` for what runs today, `04-agent-loop-plan.md` for what is being built).

### What each file does

**The API and the current (v2) question flow**

| File | Role |
|---|---|
| `main.py` | HTTP routes: `/health`, `/test-key`, `/ask` (streams progress lines, then the answer) |
| `pipeline.py` | One question end to end: classify → read slots → calculate → write → check numbers → report |
| `router.py` | Calls the site's AI Gateway: Mammoth-1 (in scope? which type?) and GPT-5 nano (place/period/hazard as JSON) |
| `writer.py` | Calls the visitor's own model (Anthropic, Gemini or OpenRouter) to write the sentences |
| `grounding.py` | The number check: every number in the text must come from the calculated facts |
| `categories/` | The answer types (snapshot, compare, rank, trend, event, help): each calculates its facts and lays out its report |
| `errors.py` | Errors that are safe to show visitors |

**The index data and calculations (shared by everything)**

| File | Role |
|---|---|
| `config.py` | Paths and settings; reads `backend/.env` |
| `labels.py` | Plain names for hazards and countries, seasons, formulas, the alias list for place names |
| `data.py` | Loads the site's JSON into `Place` objects; name lookup (`resolve`) with aliases and fuzzy suggestions |
| `compute.py` | Periods (year/season/month), ranks, trends, neighbours |
| `stats.py` | Small statistics helpers |
| `geo.py` | Our district boundaries: which India district contains a point |

**The agent (v3), being built in steps**

| File | Role |
|---|---|
| `agent/` | The loop. Start with `agent/__init__.py` |
| `agent/model.py` | The neutral message format and the `Model.turn` method each provider adapter implements |
| `agent/prompt.py` | The system prompt (what the model knows, its rules) and the loop-control tools: `triage`, `final_answer`, `ask_user`, `out_of_scope` |
| `agent/providers.py` | Connections to the visitor's model: `AnthropicModel` (native tool use) and `OpenAIStyleModel` (Gemini and OpenRouter; OpenRouter defaults to free Gemma 4 31B with Nemotron 3.5 Lightning as an automatic fallback). `make_model` picks one |
| `agent/loop.py` | `run_agent`: forced triage → tool calls (max 8 turns, 12 calls) → final answer → number check (one rewrite, then strip) → answer, clarify or out-of-scope |
| `tools/` | The 21 functions the agent can call. Start with `tools/__init__.py` (map) and `tools/registry.py` (the list the model sees) |
| `tools/context.py` | What every tool shares: the visitor's country, the store of tables/charts (`result_id`s), `ToolError`, period checking |
| `tools/places.py` | `find_place`: name → one place. Our names first, then Bharatlas, then "not found" |
| `tools/resolve.py` | `resolve_hazard`, `resolve_period`, `data_coverage` |
| `tools/one_place.py` | `get_snapshot`, `get_extremes`, `get_month_profile` |
| `tools/over_time.py` | `get_series`, `get_trend` (straight-line change per decade), `compare_periods`, `count_exceedances` |
| `tools/many_places.py` | `list_places`, `rank_places`, `filter_places`, `compare_to_parent`, `spread_within` |
| `tools/comparing.py` | `compare_places` (any levels and countries), `neighbours` |
| `tools/explain.py` | `explain_index`, `explain_place_method`, `explain_value` |
| `knowledge/index_knowledge.json` | How the index is built, written from the website's About pages; a test keeps it in line with the code |
| `bharatlas.py` | The only file that talks to Bharatlas (bharatlas.com): localities, villages, wards, PIN codes |
| `reference/lgd_districts.csv` | Official LGD district codes → our district ids (built by `build_lgd_crosswalk.py`) |

### How a place name is found (`tools/places.py`)

1. **Our names and aliases** (`data.resolve` + `labels.PLACE_ALIASES`): districts, states,
   countries, old names (Bombay → Mumbai), short forms (Vizag, Noida). Ambiguous names
   (Aurangabad) come back as options for the visitor.
2. **Bharatlas** (India only, when step 1 finds nothing certain): exact-name search of city
   wards, sub-districts, blocks and villages, or a PIN code. Each result's coordinates are
   tested against our own district boundaries (`geo.district_at`), so districts newer than
   Bharatlas's list still work. The LGD code table is the fallback.
3. **Not found**: a plain message, with near-miss spellings as options. Nothing is guessed.

Bharatlas allows 120 reads a minute per IP (all visitors share Render's), so results are
cached by name. If it's down, the visitor is told to use the district name.

### Updating reference data

- **New districts or renamed places in our data:** rerun `python backend/build_lgd_crosswalk.py`.
  It prints any matches it had to guess and our districts that have no LGD code.
- **A place name that should work but doesn't:** add it to `PLACE_ALIASES` in `labels.py`.
- **The About pages change:** update `knowledge/index_knowledge.json` to match.
  `tests/test_tools_data.py` fails if its formulas, hazard lists or score bands drift from the code.
