"""Build the GeoJSON the map fetches, for every country and every level.

The country-independent successor to `process_boundaries.py`, which read one
hardcoded Indian shapefile through a hardcoded Lambert Conformal proj string
and wrote one hardcoded output tree. Everything that varied is now declared in
`countries.py`, and this script has no country-specific branch.

    projects/<project>/boundaries/<layer>.shp
            |  this script
            v
    frontend/public/geojson/<country>/<level>.json          the top level
    frontend/public/geojson/<country>/<level>/<parent>.json one file per parent

REPROJECTION IS READ, NOT ASSUMED
---------------------------------
The old script carried India's LCC parameters as a literal string, which is
correct for exactly one shapefile. Every layer ships a `.prj`; geopandas reads
it and reprojects to EPSG:4326 from whatever it actually says. India's Survey
of India layers are Lambert Conformal, Nepal's are already WGS84, and neither
fact appears in this file.

SIMPLIFICATION IS PER LEVEL, NOT GLOBAL
---------------------------------------
A tolerance that suits 36 state outlines is far too coarse for 753 Nepali
municipalities, several of which are only a few kilometres across. Tolerance
scales with how much of the country each polygon covers, so small regions keep
their shape and large ones stop shipping vertices nobody can see.

`clean_geometry` from optimize_geojson does the rounding, degenerate-ring
removal and d3-geo winding, and must stay last: it is order-dependent, and
simplifying after it would undo the winding.
"""

import json
import os
import re
import sys
import warnings

import geopandas as gpd

from countries import COUNTRIES
from optimize_geojson import clean_geometry

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BACKEND_DIR)
OUTPUT_ROOT = os.path.join(REPO_DIR, "frontend", "public", "geojson")

# Degrees. ~0.001 is roughly 110 m -- the resolution a browser map can resolve
# at country zoom. Small polygons get a finer tolerance so they survive it.
COARSE_TOLERANCE = 0.004
FINE_TOLERANCE = 0.0005
# Below this share of the country's area a region is treated as small.
SMALL_AREA_SHARE = 0.002


def boundaries_dir(country: dict) -> str:
    project = country["project"]
    # Boundaries are archive data, not derived output, so they follow
    # IACI_DATA_ROOT -- the bulk-storage half of the pipeline's split.
    root = os.environ.get("IACI_DATA_ROOT")
    candidates = [
        os.environ.get(f"{project.upper()}_BOUNDARIES_DIR"),
        os.path.join(BACKEND_DIR, "data", "boundaries", project),
        os.path.join(root, project, "boundaries") if root else None,
    ]
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    raise SystemExit(
        f"No boundaries directory for {country['name']}. Set IACI_DATA_ROOT "
        f"to the pipeline's data root, or point "
        f"{project.upper()}_BOUNDARIES_DIR straight at {project}/boundaries."
    )


def slugify(name) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def write_json(path: str, payload: dict) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    return os.path.getsize(path)


def load_layer(directory: str, spec: dict) -> gpd.GeoDataFrame:
    path = os.path.join(directory, f"{spec['layer']}.shp")
    if not os.path.isfile(path):
        raise SystemExit(f"missing shapefile {path}")

    frame = gpd.read_file(path).to_crs(epsg=4326)

    for field, prefix in spec.get("layer_exclude_prefix", {}).items():
        if field not in frame.columns:
            raise SystemExit(f"{spec['layer']}.shp has no {field!r} to exclude on")
        keep = ~frame[field].fillna("").astype(str).str.upper().str.startswith(prefix.upper())
        frame = frame.loc[keep]

    name_field = spec["layer_name_field"]
    if name_field not in frame.columns:
        raise SystemExit(
            f"{spec['layer']}.shp has no {name_field!r}; it carries "
            f"{sorted(c for c in frame.columns if c != 'geometry')}"
        )
    frame = frame.loc[frame[name_field].notna()]
    return frame


def simplified_features(frame: gpd.GeoDataFrame, spec: dict, level_key: str) -> list:
    """One cleaned GeoJSON feature per row, tolerance scaled by region size."""
    # Area in square degrees. Only the RATIO between a region and its country
    # is used, to pick a tolerance -- never as a measurement -- so the
    # geographic-CRS distortion geopandas warns about does not matter here.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        areas = frame.geometry.area
        total_area = areas.sum()
    parent_field = spec.get("layer_parent_field")
    features, dropped = [], []

    for row in frame.itertuples(index=False):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            share = row.geometry.area / total_area if total_area else 0
        tolerance = FINE_TOLERANCE if share < SMALL_AREA_SHARE else COARSE_TOLERANCE

        geometry = row.geometry.simplify(tolerance, preserve_topology=True)
        if geometry.is_empty:
            geometry = row.geometry

        cleaned = clean_geometry(json.loads(gpd.GeoSeries([geometry]).to_json())
                                ["features"][0]["geometry"])
        name = str(getattr(row, spec["layer_name_field"])).strip()
        if cleaned is None:
            dropped.append(name)
            continue

        properties = {"name": name, level_key: name}
        if parent_field:
            properties["parent"] = str(getattr(row, parent_field)).strip()
        features.append({"type": "Feature", "properties": properties, "geometry": cleaned})

    if dropped:
        print(f"    ! {len(dropped)} dropped, nothing left after simplification: "
              f"{', '.join(dropped[:4])}")
    return features


def process(slug: str, country: dict) -> None:
    print(f"\n=== {country['name']} ===")
    directory = boundaries_dir(country)
    print(f"reading {directory}")
    out_dir = os.path.join(OUTPUT_ROOT, slug)

    for spec in country["levels"]:
        if "layer" not in spec:
            continue

        frame = load_layer(directory, spec)
        # `name` is what the map reads; the level-named key keeps the files
        # self-describing when opened by hand.
        features = simplified_features(frame, spec, spec["id"])

        if spec.get("layer_parent_field"):
            groups = {}
            for feature in features:
                groups.setdefault(feature["properties"]["parent"], []).append(feature)

            sub_dir = os.path.join(out_dir, spec["id"])
            total, written = 0, set()
            for parent, items in sorted(groups.items()):
                stem = f"{slugify(parent)}.json"
                written.add(stem)
                total += write_json(os.path.join(sub_dir, stem),
                                    {"type": "FeatureCollection", "features": items})

            for stale in sorted(set(os.listdir(sub_dir)) - written):
                if stale.endswith(".json"):
                    os.remove(os.path.join(sub_dir, stale))
                    print(f"    - removed stale {spec['id']}/{stale}")

            print(f"  {spec['id']:9s} {len(features):4d} regions across "
                  f"{len(groups)} {spec['parent']} files -> {total / 1e6:.2f} MB")
        else:
            size = write_json(os.path.join(out_dir, f"{spec['id']}.json"),
                              {"type": "FeatureCollection", "features": features})
            print(f"  {spec['id']:9s} {len(features):4d} regions -> {size / 1e6:.2f} MB")


def main(argv):
    requested = argv[1:] or list(COUNTRIES)
    unknown = [c for c in requested if c not in COUNTRIES]
    if unknown:
        raise SystemExit(f"unknown country {unknown}; known: {sorted(COUNTRIES)}")
    for slug in requested:
        process(slug, COUNTRIES[slug])
    print("\ndone")


if __name__ == "__main__":
    main(sys.argv)
