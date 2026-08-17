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

Rounding is not purely subtractive, so this script also repairs what it can
break. Slivers a few metres across — offshore rocks, boundary anomalies between
neighbouring states — have a ring area near the rounding grid itself, so
snapping their vertices can collapse the ring or reverse its winding. d3-geo
reads a reversed exterior ring as the complement of that ring, i.e. a polygon
covering the whole globe, at which point geoPath().fitSize() scales the world
into the viewBox and India lands as a speck a few pixels wide. Every ring is
therefore cleaned and re-wound *after* rounding, never before.

Rewrites every file in place and is safe to re-run: rounding an already-rounded
coordinate is a no-op, and re-orienting an already-oriented ring is too.

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


def signed_area(ring):
    """Shoelace area of a ring. Positive is counter-clockwise."""
    total = 0.0
    count = len(ring)
    for index in range(count):
        current, following = ring[index], ring[(index + 1) % count]
        total += current[0] * following[1] - following[0] * current[1]
    return total / 2.0


def clean_ring(ring):
    """Drop repeated vertices; return None if the ring no longer holds area."""
    deduped = [ring[0]]
    for point in ring[1:]:
        if point != deduped[-1]:
            deduped.append(point)

    # Work with the ring open, then re-close it, so the repeated closing vertex
    # never counts toward the three corners a real ring needs.
    if len(deduped) > 1 and deduped[0] == deduped[-1]:
        deduped.pop()

    if len(deduped) < 3 or signed_area(deduped) == 0.0:
        return None

    return deduped + [deduped[0]]


def orient(ring, clockwise):
    return ring[::-1] if (signed_area(ring) < 0) != clockwise else ring


def clean_polygon(rings):
    cleaned = [ring for ring in (clean_ring(r) for r in rings) if ring]
    if not cleaned:
        return None

    # d3-geo works on the sphere and takes the interior to be the side left of
    # the ring, which is the reverse of RFC 7946: exteriors run clockwise here
    # and holes counter-clockwise. Getting this backwards on a single ring
    # inverts that polygon to cover the globe.
    return [orient(cleaned[0], clockwise=True)] + [
        orient(ring, clockwise=False) for ring in cleaned[1:]
    ]


def clean_geometry(geometry):
    """Round, drop degenerate rings, and re-wind for d3-geo. None if nothing survives."""
    coordinates = round_coords(geometry.get("coordinates"))

    if geometry.get("type") == "Polygon":
        rings = clean_polygon(coordinates)
        return {"type": "Polygon", "coordinates": rings} if rings else None

    if geometry.get("type") == "MultiPolygon":
        polygons = [poly for poly in (clean_polygon(p) for p in coordinates) if poly]
        return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None

    return {**geometry, "coordinates": coordinates}


def optimize(path, dry_run=False):
    before = os.path.getsize(path)

    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)

    kept = []
    for feature in data.get("features", []):
        properties = feature.get("properties") or {}
        feature["properties"] = {
            key: value for key, value in properties.items() if key in KEEP_PROPERTIES
        }

        geometry = feature.get("geometry")
        if geometry and "coordinates" in geometry:
            geometry = clean_geometry(geometry)
            if geometry is None:
                # Every ring rounded away to nothing. Never expected for a real
                # state or district, so say so rather than silently shipping a
                # collection with a hole in it.
                name = properties.get("district_name") or properties.get("state_name")
                print(f"  ! dropped {name!r}: no geometry left after rounding")
                continue
            feature["geometry"] = geometry
        kept.append(feature)

    if "features" in data:
        data["features"] = kept

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
