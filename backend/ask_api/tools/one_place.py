"""One place, one period.

    get_snapshot       how a place did in a year, season or month, hazard by hazard, ranked against all years
    get_extremes       its most extreme months or years on record
    get_month_profile  month by month within one year, and the worst month
"""

from __future__ import annotations

from ..compute import components_of, contribution, label_of, ranked, window_series
from ..labels import COMPONENT_LABEL, COUNTRY_INFO, MONTH_NAMES
from ..stats import rank_highest, rnd, severity, standing
from .context import SCORE, SCORE_NOTE, ToolContext, what_it_measures, ToolError, hazard_arg, name_of, period_arg, place_arg


def get_snapshot(ctx: ToolContext, place_id: str, period: dict | None = None) -> dict:
    p = place_arg(place_id)
    per = period_arg(p.country, period)
    if not per.single:
        raise ToolError("get_snapshot covers one year, season or month. For a range of years use "
                        "get_series, get_trend or compare_periods.")
    year = per.y0
    overall = ranked(p, "COMPOSITE", year, per.window)
    hazards, not_measured = [], []
    for c in COUNTRY_INFO[p.country]["components"]:
        r = ranked(p, c, year, per.window) if c in components_of(p) else None
        if r:
            hazards.append({"hazard": COMPONENT_LABEL[c], "value": rnd(r["value"]), "level": severity(r["value"]),
                            "compared_with_other_years": standing(r["rank"], r["n_years"]),
                            "rank": r["rank"], "of_years": r["n_years"],
                            "pushes_overall_by": rnd(contribution(p, c, r["value"])) if overall else None})
        else:
            not_measured.append(COMPONENT_LABEL[c])
    if not overall and not hazards:
        raise ToolError(f"There is no data for {p.name} for {per.label}.")

    rows = []
    if overall:
        rows.append(["Overall index (all hazards)", rnd(overall["value"]), severity(overall["value"]),
                     standing(overall["rank"], overall["n_years"])])
    rows += [[h["hazard"], h["value"], h["level"], h["compared_with_other_years"]] for h in hazards]
    rows += [[m, None, "Not measured here", "—"] for m in not_measured]
    span = "year" if per.whole_year else per.window_label.lower()
    card = ctx.table(f"{p.name}: {per.label}", ["Hazard", SCORE, "Level", f"Compared with every {span} since 1991"],
                     rows, [1], note=SCORE_NOTE)
    comp = "COMPOSITE" if overall else next(c for c in components_of(p) if COMPONENT_LABEL[c] == hazards[0]["hazard"])
    chart = ctx.lines(f"{p.name}: {name_of(comp, p.country)}, every year",
                      f"{label_of(comp, p.country)}, {per.window_label.lower()} ({SCORE.lower()})",
                      [{"name": p.name, "points": [{"x": y, "y": rnd(v)} for y, v in window_series(p, comp, per.window)]}],
                      marker=year)
    return {"place": p.name, "period": per.label, "partial": per.partial, "note": per.note,
            "overall": ({"value": rnd(overall["value"]), "level": severity(overall["value"]),
                         "compared_with_other_years": standing(overall["rank"], overall["n_years"]),
                         "rank": overall["rank"], "of_years": overall["n_years"]} if overall else None),
            "hazards": hazards, "not_measured": not_measured,
            "what_hazards_measure": {COMPONENT_LABEL[c]: what_it_measures(c) for c in components_of(p)},
            "show": [card, chart]}


def get_extremes(ctx: ToolContext, place_id: str, hazard: str = "composite", unit: str = "month",
                 order: str = "highest", top_n: int = 5, season: str | None = None) -> dict:
    p = place_arg(place_id)
    comp = hazard_arg(hazard)
    if comp != "COMPOSITE" and comp not in components_of(p):
        raise ToolError(f"{COMPONENT_LABEL[comp]} is not measured at {p.name}.")
    top_n = max(1, min(int(top_n or 5), 20))
    if unit == "year":
        per = period_arg(p.country, {"season": season}, default="whole_record")
        items = [(str(y), v) for y, v in window_series(p, comp, per.window)]
        what = per.window_label.lower() if season else "years"
    else:
        items = [(f"{MONTH_NAMES[ym % 100 - 1]} {ym // 100}", p.value(comp, ym)) for ym in p.periods]
        items = [(k, v) for k, v in items if v is not None]
        what = "months"
    if not items:
        raise ToolError(f"No {name_of(comp, p.country)} data for {p.name}.")
    items.sort(key=lambda kv: kv[1], reverse=order != "lowest")
    top = [{"when": k, "value": rnd(v), "level": severity(v)} for k, v in items[:top_n]]
    word = "lowest" if order == "lowest" else "highest"
    rid = ctx.table(f"{p.name}: {word} {what} for {name_of(comp, p.country)}",
                    ["#", "When", SCORE, "Level"], [[i + 1, t["when"], t["value"], t["level"]] for i, t in enumerate(top)],
                    [2], note=f"The {len(top)} {word} of {len(items)} {what} since 1991. {SCORE_NOTE}")
    return {"place": p.name, "hazard": label_of(comp, p.country), "unit": unit, "order": word,
            "out_of": len(items), "top": top, "what_it_measures": what_it_measures(comp), "show": [rid]}


def get_month_profile(ctx: ToolContext, place_id: str, year: int, hazard: str = "composite") -> dict:
    p = place_arg(place_id)
    comp = hazard_arg(hazard)
    if comp != "COMPOSITE" and comp not in components_of(p):
        raise ToolError(f"{COMPONENT_LABEL[comp]} is not measured at {p.name}.")
    period_arg(p.country, {"year": year})  # checks the year is in the data
    months = []
    for m in range(1, 13):
        v = p.value(comp, year * 100 + m)
        if v is None:
            continue
        same_month = [x for x in (p.value(comp, ym) for ym in p.periods if ym % 100 == m) if x is not None]
        rank = rank_highest(v, same_month)
        months.append({"month": MONTH_NAMES[m - 1], "value": rnd(v), "level": severity(v),
                       "compared_with_same_month": standing(rank, len(same_month), f"{MONTH_NAMES[m - 1]}s"),
                       "rank_among_same_month": rank, "of_years": len(same_month)})
    if not months:
        raise ToolError(f"No data for {p.name} in {year}.")
    worst = max(months, key=lambda r: r["value"])
    rid = ctx.bars(f"{p.name}: {name_of(comp, p.country)}, month by month in {year}", SCORE.lower(),
                   [{"label": r["month"], "value": r["value"], "highlight": r is worst} for r in months])
    table = ctx.table(f"{p.name} {year}: each month against the same month in other years",
                      ["Month", SCORE, "Level", "Compared with the same month since 1991"],
                      [[r["month"], r["value"], r["level"], r["compared_with_same_month"]] for r in months], [1],
                      note=SCORE_NOTE)
    return {"place": p.name, "year": year, "hazard": label_of(comp, p.country), "months": months,
            "highest_month": worst["month"], "what_it_measures": what_it_measures(comp), "show": [rid, table]}
