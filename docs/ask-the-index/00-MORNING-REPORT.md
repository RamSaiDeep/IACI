# Morning report: Ask the Index

Branch `feature/ask-the-index` (local only; nothing pushed, no PR, nothing deployed). Paths are relative to the repo root.

## 1. Status

| Stage | State |
|---|---|
| 1 Explore | Done: `docs/ask-the-index/01-codebase-notes.md` |
| 2 Tool layer | Done: 9 tools, 17 unit tests checked against the raw JSON, demo script |
| 3 Agent loop and key handling | Done: server route, provider interface, mock + real Anthropic provider, grounding check, key UI, error mapping |
| 4 Features 3, 1, 2, 4 | All four done end to end on the mock provider (report cards + tests). **Behaviour with a real model is untested** (no key). |
| 5 Polish | Mostly done: "How this was worked out", follow-ups, copy link, PDF (print dialog), mobile layout checked at 375px, labels/aria. **Not done:** map highlight for Feature 3 (ranked bar chart instead), news context for Feature 4 (off by design), report caching. |

Final checks: `npx vitest run` 38/38 pass; `npx tsc --noEmit` clean; `npm run build` passes; `eslint` reports 2 errors, both **pre-existing** in files I did not touch (`src/app/explore/page.tsx`, `src/components/CustomSelect.tsx`). Also exercised in the browser pane in demo mode: all four features, a clarification, the no-key message, no horizontal scroll on mobile.

## 2. How to try it

```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:3000/ask (also in the header as "Ask the Index").

- **Demo mode (no key):** tick "Demo mode (scripted, no key)" in the key panel (shown in dev). The mock is rule-based, so phrasing far from the example questions gets a clarifying question.
- **Your real key:** untick demo, paste the Anthropic key, click "Test key", pick a model (default Claude Sonnet 5.5), ask. No other config.

```powershell
npm test
npm run typecheck
npm run build
npm run ask:tools
```

## 3. What to test first (with the real key)

1. "How was 2024 for Guntur district?" Year report; overall about +0.55, rank 1 of 35; Sea level row says "Not measured here" (Guntur has no sea-level values in the data).
2. "Which Odisha districts had the worst rainfall extremes in monsoon 2024?" 10-row table out of 30 districts; Sundargarh, Deogarh, Mayurbhanj on top (1.12 / 0.86 / 0.74).
3. "Where is drought getting worse fastest?" Fastest-worsening ranking with change per decade and trend-test result.
4. "Chennai vs Hyderabad, 2015–2025" Side-by-side scorecard, 5-year rolling chart, converging/diverging note.
5. Compare form: Chennai vs Kathmandu. Sea level shows "Not part of the index here" for Kathmandu, plus the cross-country note.
6. "Wayanad, July 2024" (Explain an event). Rank among all Julys; no sentence blames climate change; the news box appears only if ticked and says it is off.
7. Year form with a duplicated district name: a clarifying question with options, not a guess.
8. "Gurgaon" resolves to Gurugram with a note.
9. Wrong key: plain "key was rejected" message with no key text. In the Network tab the key appears only in the request header to `/api/ask`, never in a response.
10. Open "How this was worked out" (tool calls with parameters), then "Copy link" and open it in a private window (it asks you to press "Run it").

## 4. Needs your decision

- **India FAQ formula disagrees with the data.** `frontend/src/app/india/about/FaqSection.tsx` shows `IACI = (T90S + T10S + PS + W + DS + SS)/6`, but `about/page.tsx` and the stored values use `T90S − T10S` (verified numerically on a stored row). I left both pages alone. Which is intended?
- **Version labels:** India and Nepal "Version 1.0", UK "Draft Version 1.0", copied from the home-page cards. Confirm.
- **Data glitch:** district keys `BENGAL#RU (URBAN/RURAL)` (a character lost in the pipeline). Handled in display and matching; fix at the source?
- **Nepal local levels (777)** are excluded; districts are the finest level in Ask.
- **Hosting:** the Ask route reads `public/data` with `fs`; I added `outputFileTracingIncludes` to `next.config.ts`. Not verified on Vercel (no deploys allowed). Decide whether to set `NEXT_PUBLIC_ASK_ALLOW_MOCK=1` in production (default off, so demo mode is hidden there).
- **No rate limiting** on `/api/ask`. It only spends the caller's own key, but it does CPU work; consider Vercel firewall limits.
- **News context** (Feature 4) needs a provider web-search tool and your call on sources and disclaimer; left off.
- **Alternative to the server route (as asked):** the data is static JSON browsers already download, so the browser could call the provider directly: no server hop, and the key never leaves the device. Trade-offs: the provider must allow browser (CORS) access, all tool code and about 17 MB of India district JSON move to the client, and the key would sit in page JavaScript, exposed to any XSS. I built the server route as specified.

## 5. Known issues and risks

- **Never run against a real model.** Prompts, tool schemas and the Anthropic request shape (effort `low`, tools, no forced tool use, thinking blocks echoed back) follow the current docs but are unproven. Likely first failures: the model not calling `finish` (its plain text becomes the headline), or phrasing numbers differently so the grounding check strips sentences (the card says so under "How this was worked out").
- **Grounding is lexical.** It proves each number appears somewhere in the tool results, not that it is attached to the right thing. It ignores sign (0.8 passes for -0.8). The numbers 1, 5, 10, 12 and the years 1991 and 2020 always pass.
- **Annual values** are means of 12 monthly z-scores (no annual series exists). A mean of z-scores is not itself standardized: ranks are valid, magnitudes are not directly comparable with monthly ones.
- **Partial year:** ranked against the same months in other years (2026 has 6 months for India/Nepal) and flagged on the card.
- **Rank 1 = highest** for every hazard including Extreme cold (higher = more cold extremes); the overall index subtracts it.
- **Mann-Kendall** uses the normal approximation with tie correction and needs at least 8 years; it ignores autocorrelation.
- **Neighbours** are inferred from boundary vertices (0.03 degree grid, at least 2 shared cells) with nearest-centroid fallback. Spot-checked for Wayanad and Guntur only.
- **Place matching:** exact, alias, prefix, then edit distance 1-2. A district named like its state (Delhi, Chandigarh) is reported as ambiguous.
- **Cost estimate** uses list prices from the claude-api skill cache (Nov 2026): Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50, Opus 5.5 $4/$20, Fable 5.2 $8/$40 per million tokens. Verify before relying on it.
- Git prints LF/CRLF warnings on commit; harmless.

## 6. Files changed

New:
- `docs/ask-the-index/`: `00-MORNING-REPORT.md`, `01-codebase-notes.md`, `02-decisions.md`, `design/` (your prompt and mockup, copied)
- `frontend/src/lib/ask/`: `labels.ts` (names, facts, aliases), `data.ts` (fs loader, place index, fuzzy match), `period.ts`, `stats.ts` (Sen/Mann-Kendall), `tools.ts` (the 9 tools), `grounding.ts`, `report-types.ts`, `reports.ts` (fixed templates), `agent.ts` (loop), `client.ts` (browser key storage and API), `providers/{types,anthropic,mock,index}.ts`, `__tests__/{tools,agent}.test.ts`
- `frontend/src/app/api/ask/route.ts`, `frontend/src/app/ask/page.tsx`
- `frontend/src/components/ask/{AskClient,KeyPanel,ReportView}.tsx`
- `frontend/scripts/ask-tools-demo.ts`, `frontend/.env.example`

Existing files touched:
- `frontend/package.json`, `package-lock.json`: `vitest` dev dependency; `test`, `typecheck`, `ask:tools` scripts
- `frontend/next.config.ts`: `outputFileTracingIncludes` for `/api/ask`
- `frontend/src/components/Header.tsx`: one nav entry ("Ask the Index") in the global nav

Left untracked in the repo root: your original `IACI_ask_the_index_claude_code_prompt.md` and `ask-page-mockup.html` (copies are committed under `docs/ask-the-index/design/`).

## 7. Suggested next steps

1. Run the checks above with your key and tell me where the real model differs from the mock.
2. Add a map highlight to the ranking card (reuse `RegionMap` and the district GeoJSON).
3. Add rate limiting and a small report cache keyed by request.
4. Decide on news context (provider web search, source list, disclaimer).
5. Optionally add Nepal local levels.
6. Fix the FAQ formula and the `BENGAL#RU` source data.
