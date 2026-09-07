"""Build the static climate JSON the frontend serves, for every country.

The country-independent successor to `process_iaci_data.py`. Everything that
differs between countries is declared in `countries.py`; nothing here branches
on a country name.

    projects/<project>/derived/
        composite/regional/  <prefix>_<level>.zarr    the values
        spatial/crosswalks/  <level>_crosswalk.parquet the names and parentage

            |  this script
            v

    frontend/public/data/
        countries.json                 the manifest the frontend boots from
        <country>/country.json         {"fields": [...], "rows": [[period, ...]]}
        <country>/<level>.json         {"fields": [...], "regions": {NAME: [...]}}
        <country>/<level>/<parent>.json  one file per parent region

OUTPUT SHAPE IS UNCHANGED. Rows are `[YYYYMM, ...values]` ordered per `fields`,
rounded, with `null` for anything unmeasured -- never `0`, which the frontend
would draw as a real reading of "normal". Rows that are entirely null are
dropped, which is how the unobserved tail of the current year disappears
instead of rendering as empty months.

WRITING IS ADDITIVE. This writes under `data/<country>/` and leaves the
existing India files (`india_data.json`, `state_data.json`, `districts/`)
untouched, so the current frontend keeps working while the new layout is
brought up beside it.
"""

import json
import os
import re
import sys

import numpy as np
import pandas as pd
import zarr

from countries import COUNTRIES, child_levels, level_of

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BACKEND_DIR)
OUTPUT_ROOT = os.path.join(REPO_DIR, "frontend", "public", "data")

# z-scores are read to 2 decimals in the UI; 3 keeps headroom and cuts the
# payload by roughly 4x versus full float repr.
PRECISION = 3

# Words that carry no identity when reconciling a parent name written two ways
# ("ANDAMAN AND NICOBAR ISLANDS" vs "ANDAMAN & NICOBAR").
NOISE_WORDS = {"AND", "THE", "ISLANDS", "ISLAND", "OF"}


def derived_dir(country: dict) -> str:
    """The pipeline's `derived` root for one country's project.

    `<COUNTRY>_DERIVED_DIR` overrides, then a local copy, then the pipeline's
    own `IACI_DERIVED_ROOT` -- the same variable its project.toml reads, so
    the two repos agree on where the stores are without either naming a disk.
    """
    project = country["project"]
    root = os.environ.get("IACI_DERIVED_ROOT")
    candidates = [
        os.environ.get(f"{project.upper()}_DERIVED_DIR"),
        os.environ.get("IACI_DERIVED_DIR") if project == "india" else None,
        os.path.join(BACKEND_DIR, "data", "derived", project),
        os.path.join(root, project, "derived") if root else None,
    ]
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    raise SystemExit(
        f"No derived directory found for {country['name']}. Set "
        f"IACI_DERIVED_ROOT to the pipeline's derived root, or point "
        f"{project.upper()}_DERIVED_DIR straight at {project}/derived."
    )


def normalize_name(name) -> str:
    return str(name).strip().upper() if name is not None else ""


def slugify(name: str) -> str:
    """Region name -> file stem. Must match the frontend's slug helper."""
    slug = "".join(c if c.isalnum() else "_" for c in str(name).lower())
    return "_".join(filter(None, slug.split("_")))


def name_tokens(name: str) -> frozenset:
    words = re.findall(r"[A-Z0-9]+", normalize_name(name).replace("&", " AND "))
    return frozenset(w for w in words if w not in NOISE_WORDS)


def safe(value):
    """Round for the wire, or None for NaN -- serialized as null, never 0."""
    return None if np.isnan(value) else round(float(value), PRECISION)


def write_json(path: str, payload: dict) -> int:
    """Minified -- these are wire files, not source."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    return os.path.getsize(path)


def mb(n_bytes: int) -> str:
    return f"{n_bytes / 1e6:.2f} MB"


class Level:
    """One level's store, its region names, and its parentage."""

    def __init__(self, country, spec, roots):
        self.spec = spec
        self.id = spec["id"]
        self.fields = country["fields"]

        store_path = os.path.join(roots["composite"],
                                  f"{country['store_prefix']}_{self.id}.zarr")
        if not os.path.isdir(store_path):
            raise SystemExit(f"missing store {store_path}")
        self.store = zarr.open(store_path)

        crosswalk_path = os.path.join(roots["crosswalks"], f"{self.id}_crosswalk.parquet")
        if not os.path.isfile(crosswalk_path):
            raise SystemExit(f"missing crosswalk {crosswalk_path}")
        self.crosswalk = pd.read_parquet(crosswalk_path)

        missing = [f for f in self.fields if f not in self.store]
        if missing:
            raise SystemExit(
                f"{os.path.basename(store_path)} has no {missing}; "
                f"countries.py declares fields {self.fields}"
            )

        pairs = self.crosswalk[["region_id", "region_name"]].drop_duplicates()
        conflicting = pairs["region_id"].duplicated()
        if conflicting.any():
            raise SystemExit(
                f"{self.id}_crosswalk.parquet names "
                f"{pairs.loc[conflicting, 'region_id'].tolist()[:5]} more than once"
            )
        self.name_of = dict(zip(pairs["region_id"].astype(str), pairs["region_name"]))

        self.region_ids = [str(r) for r in self.store["region_id"][:]]
        unknown = [r for r in self.region_ids if r not in self.name_of]
        if unknown:
            raise SystemExit(
                f"{self.id} store carries region_id(s) absent from its crosswalk: "
                f"{unknown[:5]} -- store and crosswalk are out of step"
            )
        self.names = [normalize_name(self.name_of[r]) for r in self.region_ids]
        self.arrays = [self.store[f][:] for f in self.fields]

    def rows_for(self, index: int, years, months) -> list:
        rows = []
        for y_idx, year in enumerate(years):
            for m_idx, month in enumerate(months):
                values = [safe(a[y_idx, m_idx, index]) for a in self.arrays]
                if any(v is not None for v in values):
                    rows.append([int(year) * 100 + int(month), *values])
        return rows

    def parent_name_of(self) -> dict:
        """region_id -> the raw parent name its crosswalk carries."""
        field = self.spec["parent_field"]
        if field not in self.crosswalk.columns:
            raise SystemExit(
                f"{self.id}_crosswalk.parquet has no {field!r}; countries.py "
                f"declares it as the parent field. It carries "
                f"{sorted(self.crosswalk.columns)}"
            )
        pairs = self.crosswalk[["region_id", field]].drop_duplicates()
        return dict(zip(pairs["region_id"].astype(str), pairs[field]))


def process(slug: str, country: dict) -> dict:
    print(f"\n=== {country['name']} ({country['index_code']}) ===")
    root = derived_dir(country)
    roots = {
        "composite": os.path.join(root, "composite", "regional"),
        "crosswalks": os.path.join(root, "spatial", "crosswalks"),
    }
    for label, path in roots.items():
        if not os.path.isdir(path):
            raise SystemExit(f"{root} has no {label}")
    print(f"reading {root}")

    out_dir = os.path.join(OUTPUT_ROOT, slug)
    levels = {spec["id"]: Level(country, spec, roots) for spec in country["levels"]}

    country_level = levels["country"]
    years = list(country_level.store["year"][:])
    months = list(country_level.store["month"][:])
    fields = country["fields"]

    manifest_levels = []

    # --- the country itself: one series, no region keys ---------------------
    rows = country_level.rows_for(0, years, months)
    size = write_json(os.path.join(out_dir, "country.json"), {"fields": fields, "rows": rows})
    print(f"  country      {len(rows)} periods ({rows[0][0]}-{rows[-1][0]}) -> {mb(size)}")
    manifest_levels.append({**{k: v for k, v in levels["country"].spec.items()},
                            "file": "country.json"})

    # --- levels with no parent split: one file listing every region ---------
    for spec in country["levels"]:
        if spec["id"] == "country" or spec.get("parent_field"):
            continue
        level = levels[spec["id"]]
        regions = {
            name: level.rows_for(i, years, months)
            for i, name in enumerate(level.names)
        }
        size = write_json(os.path.join(out_dir, f"{spec['id']}.json"),
                          {"fields": fields, "regions": regions})
        print(f"  {spec['id']:12s} {len(regions)} regions -> {mb(size)}")
        manifest_levels.append({**spec, "file": f"{spec['id']}.json"})

    # --- levels split one file per parent region ----------------------------
    for spec in child_levels(country):
        level = levels[spec["id"]]
        parent = levels[spec["parent"]]
        canonical = {name_tokens(n): n for n in parent.names}

        parent_raw = level.parent_name_of()
        grouped, unmapped = {}, []
        for i, region_id in enumerate(level.region_ids):
            raw = parent_raw.get(region_id)
            resolved = canonical.get(name_tokens(raw))
            if resolved is None:
                resolved = normalize_name(raw)
                unmapped.append(f"{level.names[i]} ({raw})")
            grouped.setdefault(resolved, {})[level.names[i]] = level.rows_for(i, years, months)

        if unmapped:
            print(f"  ! {len(unmapped)} {spec['id']} rows have no canonical "
                  f"{spec['parent']}: {', '.join(unmapped[:4])}"
                  f"{' ...' if len(unmapped) > 4 else ''}")

        total, written = 0, set()
        sub_dir = os.path.join(out_dir, spec["id"])
        for parent_name, regions in sorted(grouped.items()):
            stem = f"{slugify(parent_name)}.json"
            written.add(stem)
            total += write_json(os.path.join(sub_dir, stem),
                                {"fields": fields, "regions": regions})

        # Drop files an earlier run wrote under a spelling nothing writes now.
        for stale in sorted(set(os.listdir(sub_dir)) - written):
            if stale.endswith(".json"):
                os.remove(os.path.join(sub_dir, stale))
                print(f"  - removed stale {spec['id']}/{stale}")

        print(f"  {spec['id']:12s} {sum(len(v) for v in grouped.values())} regions "
              f"across {len(grouped)} {spec['parent']} files -> {mb(total)}")
        manifest_levels.append({**spec, "dir": spec["id"]})

    return {
        "slug": slug,
        "name": country["name"],
        "indexCode": country["index_code"],
        "indexName": country["index_name"],
        "fields": fields,
        "levels": manifest_levels,
        "geojson": country["geojson"],
        "periods": {"first": int(rows[0][0]), "last": int(rows[-1][0])},
    }


def main(argv):
    requested = argv[1:] or list(COUNTRIES)
    unknown = [c for c in requested if c not in COUNTRIES]
    if unknown:
        raise SystemExit(f"unknown country {unknown}; known: {sorted(COUNTRIES)}")

    manifest = {}
    for slug in requested:
        manifest[slug] = process(slug, COUNTRIES[slug])

    # The manifest is merged, not replaced, so regenerating one country does not
    # delete another's entry.
    manifest_path = os.path.join(OUTPUT_ROOT, "countries.json")
    existing = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as handle:
            existing = json.load(handle)
    existing.update(manifest)
    write_json(manifest_path, existing)
    print(f"\nmanifest -> {manifest_path}  ({', '.join(sorted(existing))})")


if __name__ == "__main__":
    main(sys.argv)
