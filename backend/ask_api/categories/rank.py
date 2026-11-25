"""RANK: many places ordered by a hazard, within a state/nation/province or a whole country.

by=value: the period's value (a single year/season/month) or the mean over a range of years.
by=worsening: Sen's slope per decade over the range, with the Mann-Kendall result.
"""

from ..compute import components_of, label_of, period_mean, ranked, trend, window
from ..data import load_country, norm, resolve
from ..labels import COUNTRY_INFO, MONTH_NAMES, SEASONS
from ..stats import fmt, rnd
from .common import HAZARD_SLOT, SEASON_SLOT, Clarify, Ctx, Planned, check_year, hazard_code, nullable, obj, season_or_none, year_bounds

NAME = "rank"
SCHEMA = obj({
    "region": nullable("string", description="The state, nation or province the user names (e.g. 'Odisha', 'Kerala', "
                      "'Scotland'), copied as written. null only if they name none or name a whole country"),
    "country": {"type": ["string", "null"], "enum": ["india", "uk", "nepal", None], "description": "Only if the user names a country"},
    "hazard": HAZARD_SLOT,
    "year": nullable("integer", description="Single year asked about; null if not given"),
    "season": SEASON_SLOT,
    "month": nullable("integer", description="1-12 if a single month, else null"),
    "from_year": nullable("integer"), "to_year": nullable("integer"),
    "last_years": nullable("integer", description="e.g. 10 for 'last 10 years'"),
    "rank_by": {"type": "string", "enum": ["value", "worsening"],
                "description": "worsening ONLY for change over time (getting worse, rising, increasing fastest, trend). "
                                "'worst', 'most', 'highest', 'top', 'extreme' all mean value"},
    "order": {"type": "string", "enum": ["highest", "lowest"], "description": "lowest only for 'least', 'mildest', 'best'"},
    "limit": nullable("integer", description="ONLY if the user gives a number (e.g. 'top 5' = 5). Otherwise null"),
})
WRITER_SLOTS = {"pattern": "1 sentence on any geographic pattern among the top places (only from the table)"}


def run(slots: dict, ctx: Ctx) -> Planned:
    country = slots.get("country") or ctx.country
    comp = hazard_code(slots.get("hazard"))
    data = load_country(country)
    info = COUNTRY_INFO[country]
    region = None
    if slots.get("region") and norm(slots["region"]) != norm(info["name"]):
        r = resolve(slots["region"], country)
        tops = [m.place for m in r["matches"] if m.place.level == "top"]
        if not tops:
            raise Clarify(f'I could not find a {info["top_label"].lower()} called "{slots["region"]}" in {info["name"]}.')
        if len(tops) > 1:
            raise Clarify("Which region do you mean?", [{"label": t.name, "id": t.id} for t in tops], slots["region"])
        region = tops[0]

    first, last, last_full = year_bounds(country)
    by = slots.get("rank_by") or "value"
    month = slots.get("month") if slots.get("month") in range(1, 13) else None
    season = None if month else season_or_none(slots.get("season"))
    win, win_label = window(season, month)
    year = slots.get("year")
    if slots.get("last_years"):
        y0, y1 = last_full - int(slots["last_years"]) + 1, last_full
    elif slots.get("from_year") or slots.get("to_year"):
        y0, y1 = slots.get("from_year") or first, slots.get("to_year") or last_full
    elif year and by == "value":
        y0 = y1 = year
    else:
        y0, y1 = (first, last_full) if by == "worsening" else (last_full, last_full)
    for y in (y0, y1):
        check_year(y, country)
    span = str(y0) if y0 == y1 else f"{y0}–{y1}"
    what = MONTH_NAMES[month - 1] if month else SEASONS[season]["label"] if season else ""
    period = f"{what} {span}".strip()

    pool = [p for p in data.places.values() if p.level == "child" and (not region or p.parent_id == region.id)
            and (comp == "COMPOSITE" or comp in components_of(p))]
    rows = []
    for p in pool:
        if by == "worsening":
            t = trend(p, comp, win, y0, y1)
            if t["slope_per_decade"] is not None:
                rows.append({"place": p.name, "parent": p.parent_name, "value": t["slope_per_decade"],
                             "direction": t["direction"], "p": rnd(t["p"], 3)})
        elif y0 == y1:
            r = ranked(p, comp, y0, win)
            if r:
                rows.append({"place": p.name, "parent": p.parent_name, "value": r["value"], "year_rank": r["rank"], "n_years": r["n_years"]})
        else:
            v = period_mean(p, comp, win, y0, y1)
            if v is not None:
                rows.append({"place": p.name, "parent": p.parent_name, "value": v})
    if by == "worsening" and y1 - y0 < 7:
        raise Clarify("A trend needs at least 8 years. Which range of years should I use? (For example: since 2000.)")
    rows.sort(key=lambda r: r["value"], reverse=slots.get("order") != "lowest")
    limit = max(1, min(int(slots.get("limit") or 10), 25))
    top = [{"rank": i + 1, **r, "value": rnd(r["value"])} for i, r in enumerate(rows[:limit])]
    scope = region.name if region else info["name"]
    measure = (f"Change per decade in {label_of(comp, country).lower()} ({period}, Sen's slope)" if by == "worsening"
               else f"{label_of(comp, country)} anomaly, {period}" + (" (mean of the years)" if y0 != y1 else ""))
    ctx.step("rank_places", {"scope": scope, "hazard": label_of(comp), "period": period, "by": by},
             f"{len(rows)} places ranked; top: " + ", ".join(f"{r['place']} {fmt(r['value'])}" for r in top[:3]))
    facts = {"measure": measure, "scope": scope, "n_ranked": len(rows), "order": slots.get("order") or "highest", "rows": top}
    title = f"{label_of(comp)}: {'fastest worsening' if by == 'worsening' else ('lowest' if slots.get('order') == 'lowest' else 'most extreme')} places"
    return Planned(NAME, country, title, f"{scope} · {period}", facts,
                   {"by": by, "unit": "z-score per decade" if by == "worsening" else "z-score"})


def assemble(pl: Planned, n: dict) -> list[dict]:
    f, worse = pl.facts, pl.data["by"] == "worsening"
    cols = ["Rank", "Place", "Parent", "Change per decade" if worse else "Anomaly"] + (["Trend test"] if worse else [])
    if not worse and f["rows"] and "year_rank" in f["rows"][0]:
        cols.append("Rank vs own past years")
    rows = []
    for r in f["rows"]:
        row = [r["rank"], r["place"], r["parent"], r["value"]]
        if worse:
            row.append(f"{r['direction']} (p={r['p']})")
        elif "year_rank" in r:
            row.append(f"{r['year_rank']} of {r['n_years']}")
        rows.append(row)
    out = [
        {"kind": "text", "title": "Direct answer", "body": n["headline"]},
        {"kind": "table", "title": "Ranked table", "columns": cols, "rows": rows, "valueCols": [] if worse else [3],
         "note": f"{f['n_ranked']} places ranked. {f['measure']}."},
        {"kind": "bars", "title": "Chart", "unit": pl.data["unit"],
         "rows": [{"label": r["place"], "sub": r["parent"], "value": r["value"], "highlight": i == 0} for i, r in enumerate(f["rows"])]},
    ]
    if n["sections"].get("pattern"):
        out.append({"kind": "text", "title": "", "body": n["sections"]["pattern"]})
    return out


def template(pl: Planned) -> dict:
    r = pl.facts["rows"]
    head = f"{r[0]['place']} ranks first ({fmt(r[0]['value'])}) of {pl.facts['n_ranked']} places." if r else "No places had data for this request."
    return {"headline": head, "sections": {}, "followups": []}
