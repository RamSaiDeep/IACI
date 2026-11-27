"""Build the historical disaster-event tables the ClimateIQ Agent looks up (tools/events.py).

    python backend/build_events.py            # all sources
    python backend/build_events.py --only bipad

Writes backend/ask_api/reference/events.csv and event_places.csv. Every run rebuilds both from scratch.
Open sources only (all may be committed):

    GDACS (UN / European Commission)   floods, tropical cyclones, droughts since 2000; India (and Nepal/UK if any).
                                       Affected districts = districts whose centre lies inside GDACS's
                                       affected-area outline for the event.
    BIPAD portal (Government of Nepal) every reported incident with its location and losses. Incidents are
                                       grouped into events by type, month and province.
    Met Office (UK, Open Government    named storms per season since 2015-16: name, first date, and the
    Licence)                           nations the season page mentions with the storm.

Event types follow docs/ask-the-index/06-events-plan.md. Earthquakes and other non-weather hazards are left out.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))
from ask_api.data import get_place, load_country, resolve  # noqa: E402
from ask_api.geo import district_at, districts_in  # noqa: E402

OUT = Path(__file__).parent / "ask_api" / "reference"
UA = {"User-Agent": "Mozilla/5.0 (compatible; iaci-events-builder/1.0)"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
TYPE_LABEL = {"flood": "Floods", "landslide": "Landslides", "cyclone_storm": "Storms", "coastal_flood": "Coastal floods",
              "heatwave": "Heatwave", "cold_wave": "Cold wave", "drought": "Drought", "wildfire": "Forest fires"}
FIELDS = ["event_id", "source", "source_ref", "country", "type", "name", "start_date", "end_date", "deaths", "missing",
          "injured", "people_affected", "families_affected", "damage", "damage_unit", "summary", "source_url"]


def get_json(client: httpx.Client, url: str, params: dict | None = None, tries: int = 3):
    for attempt in range(tries):
        try:
            r = client.get(url, params=params, headers=UA, timeout=60)
            if r.status_code == 200:
                return r.json() if r.text.strip() else None
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(2 * (attempt + 1))
    return None


def with_states(places: list[str]) -> list[tuple[str, str]]:
    """District ids -> [(district, "district"), ..., (state, "state"), ...]."""
    out = [(pid, "district") for pid in dict.fromkeys(places)]
    states = dict.fromkeys(get_place(pid).parent_id for pid in places if get_place(pid) and get_place(pid).parent_id)
    return out + [(sid, "state") for sid in states]


def state_names(places: list[tuple[str, str]], limit: int = 3) -> str:
    names = [get_place(pid).name for pid, role in places if role == "state"]
    return ", ".join(names[:limit]) + (f" and {len(names) - limit} more" if len(names) > limit else "")


# ---------------------------------------------------------------- GDACS

GDACS_LIST = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
GDACS_GEOM = "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry"
GDACS_TYPES = {"FL": "flood", "TC": "cyclone_storm", "DR": "drought"}


MAX_FLOOD_STATES = 10  # a flood outline spanning more states than this is effectively national: keep states only


def _gdacs_list(client: httpx.Client, iso3: str, typ: str, start: dt.date, end: dt.date) -> list[dict]:
    """GDACS returns at most 100 events per request (and its country filter is loose, so other countries' events
    fill that quota): split the date range until each request comes back under the cap."""
    d = get_json(client, GDACS_LIST, {"eventlist": typ, "alertlevel": "Green;Orange;Red", "country": iso3,
                                      "fromDate": start.isoformat(), "toDate": end.isoformat()})
    feats = (d or {}).get("features", [])
    if len(feats) >= 100 and (end - start).days > 7:
        mid = start + (end - start) / 2
        return _gdacs_list(client, iso3, typ, start, mid) + _gdacs_list(client, iso3, typ, mid + dt.timedelta(days=1), end)
    return feats


def _affected_areas(geo: dict, typ: str) -> list[dict]:
    """The outline(s) to test districts against. Cyclones: the 90 km/h wind area (else 60 km/h). Others: the
    affected area. Never the global extent or the forecast cones."""
    polys = [g for g in geo.get("features", []) if g["geometry"]["type"] in ("Polygon", "MultiPolygon")]
    cls = lambda g: str(g["properties"].get("Class", ""))  # noqa: E731
    if typ == "TC":
        return [g["geometry"] for g in polys if cls(g) == "Poly_Orange"] or [g["geometry"] for g in polys if cls(g) == "Poly_Green"]
    return [g["geometry"] for g in polys if "Affected" in cls(g) or "Area" in cls(g)]


def gdacs(client: httpx.Client, country: str, iso3: str) -> list[tuple[dict, list]]:
    seen, out = set(), []
    feats = [f for year in range(2000, dt.date.today().year + 1) for typ in GDACS_TYPES
             for f in _gdacs_list(client, iso3, typ, dt.date(year, 1, 1), dt.date(year, 12, 31))]
    for f in feats:
        p = f["properties"]
        key = (p["eventtype"], p["eventid"])
        if key in seen or iso3 not in [c.get("iso3") for c in p.get("affectedcountries") or []]:
            continue  # the country filter is loose: keep only events that list this country as affected
        seen.add(key)
        geo = get_json(client, GDACS_GEOM, {"eventtype": p["eventtype"], "eventid": p["eventid"],
                                            "episodeid": p.get("episodeid", 1)}) or {}
        places: list[str] = []
        for area in _affected_areas(geo, p["eventtype"]):
            places += districts_in(area, country)
        lng, lat = f["geometry"]["coordinates"][:2] if f["geometry"]["type"] == "Point" else (None, None)
        point_district = district_at(lat, lng, country) if lat is not None else None
        if point_district:
            places.append(point_district)
        if not places:
            continue  # never reached land in this country
        pl = with_states(places)
        if p["eventtype"] == "FL" and sum(1 for _, r in pl if r == "state") > MAX_FLOOD_STATES:
            pl = [(pid, r) for pid, r in pl if r == "state"]  # national-scale outline: no district list
        start, end = p["fromdate"][:10], p["todate"][:10]
        typ = GDACS_TYPES[p["eventtype"]]
        when = f"{MONTHS[int(start[5:7]) - 1]} {start[:4]}"
        if typ == "cyclone_storm":
            # "FANI-19" -> "Fani"; a renamed storm "MATMO-19/BULBUL-19" -> its later name, "Bulbul"
            base = (p.get("eventname") or p["name"]).split("/")[-1].rsplit("-", 1)[0].title()
            name = f"Cyclone {base} ({start[:4]})"
        else:
            name = f"{TYPE_LABEL[typ]} in {state_names(pl)} ({when})"
        sev = (p.get("severitydata") or {}).get("severitytext") or ""
        out.append(({"event_id": f"gdacs:{p['eventtype']}-{p['eventid']}", "source": "GDACS",
                     "source_ref": p.get("glide") or f"{p['eventtype']}-{p['eventid']}", "country": country,
                     "type": typ, "name": name, "start_date": start, "end_date": end,
                     "summary": f"{p['name']}, GDACS {p.get('alertlevel', '')} alert. {sev}".strip(),
                     "source_url": (p.get("url") or {}).get("report", "")}, pl))
    time.sleep(0.3)
    return out


# ---------------------------------------------------------------- BIPAD (Nepal)

BIPAD = "https://bipadportal.gov.np/api/v1/incident/"
BIPAD_TYPES = {11: "flood", 28: "flood", 26: "flood", 14: "flood", 19: "flood", 17: "landslide", 24: "cyclone_storm",
               22: "cyclone_storm", 6: "cold_wave", 21: "cold_wave", 27: "heatwave", 25: "drought", 12: "wildfire"}
LOSS = {"deaths": "peopleDeathCount", "missing": "peopleMissingCount", "injured": "peopleInjuredCount",
        "people_affected": "peopleAffectedCount", "families_affected": "familyAffectedCount", "damage": "estimatedLoss"}


def bipad(client: httpx.Client) -> list[tuple[dict, list]]:
    groups: dict[tuple, dict] = {}
    for hazard, typ in BIPAD_TYPES.items():
        offset = 0
        while True:
            d = get_json(client, BIPAD, {"hazard": hazard, "limit": 500, "offset": offset, "expand": "loss",
                                         "incident_on__gt": "2000-01-01"})
            rows = (d or {}).get("results") or []
            for r in rows:
                pt, when = r.get("point"), (r.get("incidentOn") or "")[:10]
                if not pt or not when:
                    continue
                pid = district_at(pt["coordinates"][1], pt["coordinates"][0], "nepal")
                if not pid:
                    continue
                key = (typ, when[:7], get_place(pid).parent_id)
                g = groups.setdefault(key, {"dates": [], "districts": [], **{k: 0 for k in LOSS}, "n": 0})
                g["dates"].append(when)
                g["districts"].append(pid)
                g["n"] += 1
                for k, field in LOSS.items():
                    g[k] += (r.get("loss") or {}).get(field) or 0
            if len(rows) < 500:
                break
            offset += 500
            time.sleep(0.3)
    out = []
    for (typ, month, province_id), g in groups.items():
        if g["n"] < 3 and g["deaths"] < 1:
            continue  # a single small incident is not an event
        province = get_place(province_id).name
        when = f"{MONTHS[int(month[5:]) - 1]} {month[:4]}"
        n_d = len(set(g["districts"]))
        out.append(({"event_id": f"bipad:{typ}-{month}-{province.lower().replace(' ', '-')}", "source": "BIPAD portal",
                     "source_ref": f"{g['n']} incidents", "country": "nepal", "type": typ,
                     "name": f"{TYPE_LABEL[typ]} in {province} Province ({when})",
                     "start_date": min(g["dates"]), "end_date": max(g["dates"]),
                     **{k: g[k] or "" for k in LOSS}, "damage_unit": "NPR" if g["damage"] else "",
                     "summary": f"{g['n']} {TYPE_LABEL[typ].lower()} incidents reported to Nepal's BIPAD portal in "
                                f"{n_d} district{'s' if n_d > 1 else ''} of {province} Province.",
                     "source_url": "https://bipadportal.gov.np/incidents/"}, with_states(g["districts"])))
    return out


# ---------------------------------------------------------------- Met Office (UK named storms)

METOFFICE = "https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-storm-centre/uk-storm-season-{}"
DATE = re.compile(r"(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:and|to|-|–)\s+\d{1,2}(?:st|nd|rd|th)?)?\s+(" + "|".join(MONTHS)
                  + r")(?:\s+(\d{4}))?")
NATIONS = ["England", "Scotland", "Wales", "Northern Ireland"]


def metoffice(client: httpx.Client) -> list[tuple[dict, list]]:
    nation_ids = {n: next(m.place.id for m in resolve(n, "uk")["matches"]) for n in NATIONS}
    uk_id = next(p.id for p in load_country("uk").places.values() if p.level == "country")
    out = []
    for y in range(2015, dt.date.today().year):
        season = f"{y}-{str(y + 1)[2:]}"
        r = client.get(METOFFICE.format(season), headers=UA, timeout=60, follow_redirects=True)
        if r.status_code != 200:
            continue
        paras = [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", r.text, re.S)]
        text = " ".join(paras)
        sentences = [s for p in paras for s in re.split(r"(?<=[.!?])\s+", p)]
        storms = dict.fromkeys(re.findall(r"\bStorm ([A-Z][a-z]+)\b", text))
        for storm in storms:
            # Only trust a date in a sentence that names this storm and no other (prose often lists several).
            m = None
            for s in sentences:
                names = set(re.findall(r"\b(?:Storms?|and) ([A-Z][a-z]+)\b", s)) & set(storms)
                if names == {storm} and (m := DATE.search(s)):
                    break
            if not m:
                continue  # no date we can trust: leave the storm out rather than show the wrong month
            month = MONTHS.index(m.group(2)) + 1
            year = int(m.group(3)) if m.group(3) else (y if month >= 8 else y + 1)
            start = f"{year}-{month:02d}-{int(m.group(1)):02d}"
            mention = [p for p in paras if f"Storm {storm}" in p or f"{storm}" in p.split()]
            near = " ".join(mention)
            nations = [n for n in NATIONS if n in near]
            places = [(nation_ids[n], "state") for n in nations] or [(uk_id, "country")]
            summary = next((s.strip() for p in mention for s in re.split(r"(?<=\.)\s", p) if storm in s), "")[:300]
            out.append(({"event_id": f"metoffice:storm-{storm.lower()}-{season}", "source": "Met Office",
                         "source_ref": f"UK storm season {season}", "country": "uk", "type": "cyclone_storm",
                         "name": f"Storm {storm} ({year})", "start_date": start, "end_date": start,
                         "summary": summary, "source_url": METOFFICE.format(season)}, places))
        time.sleep(0.3)
    return out


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["gdacs", "bipad", "metoffice"])
    args = ap.parse_args()
    events: list[tuple[dict, list]] = []
    with httpx.Client() as client:
        if args.only in (None, "gdacs"):
            for country, iso3 in (("india", "IND"), ("nepal", "NPL"), ("uk", "GBR")):
                got = gdacs(client, country, iso3)
                print(f"GDACS {country}: {len(got)} events", flush=True)
                events += got
        if args.only in (None, "bipad"):
            got = bipad(client)
            print(f"BIPAD Nepal: {len(got)} events", flush=True)
            events += got
        if args.only in (None, "metoffice"):
            got = metoffice(client)
            print(f"Met Office UK: {len(got)} storms", flush=True)
            events += got

    if args.only:  # keep the other sources' rows from the last full build
        keep_src = {"gdacs": "GDACS", "bipad": "BIPAD portal", "metoffice": "Met Office"}[args.only]
        old = _read(OUT / "events.csv")
        old_places = _read(OUT / "event_places.csv")
        kept = {e["event_id"] for e in old if e["source"] != keep_src}
        events = [(e, [(p["place_id"], p["role"]) for p in old_places if p["event_id"] == e["event_id"]])
                  for e in old if e["event_id"] in kept] + events

    events.sort(key=lambda ep: (ep[0]["country"], ep[0]["start_date"]), reverse=False)
    header = (f"# Built by backend/build_events.py on {dt.date.today()}. Sources: GDACS (gdacs.org), BIPAD portal "
              "(bipadportal.gov.np, Govt. of Nepal), Met Office (metoffice.gov.uk, Open Government Licence).\n")
    with (OUT / "events.csv").open("w", newline="", encoding="utf-8") as f:
        f.write(header)
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows({k: e.get(k, "") for k in FIELDS} for e, _ in events)
    with (OUT / "event_places.csv").open("w", newline="", encoding="utf-8") as f:
        f.write(header)
        w = csv.writer(f)
        w.writerow(["event_id", "place_id", "role"])
        for e, places in events:
            w.writerows([e["event_id"], pid, role] for pid, role in places)
    by = defaultdict(int)
    for e, _ in events:
        by[(e["country"], e["type"])] += 1
    print(f"wrote {len(events)} events:", dict(sorted(by.items())))


def _read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


if __name__ == "__main__":
    main()
