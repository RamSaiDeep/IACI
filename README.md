# IACI

Frontend for the **Indian Actuaries Climate Index** — a monthly, standardized
measure of climate extremes for India, reported for the country, all 36 states
and union territories, and 782 districts from 1991 to the present.

## Where the data comes from

The numbers are not produced here. They are computed in the
**IACI-data_transformation** repository, which writes zarr stores to its
`derived/spatial/` directory. This repo turns those into the static JSON the
browser fetches.

```
IACI-data_transformation/derived/spatial/    the pipeline's final output (zarr)
  iaci_with_sealevel_{india,state,district}.zarr    <- the stores this repo reads
  iaci_{india,state,district}.zarr                  <- read only for region names
  crosswalks/district_crosswalk.parquet

        |  backend/process_iaci_data.py
        v

frontend/public/data/                        what ships to the browser (JSON)
  india_data.json
  state_data.json
  districts/<state>.json
```

The zarr stores are far past GitHub's file limit and are gitignored, so they
never live in this repo. Only the generated JSON is committed.

## Regenerating the data

`backend/process_iaci_data.py` finds the zarr stores in the first of these that
exists:

1. `$IACI_SPATIAL_DIR`
2. `backend/data/spatial/` (a local copy)
3. `../IACI-data_transformation/derived/spatial/` (a sibling checkout)

```bash
python backend/process_iaci_data.py
```

It validates every state slug against `frontend/public/geojson` on the way out,
so a state whose data and boundary files disagree is reported rather than
silently failing to load in the browser.

`backend/process_boundaries.py` regenerates the geojson boundaries from
shapefiles; it only needs rerunning when the boundaries themselves change.

## The index

Six components, each standardized against the 1991–2020 baseline, and a
composite that averages them:

| | Component | Coverage |
|---|---|---|
| `T90S` | Warm temperature extremes | everywhere |
| `T10S` | Cold temperature extremes | everywhere |
| `PS`   | Extreme precipitation | everywhere |
| `W`    | Extreme wind | everywhere |
| `DS`   | Drought and dry spells | everywhere |
| `SS`   | Sea level anomaly | coastal regions only |

Sea level is the one component that does not cover the whole country: 12 of 36
states and 86 of 782 districts have it. Where it is absent the composite is the
five-component average, per Section 10.3 of the methodology, and `SS` is `null`
in the JSON — never `0`, which the frontend would otherwise draw as a real
reading of "normal".

## Running the frontend

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```
