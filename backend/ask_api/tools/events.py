"""Historical disaster events (floods, cyclones, heatwaves, droughts...) and what the index recorded during them.

    find_events   search events by place, type, years or name
    get_event     one event in full: dates, impacts, affected states (and districts when only 1-2 states)
    event_signal  the index's readings at the affected places in the event's months, for the hazards that
                  match the event type, each compared with the same months in every other year

Data: reference/events.csv + event_places.csv, built by backend/build_events.py from open sources
(GDACS, Nepal's BIPAD portal, the UK Met Office). Event types and the hazards shown for each follow
docs/ask-the-index/06-events-plan.md.
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from ..compute import components_of, label_of, ranked
from ..data import get_place
from ..labels import COMPONENT_LABEL, MONTH_NAMES
from ..stats import rnd, severity, standing
from .context import SCORE, SCORE_NOTE, ToolContext, ToolError, place_arg

REF = Path(__file__).resolve().parent.parent / "reference"

# Which index hazards say something about each event type (plan section 1). The overall index is always added.
EVENT_HAZARDS = {"flood": ["PS"], "landslide": ["PS"], "cyclone_storm": ["W", "PS", "SS"], "coastal_flood": ["SS", "W"],
                 "heatwave": ["T90S"], "cold_wave": ["T10S"], "drought": ["DS"], "wildfire": ["T90S", "DS"]}
TYPE_NAMES = {"flood": "flood", "landslide": "landslide", "cyclone_storm": "cyclone or storm",
              "coastal_flood": "coastal flood", "heatwave": "heatwave", "cold_wave": "cold wave", "drought": "drought",
              "wildfire": "wildfire"}
IMPACTS = ["deaths", "missing", "injured", "people_affected", "families_affected", "damage", "damage_unit"]
MAX_MONTHS = 3  # an event's index reading covers at most its first three months


def _read(name: str) -> list[dict]:
    path = REF / name
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


@lru_cache(maxsize=1)
def load() -> tuple[dict[str, dict], dict[str, list[tuple[str, str]]]]:
    """(event_id -> event row, event_id -> [(place_id, role)])."""
    events = {e["event_id"]: e for e in _read("events.csv")}
    places: dict[str, list[tuple[str, str]]] = {}
    for p in _read("event_places.csv"):
        if get_place(p["place_id"]):
            places.setdefault(p["event_id"], []).append((p["place_id"], p["role"]))
    return events, places


def _event_arg(event_id: str) -> tuple[dict, list[tuple[str, str]]]:
    events, places = load()
    e = events.get(event_id or "")
    if not e:
        raise ToolError(f"Unknown event id {event_id!r}. Call find_events first and use an event_id it returns.")
    return e, places.get(event_id, [])


def _touches(place, ev_places: list[tuple[str, str]], country: str) -> bool:
    """Does the event concern this place? Its own id, a district inside it, its state, or the whole country."""
    ids = {pid for pid, _ in ev_places}
    if place.level == "country":
        return place.country == country
    if place.id in ids or (place.parent_id and place.parent_id in ids):
        return True
    return any((q := get_place(pid)) and q.parent_id == place.id for pid in ids)


def _impacts(e: dict) -> dict:
    return {k: (float(e[k]) if k != "damage_unit" and e.get(k) not in ("", None) else e.get(k))
            for k in IMPACTS if e.get(k) not in ("", None)}


def _states(ev_places) -> list[str]:
    return [get_place(pid).name for pid, role in ev_places if role in ("state", "country")]


# ---------------------------------------------------------------- tools

def find_events(ctx: ToolContext, place_id: str | None = None, type: str | None = None, from_year: int | None = None,
                to_year: int | None = None, name: str | None = None, limit: int = 10) -> dict:
    if not any([place_id, type, from_year, to_year, name]):
        raise ToolError("Give at least one of place_id, type, a year range or name.")
    if type and type not in EVENT_HAZARDS:
        raise ToolError(f"Unknown event type {type!r}. Use one of: {', '.join(EVENT_HAZARDS)}.")
    place = place_arg(place_id) if place_id else None
    words = [w for w in (name or "").lower().replace("cyclone", "").replace("storm", "").split() if len(w) > 2]
    events, places = load()
    hits = []
    for eid, e in events.items():
        ev_places = places.get(eid, [])
        year = int(e["start_date"][:4])
        if (type and e["type"] != type) or (from_year and year < from_year) or (to_year and year > to_year):
            continue
        if place and not _touches(place, ev_places, e["country"]):
            continue
        if words and not all(w in e["name"].lower() for w in words):
            continue
        hits.append(e | {"_states": _states(ev_places)})
    hits.sort(key=lambda e: e["start_date"], reverse=True)
    limit = max(1, min(int(limit or 10), 25))
    shown = [{"event_id": e["event_id"], "name": e["name"], "type": TYPE_NAMES.get(e["type"], e["type"]),
              "start_date": e["start_date"], "end_date": e["end_date"], "country": e["country"],
              "states": e["_states"][:6], "deaths": _impacts(e).get("deaths"), "source": e["source"]} for e in hits[:limit]]
    rid = ctx.table("Disaster events found", ["Event", "Type", "Dates", "States / provinces", "Source"],
                    [[s["name"], s["type"], f"{s['start_date']} to {s['end_date']}", ", ".join(s["states"]) or "—",
                      s["source"]] for s in shown]) if shown else None
    return {"matching": len(hits), "events": shown, "truncated": len(hits) > limit,
            "note": None if hits else "No events in the database match. It covers GDACS floods, cyclones and droughts "
                                      "since 2000, Nepal's BIPAD incidents and some UK named storms.",
            "show": [rid] if rid else []}


def get_event(ctx: ToolContext, event_id: str) -> dict:
    e, ev_places = _event_arg(event_id)
    states = [pid for pid, role in ev_places if role in ("state", "country")]
    districts = [pid for pid, role in ev_places if role == "district"]
    where = []
    for sid in states:
        ds = [get_place(d).name for d in districts if get_place(d).parent_id == sid]
        where.append({"state": get_place(sid).name, "districts": ds if len(states) <= 2 else [],
                      "district_count": len(ds)})
    rows = [[w["state"], ", ".join(w["districts"]) if w["districts"] else (f"{w['district_count']} districts" if w["district_count"] else "—")]
            for w in where]
    rid = ctx.table(f"{e['name']}: where it struck", ["State / province", "Districts"], rows,
                    note="Districts are named when the event affected one or two states.") if rows else None
    hazards = EVENT_HAZARDS.get(e["type"], [])
    return {"event_id": e["event_id"], "name": e["name"], "type": TYPE_NAMES.get(e["type"], e["type"]),
            "start_date": e["start_date"], "end_date": e["end_date"], "country": e["country"],
            "states_affected": len(states), "where": where, "impacts": _impacts(e), "summary": e["summary"],
            "index_hazards_for_this_type": [COMPONENT_LABEL[c] for c in hazards],
            "source": e["source"], "source_url": e["source_url"], "show": [rid] if rid else []}


def event_signal(ctx: ToolContext, event_id: str, max_places: int = 6) -> dict:
    e, ev_places = _event_arg(event_id)
    y, m = int(e["start_date"][:4]), int(e["start_date"][5:7])
    ey, em = int(e["end_date"][:4] or y), int(e["end_date"][5:7] or m)
    span = min(MAX_MONTHS, (ey - y) * 12 + em - m + 1)
    window = [((m - 1 + i) // 12, (m - 1 + i) % 12 + 1) for i in range(max(1, span))]  # (year offset, month)
    months = ", ".join(f"{MONTH_NAMES[mm - 1]} {y + dy}" for dy, mm in window)
    states = [pid for pid, role in ev_places if role in ("state", "country")]
    # One or two states: look at the affected districts. More: look at the states themselves.
    targets = [pid for pid, role in ev_places if role == "district"] if len(states) <= 2 else states
    targets = targets or states
    max_places = max(1, min(int(max_places or 6), 12))
    codes = EVENT_HAZARDS.get(e["type"], [])
    readings = []
    for pid in targets[:max_places]:
        p = get_place(pid)
        for comp in [c for c in codes if c in components_of(p)] + ["COMPOSITE"]:
            r = ranked(p, comp, y, window)
            if r:
                readings.append({"place": p.name, "hazard": label_of(comp, p.country), "value": rnd(r["value"]),
                                 "level": severity(r["value"]),
                                 "compared_with_same_months": standing(r["rank"], r["n_years"]),
                                 "rank": r["rank"], "of_years": r["n_years"]})
    if not readings:
        raise ToolError(f"The index has no data for {e['name']} ({months}): it runs from 1991 to the latest month.")
    hazard_rows = [r for r in readings if not r["hazard"].startswith("Overall")] or readings
    strongest = max(hazard_rows, key=lambda r: r["value"])
    rid = ctx.table(f"What the index recorded during {e['name']} ({months})",
                    ["Place", "Hazard", SCORE, "Level", "Compared with the same months since 1991"],
                    [[r["place"], r["hazard"], r["value"], r["level"], r["compared_with_same_months"]] for r in readings],
                    [2], note=SCORE_NOTE)
    return {"event": e["name"], "months": months, "places_checked": len(targets[:max_places]),
            "places_not_shown": max(0, len(targets) - max_places),
            "hazards_for_this_type": [COMPONENT_LABEL[c] for c in codes], "readings": readings,
            "strongest": strongest, "show": [rid]}
