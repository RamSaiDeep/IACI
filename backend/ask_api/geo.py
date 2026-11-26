"""Our own district boundaries: which India district contains a point.

Used by find_place (a Bharatlas result comes with coordinates) and by build_lgd_crosswalk.py.
Plain-Python point-in-polygon with a bounding-box pre-filter, so no geometry library is needed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

from .config import GEO_ROOT
from .data import load_country, norm


@dataclass(frozen=True)
class District:
    place_id: str
    geometry: dict
    bbox: tuple[float, float, float, float]  # min lng, min lat, max lng, max lat
    centre: tuple[float, float]  # lng, lat (rough: mean of the outer ring)


def point_in_ring(x: float, y: float, ring) -> bool:
    """Ray casting: is (x, y) inside this closed ring of [x, y, ...] points?"""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi, xj, yj = ring[i][0], ring[i][1], ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geometry(x: float, y: float, geom: dict) -> bool:
    """Polygon or MultiPolygon; holes are respected."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return any(poly and point_in_ring(x, y, poly[0]) and not any(point_in_ring(x, y, h) for h in poly[1:])
               for poly in polys)


@lru_cache(maxsize=1)
def india_districts() -> tuple[District, ...]:
    """Every India district boundary we can tie to a place in the index data (read once, then cached)."""
    places = [p for p in load_country("india").places.values() if p.level == "child"]
    by_name: dict[str, list] = {}
    for p in places:
        by_name.setdefault(p.norm_name, []).append(p)
    out = []
    for f in sorted((GEO_ROOT / "india" / "district").glob("*.json")):
        for feat in json.loads(f.read_text(encoding="utf-8"))["features"]:
            props, geom = feat.get("properties") or {}, feat.get("geometry")
            cand = by_name.get(norm(props.get("name") or ""))
            if not cand or not geom:
                continue
            parent = norm(props.get("parent") or "")
            place = cand[0] if len(cand) == 1 else next((c for c in cand if norm(c.parent_name or "") == parent), cand[0])
            pts = [pt for poly in (geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]])
                   for pt in poly[0]]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            out.append(District(place.id, geom, (min(xs), min(ys), max(xs), max(ys)),
                                (sum(xs) / len(xs), sum(ys) / len(ys))))
    return tuple(out)


def district_at(lat: float, lng: float) -> str | None:
    """Place id of the India district containing the point, or None (sea, outside India, boundary gap)."""
    for d in india_districts():
        x0, y0, x1, y1 = d.bbox
        if x0 <= lng <= x1 and y0 <= lat <= y1 and point_in_geometry(lng, lat, d.geometry):
            return d.place_id
    return None


def nearest_district(lat: float, lng: float) -> str:
    """Closest district centre: only for points just off a coastline or boundary."""
    return min(india_districts(), key=lambda d: (d.centre[0] - lng) ** 2 + (d.centre[1] - lat) ** 2).place_id
