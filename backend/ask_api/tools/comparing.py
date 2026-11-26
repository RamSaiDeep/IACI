"""Comparing places.

    compare_places  2–4 places side by side, any levels, any countries (each against its own history)
    neighbours      the places around one place, and its state, for the same period
"""

from __future__ import annotations

from ..compute import components_of, label_of, neighbours as nearby, period_mean, ranked, window_series
from ..data import get_place
from ..labels import COMPONENT_CODES, COMPONENT_LABEL, COUNTRY_INFO
from ..stats import mean, rnd, simple_trend
from .context import ToolContext, ToolError, hazard_arg, name_of, period_arg, place_arg


def compare_places(ctx: ToolContext, place_ids: list[str], hazard: str = "composite", period: dict | None = None) -> dict:
    ids = list(dict.fromkeys(place_ids or []))
    if not 2 <= len(ids) <= 4:
        raise ToolError("compare_places needs 2 to 4 different place ids.")
    places = [place_arg(i) for i in ids]
    comp = hazard_arg(hazard)
    # Years every place has; the period is checked against the first place's country.
    per = period_arg(places[0].country, period, default="whole_record")
    y0 = max(per.y0, *(min(p.periods) // 100 for p in places))
    y1 = min(per.y1, *(max(p.periods) // 100 for p in places))
    label = per.label if (y0, y1) == (per.y0, per.y1) else f"{y0}–{y1}"

    hazards = ["COMPOSITE"] + [c for c in COMPONENT_CODES if any(c in components_of(p) for p in places)]
    score, trends, lines = [], [], []
    for p in places:
        have = components_of(p)
        # Plain "Overall index" key: the code differs by country (IACI, NACI...), the table rows must line up.
        means = {"Overall index" if h == "COMPOSITE" else COMPONENT_LABEL[h]:
                 rnd(period_mean(p, h, per.window, y0, y1)) if h == "COMPOSITE" or h in have else None for h in hazards}
        score.append({"place": p.name, "country": COUNTRY_INFO[p.country]["name"], "coastal": p.coastal, "averages": means})
        if comp == "COMPOSITE" or comp in have:
            s = window_series(p, comp, per.window, y0, y1)
            t = simple_trend(s)
            trends.append({"place": p.name, "change_per_decade": rnd(t["slope_per_decade"]), "direction": t["direction"]})
            roll = [{"x": y, "y": rnd(mean(v for _, v in s[i - 4:i + 1])) if i >= 4 else None} for i, (y, _) in enumerate(s)]
            lines.append({"name": p.name, "points": roll})

    # Which hazards differ most between the places (largest gap in averages).
    gaps = []
    for h in hazards[1:]:
        vals = [s["averages"][COMPONENT_LABEL[h]] for s in score if s["averages"][COMPONENT_LABEL[h]] is not None]
        if len(vals) >= 2:
            gaps.append({"hazard": COMPONENT_LABEL[h], "gap": rnd(max(vals) - min(vals))})
    gaps.sort(key=lambda g: g["gap"], reverse=True)

    cols = ["Hazard", *[p.name for p in places]]
    rows = [[k, *[s["averages"][k] for s in score]] for k in score[0]["averages"]]
    table = ctx.table(f"{' vs '.join(p.name for p in places)}: averages, {label}", cols, rows,
                      list(range(1, len(places) + 1)), note="Each place against its own 1991–2020 normal.")
    chart = ctx.lines(f"{label_of(comp, places[0].country)}: 5-year rolling average, {label}",
                      f"{label_of(comp, places[0].country)}, 5-year rolling average", lines) if lines else None
    trend_table = ctx.table(f"Change per decade in {name_of(comp, places[0].country)}, {label}",
                            ["Place", "Change per decade", "Direction"],
                            [[t["place"], t["change_per_decade"], t["direction"]] for t in trends]) if trends else None
    notes = []
    if len({p.country for p in places}) > 1:
        notes.append("The places are in different countries: values show how unusual conditions were against each "
                     "place's own history, not absolute heat, rain or wind.")
    if any(len(components_of(p)) != len(components_of(places[0])) for p in places):
        notes.append("Not every hazard is measured at every place (sea level only on coasts), so overall indices "
                     "average different numbers of hazards.")
    return {"places": score, "period": label, "trend_hazard": label_of(comp, places[0].country), "trends": trends,
            "differ_most": gaps[:3], "notes": notes, "show": [r for r in (table, chart, trend_table) if r]}


def neighbours(ctx: ToolContext, place_id: str, period: dict | None = None, hazard: str = "composite") -> dict:
    p = place_arg(place_id)
    comp = hazard_arg(hazard)
    per = period_arg(p.country, period)
    if not per.single:
        raise ToolError("neighbours compares one year, season or month.")
    group = [(p, "This place")] + [(q, "Neighbour") for q in nearby(p)]
    if p.parent_id and (parent := get_place(p.parent_id)):
        group.append((parent, f"Its {parent.level_label.lower()}"))
    rows = []
    for q, role in group:
        r = ranked(q, comp, per.y0, per.window) if comp == "COMPOSITE" or comp in components_of(q) else None
        rows.append({"place": q.name, "role": role, "value": rnd(r["value"]) if r else None,
                     "rank_in_own_record": f"{r['rank']} of {r['n_years']}" if r else None})
    if rows[0]["value"] is None:
        raise ToolError(f"No {name_of(comp, p.country)} value for {p.name} in {per.label}.")
    rid = ctx.table(f"{p.name} and the places around it: {name_of(comp, p.country)}, {per.label}",
                    ["Place", "Relation", "Anomaly", "Rank in its own record"],
                    [[r["place"], r["role"], r["value"], r["rank_in_own_record"] or "—"] for r in rows], [2], highlight_row=0)
    return {"place": p.name, "period": per.label, "hazard": label_of(comp, p.country), "places": rows, "show": [rid]}


