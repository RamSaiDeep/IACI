"""find_place: turn what the visitor typed into exactly one place in the index, or say why not.

Order of lookups:
  1. Our own names and alias list (data.resolve): districts, states, countries, old names
     ("Bombay", "Gurgaon"), short forms ("Vizag", "Noida"). Instant, offline.
  2. Bharatlas (India only), when step 1 finds nothing certain: city wards, sub-districts, blocks,
     villages and PIN codes ("Whitefield", "Secunderabad", "500032"). Each hit has coordinates, which
     are tested against OUR district boundaries (geo.district_at), so new districts work too. If a
     point falls outside every boundary, the LGD code table is used, then the nearest district.
  3. Nothing found: a plain message, with any near-miss spellings from step 1 as options.

The model only passes the text. Whether it is a country, state, district or locality is decided here.
Ambiguous names always come back as options for the visitor; nothing fuzzy is ever picked silently.

Result shape (every status):
    {"status": "found" | "choose" | "not_found" | "lookup_unavailable",
     "place":   {...} | None,      # found: id, name, level, parent, country, coastal
     "how":     "name" | "alias" | "bharatlas" | None,
     "note":    str | None,        # one line to show the visitor, e.g. how a name was mapped
     "options": [{"label", "id"}], # choose / not_found: buttons for the visitor
     "message": str | None}        # choose / not_found / lookup_unavailable: what to tell the visitor
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

import httpx

from .. import bharatlas
from ..data import Place, get_place, resolve
from ..geo import district_at, nearest_district
from ..labels import COUNTRY_INFO

LGD_TABLE = Path(__file__).resolve().parent.parent / "reference" / "lgd_districts.csv"

# What the model may pass as level_hint, mapped to our level names.
LEVEL_HINTS = {"country": "country", "state": "top", "province": "top", "nation": "top",
               "district": "child", "county": "child"}
MAX_OPTIONS = 8


async def find_place(client: httpx.AsyncClient, name: str, country: str | None = None,
                     level_hint: str | None = None, within: str | None = None) -> dict:
    name = (name or "").strip()
    if not name:
        return _result("not_found", message="Which place do you mean? Name a district, state or country.")
    level = LEVEL_HINTS.get((level_hint or "").lower())
    parent = _parent_of(within, country)

    # 1. Our own names and aliases.
    r = resolve(name, country)
    matches = [m for m in r["matches"] if _fits(m.place, level, parent)]
    if level and not matches:  # the hint is only a preference: "Kent" with "state" should still find the county
        level = None
        matches = [m for m in r["matches"] if _fits(m.place, None, parent)]
    good = [m for m in matches if m.how != "fuzzy"]
    if r["status"] in ("exact", "ambiguous") and good:
        good = _prefer_region_over_namesake(good, level)
        if len(good) == 1:
            m = good[0]
            return _result("found", place=m.place, how="alias" if m.how == "alias" else "name", note=r["note"])
        return _result("choose", options=[_option(m.place) for m in good],
                       message=f'More than one place is called "{name}". Which one do you mean?')

    # 2. Bharatlas, for Indian localities and PIN codes.
    near_misses = [_option(m.place) for m in matches]
    if country not in (None, "india") or level in ("country", "top"):
        return _not_found(name, near_misses)
    try:
        hits = await bharatlas.search(client, name)
    except bharatlas.BharatlasUnavailable:
        if near_misses:
            return _not_found(name, near_misses)
        return _result("lookup_unavailable", message=(
            f'"{name}" is not a district or state name, and the place search (Bharatlas) is not answering right now. '
            "Try the district name instead."))
    found = _districts_for(hits, parent)
    if len(found) == 1:
        pid, hit = next(iter(found.items()))
        place = get_place(pid)
        shown = hit.name.title() if hit.name.isupper() else hit.name
        return _result("found", place=place, how="bharatlas", note=(
            f"{shown} ({hit.kind}) is in {place.name} district, {place.parent_name}. "
            "The index is reported by district (place found via Bharatlas)."))
    if len(found) > MAX_OPTIONS:
        return _result("choose", message=(
            f'"{name}" is the name of places in {len(found)} different districts. Which state is it in?'))
    if found:
        opts = [{"label": f"{h.name}: {get_place(pid).name} district, {get_place(pid).parent_name}", "id": pid}
                for pid, h in found.items()]
        return _result("choose", options=opts, message=f'There are places called "{name}" in several districts. Which one?')

    # 3. Nothing.
    return _not_found(name, near_misses)


def chosen(place_id: str) -> dict | None:
    """The visitor already picked this place from a list of options: return it as found."""
    p = get_place(place_id)
    return _result("found", place=p, how="chosen") if p else None


# ---------------------------------------------------------------- helpers

def _result(status: str, place: Place | None = None, how: str | None = None, note: str | None = None,
            options: list | None = None, message: str | None = None) -> dict:
    ref = {**place.ref(), "coastal": place.coastal} if place else None
    return {"status": status, "place": ref, "how": how, "note": note, "options": (options or [])[:MAX_OPTIONS],
            "message": message}


def _not_found(name: str, near_misses: list) -> dict:
    if near_misses:
        return _result("not_found", options=near_misses, message=f'I couldn\'t find "{name}". Did you mean one of these?')
    return _result("not_found", message=(
        f'I couldn\'t find "{name}" in the index or in Bharatlas\'s list of Indian places. '
        "Try the district name, for example Mumbai or Bengaluru Urban."))


def _option(p: Place) -> dict:
    where = p.parent_name or (COUNTRY_INFO[p.country]["name"] if p.level != "country" else "")
    return {"label": f"{p.name} ({p.level_label.lower()}{', ' + where if where else ''})", "id": p.id}


def _parent_of(within: str | None, country: str | None) -> Place | None:
    """The state/province named in `within`, if it resolves to exactly one."""
    if not within:
        return None
    r = resolve(within, country)
    tops = [m.place for m in r["matches"] if m.place.level == "top" and m.how != "fuzzy"]
    return tops[0] if len(tops) == 1 else None


def _fits(p: Place, level: str | None, parent: Place | None) -> bool:
    return (not level or p.level == level) and (not parent or p.parent_id == parent.id)


def _prefer_region_over_namesake(ms: list, level: str | None) -> list:
    """'Puducherry' is a union territory and also one of its own districts: take the territory unless
    the visitor said "district". Only applies when the district's parent IS that territory."""
    if level or len(ms) != 2:
        return ms
    top = next((m for m in ms if m.place.level == "top"), None)
    child = next((m for m in ms if m.place.level == "child"), None)
    if top and child and child.place.parent_id == top.place.id:
        return [top]
    return ms


@lru_cache(maxsize=1)
def _lgd_codes() -> tuple[dict[int, str], dict[str, str]]:
    """(LGD district code -> place id, Census 2011 district code -> place id)."""
    with LGD_TABLE.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(line for line in f if not line.startswith("#")))
    # Code 0 is a placeholder LGD uses for Mirpur and Muzaffarabad, so it maps to nothing.
    return ({int(r["dist_lgd"]): r["place_id"] for r in rows if int(r["dist_lgd"])},
            {r["dtcode11"]: r["place_id"] for r in rows if r["dtcode11"]})


def _district_of(hit: bharatlas.Hit) -> str | None:
    if pid := district_at(hit.lat, hit.lng):
        return pid
    by_lgd, by_c11 = _lgd_codes()
    if hit.dist_lgd is not None and hit.dist_lgd in by_lgd:
        return by_lgd[hit.dist_lgd]
    if hit.dtcode11 in by_c11:
        return by_c11[hit.dtcode11]
    return nearest_district(hit.lat, hit.lng) if hit.kind == "PIN code" else None


def _districts_for(hits: list, parent: Place | None) -> dict[str, bharatlas.Hit]:
    """One entry per distinct district (first hit kept), limited to `parent` if the visitor named a state."""
    out: dict[str, bharatlas.Hit] = {}
    for h in hits:
        pid = _district_of(h)
        if pid and pid not in out and (not parent or get_place(pid).parent_id == parent.id):
            out[pid] = h
    return out
