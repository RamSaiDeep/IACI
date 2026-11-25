# Ask the Index v2: router + categories + Python backend

Decisions made with Ram Sai on 2026-11-25. Everything below is built on branch `feature/ask-the-index`.

## Flow for one question

```
browser ──POST /ask (NDJSON progress stream)──▶ FastAPI  backend/ask_api
  1. Mammoth-1 (baseten/mammoth-1, site gateway key)   one /v1/decisions call:
       "unrelated?" (yes/no) + category (6-way choice) + help topic
       unrelated ≥ 0.5  → "only climate questions" + 3 example questions
       category < 60 %  → "What kind of answer?" with the top two as buttons
  2. GPT-5 nano (openai/gpt-5-nano, site gateway key)  strict JSON schema per category
  3. Category function (pure Python, every number)
  4. Writer: the visitor's own key + provider + model name
  5. Number check (one rewrite, then strip) + no-attribution filter → report card
```

Guided forms and clarification answers send `category` + `slots` and skip steps 1-2.
Help questions skip 2 and 4 (fixed text), so they work without the visitor's key; everything else needs it.

## The six categories (`backend/ask_api/categories/`)

| Category | Slots (nano fills) | Computes |
|---|---|---|
| snapshot | place, year, season, month | overall + each hazard, rank vs all years; parent region + 4 neighbours; long-run series |
| compare | places[2-4], from/to year, hazard | window means per hazard; trend per place; 5-yr rolling chart; converging/diverging |
| rank | region, hazard, year/season/month or range/last N, value or worsening, order, limit | top-N table + bars |
| trend | place, hazard, season, from/to year | Sen slope/decade, Mann-Kendall p, early vs recent means, chart |
| event | place, month, year | overall + hazards ranked among same months, contributions, top-5 same months, neighbours |
| help | topic (from Mammoth) | fixed text from the methodology page |

## Cost per question (measured)

Mammoth-1 ≈ 300-600 tokens ≈ $0.00003-0.00006; nano ≈ 150-500 tokens ≈ $0.00002-0.00005. The writer runs on the visitor's key.

## Place names

`data.py` matches exact → alias → prefix → whole word inside a longer official name → (only as a suggestion) edit distance 1-2.
The alias table (`labels.py`) covers renamed districts (Coorg→Kodagu, Baroda→Vadodara, Kadapa→Y.S.R., Pokhara→Kaski...);
an alias never hides a real place of the same name (Patan is both Gujarat and, in Nepal, Lalitpur).
Pipeline glitches in the data keys are repaired on load: `<` `>` → a, `#` `@` → u, `|` `\` → i, Nepal `_E`/`_W` → East/West.
A test checks every one of the ~1,100 places finds itself.

## Run locally

```powershell
pip install -r backend/ask_api/requirements.txt
python -m uvicorn --app-dir backend ask_api.main:app --port 8000
python -m pytest backend/ask_api/tests
```
Then `npm run dev` in `frontend` and open /ask. Set `NEXT_PUBLIC_ASK_API_URL` if the API is not on localhost:8000.

## Open points

- **Mammoth-1 is limited to 5 requests per minute for the whole team** (gateway header `X-Ratelimit-Limit-Requests: 5`).
  For now the backend waits out the limit (up to 65 s, twice) and tells the visitor it is waiting. Fallback model or higher limit still to decide before public launch.
- Hosting the FastAPI service (not deployed; no hosting changes made).
- The old TypeScript `/api/ask` route and its tools were removed; the browser now talks only to the Python service.
