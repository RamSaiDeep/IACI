"""Turn everyday words into exact inputs, before any data is fetched. No model involved.

    resolve_hazard("flood")                -> heavy rainfall, with a note that floods aren't measured directly
    resolve_period(country, year=2024, season="monsoon")
                                           -> June–September 2024, checked against the data's date range
    data_coverage(place_id)                -> hazards measured there, years covered, coastal or not,
                                              and which formula makes its overall index
"""

from __future__ import annotations

from ..compute import components_of, label_of
from ..data import get_place, load_country
from ..labels import COMPONENT_LABEL, COUNTRY_INFO, HAZARD_TO_CODE, MONTH_NAMES, SEASONS

# ---------------------------------------------------------------- hazards

# Everyday words the index has no exact measure for, mapped to the closest hazard(s) it does measure.
APPROXIMATE = {
    "flood": ["PS"], "floods": ["PS"], "flooding": ["PS"], "deluge": ["PS"], "cloudburst": ["PS"],
    "waterlogging": ["PS"], "monsoon rain": ["PS"],
    "heatwave": ["T90S"], "heat wave": ["T90S"], "warming": ["T90S"], "hot weather": ["T90S"],
    "cold wave": ["T10S"], "coldwave": ["T10S"], "frost": ["T10S"], "chill": ["T10S"],
    "cyclone": ["W", "PS"], "storm": ["W", "PS"], "hurricane": ["W", "PS"], "typhoon": ["W", "PS"],
    "gale": ["W"], "dry spell": ["DS"], "water shortage": ["DS"], "scanty rain": ["DS"], "low rainfall": ["DS"],
    "storm surge": ["SS"], "sea level rise": ["SS"], "coastal flooding": ["SS"],
    "temperature": ["T90S", "T10S"], "weather": ["COMPOSITE"], "climate": ["COMPOSITE"],
}
NOT_MEASURED = {"earthquake", "earthquakes", "landslide", "landslides", "wildfire", "forest fire", "fire",
                "lightning", "hail", "hailstorm", "air pollution", "pollution", "smog", "fog", "tsunami",
                "avalanche", "snow", "snowfall", "humidity"}


def resolve_hazard(word: str | None, country: str | None = None) -> dict:
    """{"status": "ok" | "approximate" | "not_measured" | "unknown", "hazards": [{"code", "label"}], "note"}.
    No word means the overall index."""
    w = " ".join((word or "").lower().replace("-", " ").split())
    if not w:
        return _hazards("ok", ["COMPOSITE"], country)
    if w in HAZARD_TO_CODE:
        return _hazards("ok", [HAZARD_TO_CODE[w]], country)
    if w in APPROXIMATE:
        codes = APPROXIMATE[w]
        names = " and ".join(label_of(c, country).lower() for c in codes)
        return _hazards("approximate", codes, country,
                        f'The index has no direct measure of "{word}"; the closest is {names}.')
    if w in NOT_MEASURED:
        return {"status": "not_measured", "hazards": [], "note": (
            f'The index does not measure {word}. It covers extreme heat, extreme cold, heavy rainfall, '
            "strong wind, drought and (on coasts) sea level.")}
    return {"status": "unknown", "hazards": [], "note": (
        f'"{word}" is not a hazard in the index. Choose from: overall index, extreme heat, extreme cold, '
        "heavy rainfall, strong wind, drought, sea level.")}


def _hazards(status: str, codes: list[str], country: str | None, note: str | None = None) -> dict:
    if country == "nepal" and "SS" in codes:
        return {"status": "not_measured", "hazards": [], "note": "Nepal is landlocked, so its index has no sea level."}
    return {"status": status, "hazards": [{"code": c, "label": label_of(c, country)} for c in codes], "note": note}


# ---------------------------------------------------------------- periods

RELATIVE = ("this_year", "last_year", "last_complete_year", "latest_month")
SEASONS_BY_COUNTRY = {"india": set(SEASONS), "nepal": set(SEASONS), "uk": {"summer", "winter"}}


def resolve_period(country: str, year: int | None = None, season: str | None = None, month: int | None = None,
                   from_year: int | None = None, to_year: int | None = None, last_years: int | None = None,
                   relative: str | None = None) -> dict:
    """Check a period against the data's date range and label it.

    {"status": "ok" | "error",
     "period": {"kind": "year" | "season" | "month" | "range", "year", "season", "month", "from_year", "to_year"},
     "label": "Monsoon (Jun–Sep) 2024", "partial": bool, "note": str | None}
    A single year/season/month that runs past the latest data month is "partial" (the year so far)."""
    d = load_country(country)
    first, last_ym = d.first // 100, d.last
    last_year, last_month = last_ym // 100, last_ym % 100
    last_full = last_year if last_month == 12 else last_year - 1

    if relative:
        if relative not in RELATIVE:
            return _period_error(f"Unknown relative period {relative!r}.")
        if relative == "latest_month":
            year, month = last_year, last_month
        else:
            year = {"this_year": last_year, "last_year": last_year - 1, "last_complete_year": last_full}[relative]
    if season and season not in SEASONS_BY_COUNTRY.get(country, set()):
        return _period_error(f"{SEASONS.get(season, {}).get('label', season)} is not used for {COUNTRY_INFO[country]['name']}.")
    if month is not None and not 1 <= month <= 12:
        return _period_error(f"Month {month} is not between 1 and 12.")

    if last_years:
        to_year, from_year = last_full, last_full - last_years + 1
    if from_year or to_year:
        f, t = from_year or first, to_year or last_full
        if f > t:
            f, t = t, f
        if f < first or t > last_year:
            return _period_error(f"The record runs from {first} to {last_year}; {f}–{t} is outside it.")
        label = f"{f}–{t}" + (f", {SEASONS[season]['label']}" if season else "")
        return {"status": "ok", "period": {"kind": "range", "year": None, "season": season, "month": month,
                                           "from_year": f, "to_year": t},
                "label": label, "partial": t == last_year and last_month < 12,
                "note": f"{last_year} only runs to {MONTH_NAMES[last_month - 1]}." if t == last_year and last_month < 12 else None}

    if year is None:
        return _period_error("Which year? For example 2024, or a range such as 2015–2025.")
    if not first <= year <= last_year:
        return _period_error(f"The record runs from {first} to {last_year}; {year} is outside it.")
    kind = "month" if month else "season" if season else "year"
    label = (f"{MONTH_NAMES[month - 1]} {year}" if month else
             f"{SEASONS[season]['label']} {year}" if season else str(year))
    # First and last month (YYYYMM) of the period; winter Y runs from December Y-1 to February Y.
    months = ([(0, month)] if month else SEASONS[season]["months"] if season else [(0, 1), (0, 12)])
    start = min((year + off) * 100 + m for off, m in months)
    end = max((year + off) * 100 + m for off, m in months)
    if start > last_ym:
        return _period_error(f"The data runs to {MONTH_NAMES[last_month - 1]} {last_year}; {label} isn't in it yet.")
    partial = end > last_ym
    note = f"{year} so far: the data runs to {MONTH_NAMES[last_month - 1]} {last_year}." if partial else None
    return {"status": "ok", "period": {"kind": kind, "year": year, "season": season, "month": month,
                                       "from_year": None, "to_year": None},
            "label": label + (" (so far)" if partial else ""), "partial": partial, "note": note}


def _period_error(msg: str) -> dict:
    return {"status": "error", "period": None, "label": None, "partial": False, "note": msg}


# ---------------------------------------------------------------- coverage

def data_coverage(place_id: str) -> dict:
    """What the index has for one place. Used before fetching data, and to explain gaps."""
    p = get_place(place_id)
    if not p:
        return {"status": "error", "note": f"Unknown place id {place_id!r}. Use find_place first."}
    comps = components_of(p)
    index_vals = [v for v in p.cols.get("COMPOSITE", []) if v is not None]
    info = COUNTRY_INFO[p.country]
    land = [c for c in comps if c != "SS"]
    if not index_vals:
        formula = (f"No overall index: only {', '.join(COMPONENT_LABEL[c].lower() for c in comps) or 'no hazard'} "
                   "can be measured here, and the index needs all five land hazards.")
    elif "SS" in comps:
        formula = f"Coastal: the average of {len(comps)} hazards, including sea level."
    else:
        formula = (f"{'Landlocked' if p.country == 'nepal' else 'Inland'}: the average of {len(land)} hazards; "
                   "sea level does not apply here.")
    return {"status": "ok", "place": {**p.ref(), "coastal": p.coastal},
            "index": f"{info['index_name']} ({info['index_code']}), {info['version']}",
            "hazards": [{"code": c, "label": COMPONENT_LABEL[c]} for c in comps],
            "has_overall_index": bool(index_vals), "formula": formula,
            "first_month": f"{MONTH_NAMES[p.periods[0] % 100 - 1]} {p.periods[0] // 100}",
            "last_month": f"{MONTH_NAMES[p.periods[-1] % 100 - 1]} {p.periods[-1] // 100}"}
