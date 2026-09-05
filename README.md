# IACI

Frontend for the **Indian Actuaries Climate Index** — a monthly, standardized
measure of climate extremes for India, reported for the country, all 36 states
and union territories, and 782 districts from 1991 to the present.

## Where the data comes from

The numbers are not produced here. They are computed in the
**IACI-data_transformation** repository, which writes zarr stores under
`projects/<country>/derived/`. This repo turns those into the static JSON the
browser fetches.

```
IACI-data_transformation/projects/india/derived/
  composite/regional/                        the values
    iaci_{country,state,district}.zarr         <- the stores this repo reads
  spatial/crosswalks/                        the names
    {country,state,district}_crosswalk.parquet <- region_id -> region_name,
                                                  and district -> STATE_UT

        |  backend/process_iaci_data.py
        v

frontend/public/data/                        what ships to the browser (JSON)
  india_data.json
  state_data.json
  districts/<state>.json
```

Two directories, and they are separate on purpose: `composite/regional` is one
component's output, while `spatial/crosswalks` is the cell-to-region assignment
every component shares. The composite store carries `region_id` and no names,
so identity comes from the crosswalk that produced those regions — looked up by
id, never by position.

**One composite store per level, not two.** The pipeline used to write a
five-component `iaci_*` alongside a parallel `iaci_with_sealevel_*` and leave
the caller to pick. That fork is gone: a single store now applies methodology
Section 10.3 per region — six terms where a region has a sea-level component,
five where it does not — and records which in `IACI_n_components`. Which
equation applies is a property of the region, not a choice made by filename.

The zarr stores are far past GitHub's file limit and are gitignored, so they
never live in this repo. Only the generated JSON is committed.

## Regenerating the data

`backend/process_iaci_data.py` finds the pipeline's `derived` root in the first
of these that exists:

1. `$IACI_DERIVED_DIR`
2. `backend/data/derived/` (a local copy)
3. `../IACI-data_transformation/projects/india/derived/` (a sibling checkout)

```bash
python backend/process_iaci_data.py
```

It needs `zarr`, `pandas` and `numpy`; the pipeline repo's virtualenv already
has them.

Every run is a full regeneration — never a merge — and it also PRUNES: any
`districts/*.json` this run did not write is deleted, so an earlier run's state
spelling cannot leave stale data being served under a name nothing writes any
more. Rewriting a file with identical content produces no git diff, so
`git diff --stat` afterwards is an honest report of what actually moved.

**Run the pipeline first.** This script has no way to tell whether the zarr it
reads is current; pointed at stale stores it will regenerate JSON from them and
report success.

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

Sea level is the one component that does not cover the whole country: 13 of 36
states and 87 of 782 districts have it. Where it is absent the composite is the
five-component average, per Section 10.3 of the methodology, and `SS` is `null`
in the JSON — never `0`, which the frontend would otherwise draw as a real
reading of "normal".

### A region can have a component and no index

**Lakshadweep** carries a sea-level series and a `null` `IACI` for every
period. Its islands are smaller than one cell of the 0.1° land grid, so the
land reanalysis resolves no land there and `T90S`, `T10S`, `PS` and `W` are
genuinely absent — not missing, not zero, simply not measurable at that
resolution. The composite requires all five land components, so no index is
formed, deliberately: a one-component z-score is not comparable to a five- or
six-component mean.

Rows are still emitted, because `SS` is real. **Anything reading `IACI` must
tolerate `null` there.** This is not a new shape — before the pipeline's
drought fix Lakshadweep appeared the same way, carrying a `DS` series that
turned out to be fabricated from unobserved ocean cells. Only the populated
field changed, from an invented `DS` to a measured `SS`.

## Running the frontend

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```
