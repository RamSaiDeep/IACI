# Decision log

One line each: decision — why — how to reverse.

## Data / tools
- Tools read `frontend/public/data/**` with `fs` on the server — it is the only data store; no DB — swap `lib/ask/data.ts`.
- Place id = `country/level/PARENT/NAME` (upper-case keys) — district names repeat across states (e.g. duplicates in India) — change `makePlace`.
- Nepal local levels (777) are not included — keyed by id, heavy, ambiguous names; districts are the finest level — add in `loadCountry`.
- Annual value = mean of the 12 monthly anomalies; only complete years are ranked — the data has no annual series. A partial latest year is ranked against the *same calendar months* of other years and flagged.
- Rank 1 = highest (most positive) value for every component, including extreme cold (higher = more cold extremes) — consistent with the data's sign; the composite subtracts extreme cold.
- Composite formula quoted as `(T90S − T10S + PS + W + DS + SS)/6` — verified numerically on a stored row; the India FAQ page shows `+ T10S`, which does NOT match the data (reported in the morning report).
- Composite is read from the stored column, never recomputed; per-month "driver" = component with the largest signed contribution (sign × value ÷ number of components present).
- Trend = Sen's slope + Mann-Kendall (tie-corrected, normal approximation, alpha 0.05) on annual means; slope reported per decade. Needs ≥ 8 years.
- Seasons: monsoon Jun–Sep, summer Mar–May, post-monsoon Oct–Nov, winter Dec–Feb (Dec of previous year) — IMD-style; edit `labels.ts`.
- Neighbours from boundary GeoJSON: two places are neighbours if they share ≥ 2 vertex cells of 0.03° (≈3 km); nearest 3 centroids as fallback — no adjacency data exists.
- Aliases (Gurgaon→Gurugram etc.) are a small table in `labels.ts`. The source data has a lost character in "BENGAL#RU"; it is displayed/matched as Bengaluru.
- Version strings: India/Nepal "Version 1.0", UK "Draft Version 1.0" — copied from the site's home page.
- Tool results are memoised in memory; finished reports are not cached (every one embeds LLM text and costs the user's key; revisit if needed).
- vitest added as a dev dependency (no test runner existed); `vite-node` (bundled with it) runs the demo script.

## Agent / providers
- LLM does not compute: guided forms run a fixed tool plan in code and the model only fills named prose slots (`finish` tool); free text lets the model plan via tool calls, ending in `build_report` which runs the same fixed plan (`lib/ask/agent.ts`, `reports.ts`).
- Report section structure is fixed in `reports.ts`; tables and charts come from tool results, never from model text.
- Grounding check: every number in model prose must match a tool-result number (rounding and sign tolerant; constants 1991/2020/0.05/5/12/10/1 allowed). One regeneration with feedback, then ungrounded sentences are dropped and the card says so. Attribution sentences ("caused by climate change") are always stripped (`grounding.ts`).
- Anthropic is called over raw `fetch` (no SDK dependency, full control of key handling). Default `claude-sonnet-5-5`; options haiku-5-5, opus-5-5, fable-5-2 (IDs and list prices from the claude-api skill cache dated 2026-11-03; cost shown is an estimate). Sends `output_config.effort: "low"`, no temperature, no forced tool_choice; response blocks (incl. thinking) are passed back unchanged (`providers/anthropic.ts`).
- Key travels in the `x-llm-key` header to `/api/ask`; the route does no logging, error text is built from fixed messages and provider text is scrubbed of the key. Storage: sessionStorage by default, localStorage only with the opt-in box (`lib/ask/client.ts`).
- Mock provider is a scripted rule-based stand-in. Demo mode shows in the UI in dev, or in production only when `NEXT_PUBLIC_ASK_ALLOW_MOCK=1` (the server enforces the same) (`providers/index.ts`).
- Clarification: ambiguous or unknown names return a `clarify` response with options; the chosen id is sent back in `resolved`. Guided forms resolve names server-side too.
- Share link puts the request (never the key) in the URL hash and asks the user to press "Run it", so opening a link never spends a key silently.
- PDF = browser print dialog with a print stylesheet (no PDF library).
- News context (Feature 4) is off; the separate "Reported context" box shows a placeholder only when ticked.
- Map highlight for Feature 3 not built: a ranked bar chart is shown instead.
- `next.config.ts` gets `outputFileTracingIncludes` for `/api/ask` so the JSON ships with the function on Vercel.
- "Ask the Index" nav link added to the global header only (not inside the country portals).
