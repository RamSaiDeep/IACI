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
