"""SNAPSHOT: one place, one period (year, season or month).

Computes the overall index and every measured hazard for the period, each ranked against the same
period in every year since 1991; compares with the parent region and up to 4 neighbours; and adds the
long-run series of the overall index for that period.
"""

from ..compute import YEAR, components_of, label_of, neighbours, ranked, window, window_series
from ..data import get_place
from ..labels import COMPONENT_LABEL, COUNTRY_INFO, MONTH_NAMES, SEASONS
from ..stats import fmt, rnd, severity
from .common import SEASON_SLOT, Ctx, Planned, UserError, check_year, nullable, obj, place_of, season_or_none, year_bounds

NAME = "snapshot"
SCHEMA = obj({
    "place": {"type": "string", "description": "Place name exactly as the user wrote it"},
    "year": nullable("integer", description="Year asked about; null if not given"),
    "season": SEASON_SLOT,
    "month": nullable("integer", description="1-12 if a single month is asked about, else null"),
})
WRITER_SLOTS = {"regional": "1-2 sentences comparing the place with its neighbours and parent region"}


def run(slots: dict, ctx: Ctx) -> Planned:
    p = place_of(slots.get("place"), ctx)
    _, _, last_full = year_bounds(p.country)
    month = slots.get("month") if slots.get("month") in range(1, 13) else None
    season = None if month else season_or_none(slots.get("season"))
    win, win_label = window(season, month)
    year = slots.get("year")
    if not year:  # no year given: the most recent complete period ("last winter", "in July")
        done = window_series(p, "COMPOSITE", win) if (month or season) else []
        year = done[-1][0] if done else last_full
    check_year(year, p.country)
    period = f"{MONTH_NAMES[month - 1]} {year}" if month else (f"{SEASONS[season]['label']} {year}" if season else str(year))

    overall = ranked(p, "COMPOSITE", year, win)
    if not overall:
        raise UserError(f"There is no data for {p.name} for {period} yet.")
    hazards, missing = [], []
    for c in COUNTRY_INFO[p.country]["components"]:
        r = ranked(p, c, year, win) if c in components_of(p) else None
        if r:
            hazards.append({"hazard": COMPONENT_LABEL[c], "value": rnd(r["value"]), "rank": r["rank"], "n_years": r["n_years"]})
        else:
            missing.append(COMPONENT_LABEL[c])
    ctx.step("score_period", {"place": p.id, "period": period},
             f"{p.name} {period}: overall {fmt(overall['value'])}, rank {overall['rank']} of {overall['n_years']}")

    regional = []
    others = neighbours(p) + ([get_place(p.parent_id)] if p.parent_id else [])
    for q in others:
        r = ranked(q, "COMPOSITE", year, win)
        if r:
            regional.append({"place": q.name, "type": "Neighbour" if q.level == p.level else f"Parent {q.level_label.lower()}",
                             "value": rnd(r["value"]), "rank": r["rank"], "n_years": r["n_years"]})
    ctx.step("regional_context", {"place": p.id}, f"{len(regional)} nearby places compared")

    series = [{"x": y, "y": rnd(v)} for y, v in window_series(p, "COMPOSITE", win)]
    partial = win == YEAR and overall["months"] < 12
    o = {"value": rnd(overall["value"]), "rank": overall["rank"], "n_years": overall["n_years"]}
    facts = {"place": p.ref(), "period": period, "partial_year": partial, "overall": o,
             "hazards": hazards, "not_measured": missing, "regional": regional}
    notes = [f"{year} is not complete in the data ({overall['months']} months); ranks compare the same months across years."] if partial else []
    return Planned(NAME, p.country, f"{p.name}: {period}",
                   f"{p.level_label}{', ' + p.parent_name if p.parent_name else ''} · {COUNTRY_INFO[p.country]['name']}",
                   facts, {"facts": facts, "series": series, "year": year, "win_label": win_label}, notes)


def assemble(pl: Planned, n: dict) -> list[dict]:
    f = pl.facts
    rows = [["Overall index", f["overall"]["value"], f"{f['overall']['rank']} of {f['overall']['n_years']}", severity(f["overall"]["value"])]]
    rows += [[h["hazard"], h["value"], f"{h['rank']} of {h['n_years']}", severity(h["value"])] for h in f["hazards"]]
    rows += [[m, None, "—", "Not measured here"] for m in f["not_measured"]]
    out = [
        {"kind": "text", "title": "Headline", "body": n["headline"]},
        {"kind": "table", "title": "Scorecard", "columns": ["Hazard", "Anomaly", "Rank (1 = highest)", "Level"], "rows": rows,
         "valueCols": [1], "note": f"Compared with the same {'months' if pl.data['win_label'] != 'Year' else 'period'} in every year since 1991."},
    ]
    if f["regional"]:
        out.append({"kind": "table", "title": "Regional context", "columns": ["Place", "Type", "Overall index", "Rank (1 = highest)"],
                    "rows": [[f["place"]["name"], "This place", f["overall"]["value"], f"{f['overall']['rank']} of {f['overall']['n_years']}"]]
                    + [[r["place"], r["type"], r["value"], f"{r['rank']} of {r['n_years']}"] for r in f["regional"]],
                    "valueCols": [2], "highlightRow": 0})
        if n["sections"].get("regional"):
            out.append({"kind": "text", "title": "", "body": n["sections"]["regional"]})
    out.append({"kind": "lines", "title": "Long-run context", "xLabel": "Year", "yLabel": f"Overall index, {pl.data['win_label'].lower()} (anomaly)",
                "series": [{"name": f["place"]["name"], "points": pl.data["series"]}], "marker": pl.data["year"]})
    return out


def template(pl: Planned) -> dict:
    f = pl.facts
    o = f["overall"]
    return {"headline": f"{f['place']['name']}'s overall index for {f['period']} was {fmt(o['value'])}, "
                        f"rank {o['rank']} of {o['n_years']} (1 = highest).", "sections": {}, "followups": []}
