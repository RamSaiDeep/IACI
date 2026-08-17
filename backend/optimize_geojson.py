"""
Shrink the boundary GeoJSON served to the browser.

The files under frontend/public/geojson are the heaviest thing the app
downloads and, more importantly, the heaviest thing it parses: state_boundary
alone is ~2.5 MB of JSON on the main thread before the first map can paint.
Three things account for nearly all of it, none of which the map can use:

  * full float64 coordinate precision (~17 significant digits), when
    process_boundaries.py has already simplified the geometry to a ~110 m
    tolerance, and one screen pixel on the national map is ~4 km;
  * per-feature attributes the frontend never reads (areas, lengths, object
    ids), carried straight over from the source shapefile;
  * pretty-printing, in the files that have it.

Rewrites every file in place and is safe to re-run: rounding an already-rounded
coordinate is a no-op.

    python backend/optimize_geojson.py            # rewrite the files
    python backend/optimize_geojson.py --dry-run  # just report the savings
"""

import argparse
import json
import os

GEOJSON_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "public", "geojson",
)

# 4 decimal places is ~11 m at India's latitudes. The boundaries are already
# RDP-simplified at epsilon=0.001 degrees (~110 m), so this sits an order of
# magnitude below the detail the geometry actually carries, and well below one
# screen pixel even with a single district filling the frame.
PRECISION = 4

# The only properties any component reads: IndiaMap resolves a feature's label
# from state_name/STATE and district_name. Everything else is dead weight.
KEEP_PROPERTIES = {"state_name", "STATE", "district_name"}


def round_coords(node):
    """Recursively round a GeoJSON coordinate tree in place."""
    if isinstance(node, list):
        # A position is a flat [lon, lat] (possibly with elevation).
        if node and isinstance(node[0], (int, float)):
            return [round(value, PRECISION) for value in node]
        return [round_coords(child) for child in node]
    return node


def optimize(path, dry_run=False):
    before = os.path.getsize(path)

    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)

    for feature in data.get("features", []):
        properties = feature.get("properties") or {}
        feature["properties"] = {
            key: value for key, value in properties.items() if key in KEEP_PROPERTIES
        }

        geometry = feature.get("geometry")
        if geometry and "coordinates" in geometry:
            geometry["coordinates"] = round_coords(geometry["coordinates"])

    # separators drops the space after every comma and colon, which on a file
    # this size is worth more than it sounds.
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)

    if not dry_run:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(payload)

    after = len(payload.encode("utf-8"))
    return before, after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report only")
    args = parser.parse_args()

    targets = []
    for root, _dirs, files in os.walk(GEOJSON_DIR):
        for name in files:
            if name.endswith(".json"):
                targets.append(os.path.join(root, name))

    if not targets:
        raise SystemExit(f"No GeoJSON found under {GEOJSON_DIR}")

    total_before = total_after = 0
    for path in sorted(targets):
        before, after = optimize(path, dry_run=args.dry_run)
        total_before += before
        total_after += after
        saved = 100 * (1 - after / before) if before else 0
        print(f"{os.path.relpath(path, GEOJSON_DIR):55} "
              f"{before/1024:9.1f} KB -> {after/1024:9.1f} KB  ({saved:4.1f}% smaller)")

    saved = 100 * (1 - total_after / total_before) if total_before else 0
    print(f"\n{len(targets)} files: "
          f"{total_before/1024/1024:.1f} MB -> {total_after/1024/1024:.1f} MB "
          f"({saved:.1f}% smaller)")
    if args.dry_run:
        print("Dry run — nothing written.")


if __name__ == "__main__":
    main()
