"""COMPARE: 2-4 places side by side over a window of years.

Scorecard of each place's mean per hazard over the window, each place's trend (Sen slope +
Mann-Kendall), 5-year rolling means for the chart, and whether two places are converging or diverging.
"""

from ..compute import YEAR, components_of, label_of, period_mean, trend, window_series
from ..labels import BASELINE, COMPONENT_LABEL, COUNTRY_INFO
from ..stats import fmt, mean, rnd
from .common import HAZARD_SLOT, Clarify, Ctx, Planned, check_year, hazard_code, nullable, obj, place_of, year_bounds

NAME = "compare"
SCHEMA = obj({
    "places": {"type": "array", "items": {"type": "string"}, "description": "2-4 place names as written"},
    "from_year": nullable("integer", description="First year of the window; null if not given"),
    "to_year": nullable("integer", description="Last year of the window; null if not given"),
    "hazard": HAZARD_SLOT,
})
WRITER_SLOTS = {"change_over_time": "1-2 sentences: converging or diverging, using the 5-year rolling means",
                "why_differ": "1-2 sentences on which hazards differ most (only hazards in the results)"}


def run(slots: dict, ctx: Ctx) -> Planned:
    names = [s for s in (slots.get("places") or []) if s and str(s).strip()]
    if len(names) < 2:
        raise Clarify("Which places should I compare? Name two to four, for example: Chennai vs Hyderabad.")
    places = [place_of(nm, ctx) for nm in names[:4]]
    if len({p.id for p in places}) < len(places):
        raise Clarify("Those names point to the same place. Which places do you want to compare?")
    comp = hazard_code(slots.get("hazard"))
    first = max(year_bounds(p.country)[0] for p in places)
    last_full = min(year_bounds(p.country)[2] for p in places)
    y0, y1 = slots.get("from_year") or first, slots.get("to_year") or last_full
    check_year(y0, places[0].country)
    check_year(y1, places[0].country)
    y0, y1 = min(y0, y1), max(y0, y1)
    period = f"{y0}–{y1}"

    keys = ["COMPOSITE"] + [c for c in ["T90S", "T10S", "PS", "W", "DS", "SS"]
                            if any(c in COUNTRY_INFO[p.country]["components"] for p in places)]
    score, missing = [], {}
    for p in places:
        have = components_of(p)
        vals = {}
        for k in keys:
            vals[k] = rnd(period_mean(p, k, YEAR, y0, y1)) if (k == "COMPOSITE" or k in have) else None
        miss = [COMPONENT_LABEL[k] for k in keys if k != "COMPOSITE" and k not in have]
        if miss:
            missing[p.name] = miss
        score.append({"place": p.name, "coastal": p.coastal, "country": COUNTRY_INFO[p.country]["name"],
                      "means": {("overall" if k == "COMPOSITE" else COMPONENT_LABEL[k]): v for k, v in vals.items()}})
    ctx.step("scorecard", {"places": [p.id for p in places], "period": period}, f"window means for {len(places)} places")

    trends, lines = {}, []
    for p in places:
        if comp != "COMPOSITE" and comp not in components_of(p):
            continue
        t = trend(p, comp, YEAR, y0, y1)
        trends[p.name] = {"slope_per_decade": rnd(t["slope_per_decade"]), "p": rnd(t["p"], 3), "direction": t["direction"]}
        s = window_series(p, comp, YEAR, y0, y1)
        roll = [{"x": y, "y": rnd(mean(v for _, v in s[i - 4:i + 1])) if i >= 4 else None} for i, (y, _) in enumerate(s)]
        lines.append({"name": p.name, "points": roll})
    ctx.step("trends", {"hazard": label_of(comp), "period": period},
             "; ".join(f"{k} {v['direction']}" for k, v in trends.items()))

    convergence = None
    if len(lines) == 2:
        a = {pt["x"]: pt["y"] for pt in lines[0]["points"] if pt["y"] is not None}
        b = {pt["x"]: pt["y"] for pt in lines[1]["points"] if pt["y"] is not None}
        common = sorted(set(a) & set(b))
        if len(common) >= 2:
            g0, g1 = a[common[0]] - b[common[0]], a[common[-1]] - b[common[-1]]
            pattern = "converging" if abs(g1) < abs(g0) - 0.05 else "diverging" if abs(g1) > abs(g0) + 0.05 else "roughly parallel"
            convergence = {"start_year": common[0], "start_gap": rnd(g0), "end_year": common[-1], "end_gap": rnd(g1), "pattern": pattern}

    notes = ["Multi-year means are more reliable than single months, which are noisy."]
    if len({p.country for p in places}) > 1:
        notes.append("Places are in different countries: anomalies show how unusual conditions are against each place's own history, not absolute heat, rain or wind.")
    facts = {"period": period, "hazard_for_trend": label_of(comp), "places": score, "not_measured": missing,
             "trends": trends, "convergence": convergence}
    return Planned(NAME, places[0].country, " vs ".join(p.name for p in places),
                   f"{period} · anomalies on the {BASELINE} baseline", facts,
                   {"keys": keys, "lines": lines, "comp": comp}, notes)


def assemble(pl: Planned, n: dict) -> list[dict]:
    f, places = pl.facts, pl.facts["places"]
    rows = []
    for k in pl.data["keys"]:
        lab = "Overall index" if k == "COMPOSITE" else COMPONENT_LABEL[k]
        key = "overall" if k == "COMPOSITE" else lab
        vals = [p["means"][key] for p in places]
        row = [lab] + [v if v is not None else "Not part of the index here" for v in vals]
        if len(places) == 2:
            row.append(rnd(vals[0] - vals[1]) if None not in vals else None)
        rows.append(row)
    value_cols = list(range(1, len(places) + 1)) + ([len(places) + 1] if len(places) == 2 else [])
    c = f["convergence"]
    out = [
        {"kind": "text", "title": "Headline verdict", "body": n["headline"]},
        {"kind": "table", "title": "Side-by-side scorecard",
         "columns": ["Hazard"] + [p["place"] for p in places] + (["Difference"] if len(places) == 2 else []),
         "rows": rows, "valueCols": value_cols, "note": f"Mean anomaly over {f['period']}, on the {BASELINE} baseline."},
        {"kind": "lines", "title": "Change over time", "xLabel": "Year", "yLabel": f"{f['hazard_for_trend']}, 5-year rolling mean",
         "series": pl.data["lines"],
         "note": (f"The two places look {c['pattern']} (gap {fmt(c['start_gap'])} in {c['start_year']}, {fmt(c['end_gap'])} in {c['end_year']})."
                  if c else "Single years are noisy; 5-year rolling means are shown.")},
    ]
    if n["sections"].get("change_over_time"):
        out.append({"kind": "text", "title": "", "body": n["sections"]["change_over_time"]})
    if f["trends"]:
        out.append({"kind": "table", "title": f"Trend: {f['hazard_for_trend']}", "columns": ["Place", "Change per decade", "Trend test"],
                    "rows": [[k, v["slope_per_decade"], f"{v['direction']} (p={v['p']})"] for k, v in f["trends"].items()]})
    if n["sections"].get("why_differ"):
        out.append({"kind": "text", "title": "Why they differ", "body": n["sections"]["why_differ"]})
    miss = [f"{', '.join(m)} is not measured for {p}." for p, m in f["not_measured"].items()]
    out.append({"kind": "text", "title": "Comparison notes", "body": " ".join(pl.notes + miss)})
    return out


def template(pl: Planned) -> dict:
    ps = pl.facts["places"]
    top = max(ps, key=lambda p: p["means"]["overall"] if p["means"]["overall"] is not None else -9)
    return {"headline": f"Over {pl.facts['period']}, {top['place']} had the highest mean overall index "
                        f"({fmt(top['means']['overall'])}).", "sections": {}, "followups": []}
