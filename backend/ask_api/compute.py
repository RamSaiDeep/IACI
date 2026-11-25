"""Shared calculations used by the category functions: windows, ranks, trends, neighbours.

A *window* is a list of (year_offset, month) pairs describing one period inside a year:
a whole year, a season (winter crosses the year boundary) or a single month. The value of a
window for year Y is the mean of the monthly anomalies at (Y + offset, month) when all are present.
"""

from __future__ import annotations

import json
from functools import lru_cache

from .config import GEO_ROOT
from .data import Place, get_place, load_country, norm
from .labels import COMPONENT_LABEL, COUNTRY_INFO, MONTH_NAMES, SEASONS
from .stats import mean, rank_highest, sen_mann_kendall

YEAR = [(0, m) for m in range(1, 13)]


def window(season: str | None = None, month: int | None = None) -> tuple[list[tuple[int, int]], str]:
    if month:
        return [(0, month)], MONTH_NAMES[month - 1]
    if season:
        return SEASONS[season]["months"], SEASONS[season]["label"]
    return YEAR, "Year"


def components_of(p: Place) -> list[str]:
    """Hazards measured at this place (sea level only on coasts; never in Nepal)."""
    return [c for c in COUNTRY_INFO[p.country]["components"] if any(v is not None for v in p.cols.get(c, []))]


def label_of(comp: str, country: str | None = None) -> str:
    if comp == "COMPOSITE":
        return f"Overall index ({COUNTRY_INFO[country]['index_code']})" if country else "Overall index"
    return COMPONENT_LABEL[comp]


def years_of(p: Place) -> list[int]:
    return sorted({ym // 100 for ym in p.periods})


def window_value(p: Place, comp: str, year: int, win) -> float | None:
    vals = [p.value(comp, (year + off) * 100 + m) for off, m in win]
    return None if any(v is None for v in vals) else sum(vals) / len(vals)


def window_series(p: Place, comp: str, win, y0: int | None = None, y1: int | None = None) -> list[tuple[int, float]]:
    out = []
    for y in years_of(p):
        if (y0 and y < y0) or (y1 and y > y1):
            continue
        v = window_value(p, comp, y, win)
        if v is not None:
            out.append((y, v))
    return out


def ranked(p: Place, comp: str, year: int, win) -> dict | None:
    """Value for `year` and its rank among all years. An incomplete year is compared on the months it has."""
    if win == YEAR:
        have = [(0, m) for m in range(1, 13) if p.value(comp, year * 100 + m) is not None]
        if not have:
            return None
        win = have
    v = window_value(p, comp, year, win)
    if v is None:
        return None
    allv = [x for _, x in window_series(p, comp, win)]
    return {"value": v, "rank": rank_highest(v, allv), "n_years": len(allv), "months": len(win)}


def trend(p: Place, comp: str, win=YEAR, y0: int | None = None, y1: int | None = None) -> dict:
    s = window_series(p, comp, win, y0, y1)
    t = sen_mann_kendall(s)
    t.update(first_year=s[0][0] if s else None, last_year=s[-1][0] if s else None, series=s)
    return t


def period_mean(p: Place, comp: str, win, y0: int, y1: int) -> float | None:
    return mean(v for _, v in window_series(p, comp, win, y0, y1))


def contribution(p: Place, comp: str, v: float) -> float:
    from .labels import COMPONENT_SIGN
    return COMPONENT_SIGN[comp] * v / len(components_of(p))


# ---------------------------------------------------------------- neighbours (from boundary GeoJSON)

def _vertices(coords, out):
    if coords and isinstance(coords[0], (int, float)):
        out.append((coords[0], coords[1]))
    else:
        for c in coords or []:
            _vertices(c, out)


@lru_cache(maxsize=None)
def _adjacency(country: str, level: str) -> dict[str, list[str]]:
    info = COUNTRY_INFO[country]
    places = [p for p in load_country(country).places.values() if p.level == level]
    by_name: dict[str, list[Place]] = {}
    for p in places:
        by_name.setdefault(p.norm_name, []).append(p)
    base = GEO_ROOT / country
    files = [base / f"{info['top_id']}.json"] if level == "top" else sorted((base / info["child_id"]).glob("*.json"))
    cell = 0.03
    cells: dict[tuple[int, int], set[str]] = {}
    centroid: dict[str, tuple[float, float]] = {}
    for f in files:
        if not f.exists():
            continue
        for feat in json.loads(f.read_text(encoding="utf-8")).get("features", []):
            props = feat.get("properties") or {}
            cand = by_name.get(norm(props.get("name") or ""))
            if not cand:
                continue
            parent = norm(props.get("parent") or "")
            place = cand[0] if len(cand) == 1 else next(
                (c for c in cand if norm(c.parent_name or "") == parent), cand[0])
            vs: list = []
            _vertices((feat.get("geometry") or {}).get("coordinates"), vs)
            for x, y in vs:
                cells.setdefault((round(x / cell), round(y / cell)), set()).add(place.id)
            if vs:
                centroid[place.id] = (sum(v[0] for v in vs) / len(vs), sum(v[1] for v in vs) / len(vs))
    shared: dict[tuple[str, str], int] = {}
    for ids in cells.values():
        for a in ids:
            for b in ids:
                if a != b:
                    shared[(a, b)] = shared.get((a, b), 0) + 1
    out = {p.id: [] for p in places}
    for (a, b), n in shared.items():
        if n >= 2:
            out[a].append(b)
    for p in places:  # islands / odd geometry: nearest centroids
        if not out[p.id] and p.id in centroid:
            x, y = centroid[p.id]
            near = sorted((k for k in centroid if k != p.id),
                          key=lambda k: (centroid[k][0] - x) ** 2 + (centroid[k][1] - y) ** 2)
            out[p.id] = near[:3]
    return out


def neighbours(p: Place, limit: int = 4) -> list[Place]:
    if p.level == "country":
        return []
    ids = _adjacency(p.country, p.level).get(p.id, [])
    return [q for q in (get_place(i) for i in ids) if q][:limit]
