"""Write FAKE climate data for a country so its pages can be built and checked
before the pipeline has produced real numbers.

    python backend/make_demo_data.py uk

THE NUMBERS ARE RANDOM. They are smoothed noise with the right shape: the
same files, the same keys, the same fields and the same date range as
`process_country_data.py` writes. That lets you build and click through the
pages while the real index is still being computed.

It marks the country `"demo": true` in `countries.json`, and the country's
pages show a "demo data" banner while that flag is set. Running
`process_country_data.py <country>` replaces the files and the manifest entry
with real data and no flag, so the banner goes away by itself.

NEVER DEPLOY A COUNTRY WHILE ITS DATA IS DEMO DATA.

Region names are read from the country's GeoJSON (run
`process_country_boundaries.py <country>` first), so the fake data and the map
always agree. Works for any country declared in `countries.py`.

SEA LEVEL (SS). If the country's fields include SS, only regions that touch
the coast get a value; inland regions get null, exactly as the real data
does. "Touches the coast" is worked out from the boundary shapes: a region is
coastal if it reaches the outline of the whole country. This is only for the
demo. In the real data the pipeline decides which regions have sea level.
"""

import json
import os
import sys

import numpy as np
from shapely import make_valid
from shapely.geometry import shape as raw_shape
from shapely.ops import unary_union

from countries import COUNTRIES, child_levels

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(os.path.dirname(BACKEND_DIR), "frontend", "public")
FIRST_YEAR, LAST_PERIOD = 1991, 202606


def periods():
    out = []
    for year in range(FIRST_YEAR, LAST_PERIOD // 100 + 1):
        for month in range(1, 13):
            p = year * 100 + month
            if p <= LAST_PERIOD:
                out.append(p)
    return out


def series(rng, fields, n_periods, warming, coastal=True):
    """Smoothed noise per component, a mild warm trend, composite = mean.

    `fields[0]` is the composite. SS is filled only when `coastal`; inland it
    is NaN, and the composite averages whatever components exist.
    """
    comps = np.zeros((n_periods, len(fields) - 1))
    for t in range(1, n_periods):
        comps[t] = 0.6 * comps[t - 1] + rng.normal(0, 0.8, len(fields) - 1)
    comps[:, 0] += np.linspace(-0.3, 0.6, n_periods) * warming  # first component drifts
    if "SS" in fields and not coastal:
        comps[:, fields.index("SS") - 1] = np.nan
    composite = np.nanmean(comps, axis=1, keepdims=True)
    return np.round(np.hstack([composite, comps]), 3)


def rows_of(values, ps):
    """NaN becomes None, which JSON writes as null: never 0."""
    return [[p, *(None if np.isnan(x) else float(x) for x in v)] for p, v in zip(ps, values)]


def write(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))


def shape(geometry):
    """Shapes rounded for the browser can self-intersect; repair before maths."""
    return make_valid(raw_shape(geometry))


def features_in(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["features"]


def names_in(path):
    return [f["properties"]["name"] for f in features_in(path)]


def coastline(top_geojson):
    """The outline of the whole country, from its top-level boundary file.

    The small buffer out and back in closes hairline gaps between neighbouring
    regions, so internal borders do not count as coast.
    """
    land = unary_union([shape(f["geometry"]) for f in features_in(top_geojson)])
    return land.buffer(0.002).buffer(-0.002).boundary


def is_coastal(feature, coast):
    return shape(feature["geometry"]).buffer(0.005).intersects(coast)


def slugify(name):
    slug = "".join(c if c.isalnum() else "_" for c in str(name).lower())
    return "_".join(filter(None, slug.split("_")))


def main(slug):
    country = COUNTRIES[slug]
    fields = country["fields"]
    rng = np.random.default_rng(42)
    ps = periods()
    data_dir = os.path.join(PUBLIC, "data", slug)
    geo_dir = os.path.join(PUBLIC, "geojson", slug)
    levels = country["levels"]

    write(os.path.join(data_dir, "country.json"),
          {"fields": fields, "rows": rows_of(series(rng, fields, len(ps), 1.0), ps)})

    manifest_levels = [{**levels[0], "file": "country.json"}]
    for spec in levels[1:]:
        if spec.get("parent_field"):
            continue
        names = names_in(os.path.join(geo_dir, f"{spec['id']}.json"))
        regions = {n.upper(): rows_of(series(rng, fields, len(ps), 1.0), ps) for n in names}
        write(os.path.join(data_dir, f"{spec['id']}.json"), {"fields": fields, "regions": regions})
        manifest_levels.append({k: v for k, v in spec.items() if not k.startswith("layer")}
                               | {"file": f"{spec['id']}.json"})
        print(f"  {spec['id']:10s} {len(regions)} regions")

    top_spec = next(l for l in levels[1:] if not l.get("parent_field"))
    coast = coastline(os.path.join(geo_dir, f"{top_spec['id']}.json")) if "SS" in fields else None

    for spec in child_levels(country):
        folder = os.path.join(geo_dir, spec["id"])
        count = coastal_count = 0
        for stem in sorted(os.listdir(folder)):
            regions = {}
            for feature in features_in(os.path.join(folder, stem)):
                coastal = coast is None or is_coastal(feature, coast)
                coastal_count += coastal
                regions[feature["properties"]["name"].upper()] = rows_of(
                    series(rng, fields, len(ps), rng.uniform(0.5, 1.5), coastal), ps)
            write(os.path.join(data_dir, spec["id"], stem), {"fields": fields, "regions": regions})
            count += len(regions)
        manifest_levels.append({k: v for k, v in spec.items() if not k.startswith("layer")}
                               | {"dir": spec["id"]})
        note = f" ({coastal_count} coastal, {count - coastal_count} inland)" if coast else ""
        print(f"  {spec['id']:10s} {count} regions{note}")

    manifest_path = os.path.join(PUBLIC, "data", "countries.json")
    manifest = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as fh:
            manifest = json.load(fh)
    manifest[slug] = {
        "slug": slug,
        "name": country["name"],
        "indexCode": country["index_code"],
        "indexName": country["index_name"],
        "fields": fields,
        "levels": manifest_levels,
        "geojson": country["geojson"],
        "periods": {"first": ps[0], "last": ps[-1]},
        "demo": True,
    }
    write(manifest_path, manifest)
    print(f"DEMO data written for {country['name']} -> {data_dir}")
    print("Replace it with real data before deploying:  python backend/process_country_data.py", slug)


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COUNTRIES:
        raise SystemExit(f"usage: python backend/make_demo_data.py <{'|'.join(COUNTRIES)}>")
    main(sys.argv[1])
