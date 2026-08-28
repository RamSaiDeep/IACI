"""Build the static climate JSON the frontend serves out of /public/data.

Reads the zarr stores in backend/data/spatial (copied over from the
IACI-data_transformation `derived/spatial` output) and writes one file per
level: India, all states, and one file per state holding its districts.

Output format (v2) is deliberately compact — these files ship to the browser:

    india_data.json          {"fields": [...], "rows":    [[period, ...values]]}
    state_data.json          {"fields": [...], "regions": {NAME: [[period, ...]]}}
    districts/<state>.json   {"fields": [...], "regions": {NAME: [[period, ...]]}}

`period` is the integer YYYYMM, which the frontend keys its lookup map on.
Values are ordered per `fields` and rounded to PRECISION decimals; a missing
observation is null, never 0. Rows whose values are entirely null are dropped.

SEA LEVEL. The values come from the `iaci_with_sealevel_*` stores, not the
plain `iaci_*` ones: those carry the SS component and the composite Section
10.3 defines on top of it — six terms for a region that has a sea-level
component, five for a region that does not. The five land components are
identical between the two families; only IACI moves, and only where SS exists.

SS is NaN — serialized as null, never 0 — everywhere sea level does not reach,
which is most of the country: 12 of 36 states and 86 of 782 districts carry it.
The frontend renders that null as "No Data", not as a reading of zero.

The `iaci_with_sealevel_*` stores carry region_id but no region_name, so the
names (and the district crosswalk join below) come from the matching plain
`iaci_*` store. The two are written region-for-region from the same crosswalk,
which `open_level` re-checks rather than assumes.

District files are named after the *state zarr's* region_name, because that is
what `state_boundary.json` carries and therefore what the frontend slugifies
when it requests a state's districts. The district crosswalk's own STATE_UT
column spells several states differently ("ANDAMAN AND NICOBAR ISLANDS" vs
"ANDAMAN & NICOBAR"), so districts are mapped to states through the shared
cell_id instead. The final step re-checks every slug against public/geojson.
"""

import os
import re
import json
import zarr
import pandas as pd
import numpy as np

# Paths resolve from this file so the script runs from any checkout. The zarr
# stores are gitignored (far past GitHub's file limit), so they are either
# copied into backend/data/spatial or read straight out of a sibling
# IACI-data_transformation checkout. IACI_SPATIAL_DIR overrides both.
backend_dir = os.path.dirname(os.path.abspath(__file__))
repo_dir = os.path.dirname(backend_dir)


def resolve_spatial_dir():
    candidates = [
        os.environ.get("IACI_SPATIAL_DIR"),
        os.path.join(backend_dir, "data", "spatial"),
        os.path.join(os.path.dirname(repo_dir), "IACI-data_transformation",
                     "derived", "spatial"),
    ]
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    raise SystemExit(
        "No spatial zarr directory found. Copy the IACI-data_transformation "
        "derived/spatial output into backend/data/spatial, or point "
        "IACI_SPATIAL_DIR at it."
    )


spatial_dir = resolve_spatial_dir()
crosswalks_dir = os.path.join(spatial_dir, "crosswalks")
frontend_public_dir = os.path.join(repo_dir, "frontend", "public")
output_data_dir = os.path.join(frontend_public_dir, "data")
output_districts_dir = os.path.join(output_data_dir, "districts")

os.makedirs(output_data_dir, exist_ok=True)
os.makedirs(output_districts_dir, exist_ok=True)

print(f"Reading spatial stores from {spatial_dir}")

# Zarr array names, in the order they appear in every emitted row. The frontend
# reads the order off the `fields` key rather than assuming it, but keeping it
# aligned with lib/climate.ts FIELDS keeps the two readable side by side.
FIELDS = ["IACI", "DS", "PS", "SS", "T10S", "T90S", "W"]

SEA_LEVEL_FIELD = "SS"

# z-scores are read to 2 decimals in the UI; 3 keeps headroom and cuts the
# payload by roughly 4x versus full float repr.
PRECISION = 3


def safe(v):
    """Round to PRECISION, or None for NaN — stored as JSON null, never as 0."""
    return None if np.isnan(v) else round(float(v), PRECISION)


def normalize_name(name):
    if not name:
        return ""
    return name.strip().upper()


def slugify(name):
    """State name -> file stem, matching the frontend's slug helper."""
    slug = "".join(c if c.isalnum() else "_" for c in name.lower())
    return "_".join(filter(None, slug.split("_")))


def region_ids_of(group):
    return [str(r) for r in group["region_id"][:]]


def open_level(level):
    """The sea-level composite store for one level, plus its region names.

    Names live in the plain `iaci_<level>` store, so the two are checked to
    describe the same regions in the same order before anything reads across
    them — a silent misalignment would relabel every region's data.
    """
    composite = zarr.open(os.path.join(spatial_dir, f"iaci_with_sealevel_{level}.zarr"))
    named = zarr.open(os.path.join(spatial_dir, f"iaci_{level}.zarr"))

    if region_ids_of(composite) != region_ids_of(named):
        raise SystemExit(
            f"iaci_with_sealevel_{level}.zarr and iaci_{level}.zarr disagree on "
            "region_id order — regenerate them from the same crosswalk."
        )

    return composite, [normalize_name(n) for n in named["region_name"][:]]


def build_rows(arrays, years, months, region_idx):
    """Rows of [YYYYMM, *values] for one region, skipping all-null periods."""
    rows = []
    for y_idx, year in enumerate(years):
        for m_idx, month in enumerate(months):
            values = [safe(a[y_idx, m_idx, region_idx]) for a in arrays]
            if any(v is not None for v in values):
                rows.append([int(year) * 100 + int(month), *values])
    return rows


def load(group):
    """Materialize the component arrays for a zarr group, in FIELDS order."""
    return [group[f][:] for f in FIELDS]


def sea_level_coverage(group):
    """How many of a level's regions carry a sea-level component at all."""
    ss = group[SEA_LEVEL_FIELD][:]
    with_ss = sum(1 for i in range(ss.shape[2]) if np.isfinite(ss[:, :, i]).any())
    return with_ss, ss.shape[2]


def write_json(path, payload):
    """Minified — no indent, no spaces. These are wire files, not source."""
    with open(path, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    return os.path.getsize(path)


def mb(n_bytes):
    return f"{n_bytes / 1e6:.2f} MB"


# ─── 1. India Level ───────────────────────────────────────────────────────────
print("Processing India level data...")
g, _ = open_level("india")

years = list(g["year"][:])
months = list(g["month"][:])

india_rows = build_rows(load(g), years, months, 0)
size = write_json(
    os.path.join(output_data_dir, "india_data.json"),
    {"fields": FIELDS, "rows": india_rows},
)
print(f"  India: {len(india_rows)} periods "
      f"({india_rows[0][0]}–{india_rows[-1][0]}) -> {mb(size)}")


# ─── 2. State Level ───────────────────────────────────────────────────────────
print("Processing State level data...")
sg, state_names = open_level("state")

state_arrays = load(sg)

state_regions = {
    sname: build_rows(state_arrays, years, months, s_idx)
    for s_idx, sname in enumerate(state_names)
}
size = write_json(
    os.path.join(output_data_dir, "state_data.json"),
    {"fields": FIELDS, "regions": state_regions},
)
coastal, total = sea_level_coverage(sg)
print(f"  States: {len(state_regions)} regions, {coastal}/{total} with sea "
      f"level -> {mb(size)}")


# ─── 3. District Level ────────────────────────────────────────────────────────
print("Processing District level data...")
dg, district_names = open_level("district")

district_ids = region_ids_of(dg)
district_arrays = load(dg)

df_cw = pd.read_parquet(os.path.join(crosswalks_dir, "district_crosswalk.parquet"))
df_uniq = df_cw[["region_id", "STATE_UT"]].drop_duplicates()
id_to_state_ut = dict(zip(df_uniq["region_id"].astype(str), df_uniq["STATE_UT"]))

# STATE_UT says which state a district belongs to, but spells a few of them
# differently from the state zarr ("ANDAMAN AND NICOBAR ISLANDS" vs "ANDAMAN &
# NICOBAR"). Matching on significant word tokens reconciles the two 1:1, so
# district files land under the same name the frontend will ask for.
NOISE_WORDS = {"AND", "THE", "ISLANDS", "ISLAND", "OF"}


def name_tokens(name):
    words = re.findall(r"[A-Z0-9]+", normalize_name(name).replace("&", " AND "))
    return frozenset(w for w in words if w not in NOISE_WORDS)


canonical_by_tokens = {name_tokens(s): s for s in state_regions}

grouped = {}
unmapped = []
for d_idx, rid in enumerate(district_ids):
    d_name = district_names[d_idx]
    state_ut = id_to_state_ut.get(rid)
    if not state_ut:
        row_fb = df_cw[df_cw["region_name"] == d_name]
        state_ut = row_fb.iloc[0]["STATE_UT"] if not row_fb.empty else "UNKNOWN"

    state_name = canonical_by_tokens.get(name_tokens(state_ut))
    if state_name is None:
        # Keep the district rather than dropping it; the geojson check below
        # will surface the unresolved name.
        state_name = normalize_name(state_ut)
        unmapped.append(f"{d_name} ({state_ut})")

    grouped.setdefault(state_name, {})[d_name] = build_rows(
        district_arrays, years, months, d_idx
    )

if unmapped:
    print(f"  ! {len(unmapped)} districts have no canonical state: "
          f"{', '.join(unmapped[:5])}{' ...' if len(unmapped) > 5 else ''}")

total_size = 0
written = set()
for state_name, dist_dict in sorted(grouped.items()):
    slug = slugify(state_name)
    written.add(f"{slug}.json")
    size = write_json(
        os.path.join(output_districts_dir, f"{slug}.json"),
        {"fields": FIELDS, "regions": dist_dict},
    )
    total_size += size
    print(f"  {state_name}: {len(dist_dict)} districts -> {mb(size)}")

# Drop files left over from earlier runs that used different state spellings —
# otherwise stale data keeps being served under a name nothing writes anymore.
for stale in sorted(set(os.listdir(output_districts_dir)) - written):
    if stale.endswith(".json"):
        os.remove(os.path.join(output_districts_dir, stale))
        print(f"  - removed stale {stale}")

coastal, total = sea_level_coverage(dg)
print(f"\nDistricts total: {mb(total_size)} — {coastal}/{total} with sea level")


# ─── 4. Validate against the boundary files the frontend actually fetches ─────
print("\nValidating slugs against public/geojson...")
geojson_dir = os.path.join(frontend_public_dir, "geojson")
with open(os.path.join(geojson_dir, "state_boundary.json")) as f:
    boundary = json.load(f)

geo_states = {
    normalize_name(feat["properties"].get("state_name")
                   or feat["properties"].get("STATE") or "")
    for feat in boundary["features"]
}
# The boundary file carries a few "DISPUTED (...)" polygons with no climate data.
geo_states = {s for s in geo_states if s and not s.startswith("DISPUTED")}

problems = []
for state in sorted(geo_states):
    slug = slugify(state)
    if state not in state_regions:
        problems.append(f"{state}: absent from state_data.json")
    if not os.path.exists(os.path.join(output_districts_dir, f"{slug}.json")):
        problems.append(f"{state}: no districts/{slug}.json for the frontend to fetch")
    if not os.path.exists(os.path.join(geojson_dir, "districts", f"{slug}.json")):
        problems.append(f"{state}: no geojson/districts/{slug}.json")

for orphan in sorted(set(state_regions) - geo_states):
    problems.append(f"{orphan}: in state_data.json but not in state_boundary.json")

if problems:
    print(f"  {len(problems)} mismatch(es) — these states will fail to load:")
    for p in problems:
        print(f"    ! {p}")
else:
    print(f"  OK — all {len(geo_states)} boundary states resolve to data files.")

print("\nAll done!")
