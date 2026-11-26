"""One place, one period.

    get_snapshot       how a place did in a year, season or month, hazard by hazard, ranked against all years
    get_extremes       its most extreme months or years on record
    get_month_profile  month by month within one year, and the worst month
"""

from __future__ import annotations

from ..compute import components_of, contribution, label_of, ranked, window_series
from ..labels import COMPONENT_LABEL, COUNTRY_INFO, MONTH_NAMES
from ..stats import rank_highest, rnd, severity
from .context import ToolContext, ToolError, hazard_arg, period_arg, place_arg, name_of


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
            hazards.append({"hazard": COMPONENT_LABEL[c], "value": rnd(r["value"]), "rank": r["rank"],
                            "of_years": r["n_years"], "level": severity(r["value"]),
                            "pushes_overall_by": rnd(contribution(p, c, r["value"])) if overall else None})
        else:
            not_measured.append(COMPONENT_LABEL[c])
    if not overall and not hazards:
        raise ToolError(f"There is no data for {p.name} for {per.label}.")

    rows = []
    if overall:
        rows.append(["Overall index", rnd(overall["value"]), f"{overall['rank']} of {overall['n_years']}",
                     severity(overall["value"])])
    rows += [[h["hazard"], h["value"], f"{h['rank']} of {h['of_years']}", h["level"]] for h in hazards]
    rows += [[m, None, "—", "Not measured here"] for m in not_measured]
    card = ctx.table(f"{p.name}: {per.label}", ["Hazard", "Anomaly", "Rank (1 = highest)", "Level"], rows, [1],
                     note=f"Ranked against the same {'months' if per.whole_year else per.window_label.lower()} "
                          f"in every year of the record.")
    comp = "COMPOSITE" if overall else next(c for c in components_of(p) if COMPONENT_LABEL[c] == hazards[0]["hazard"])
    chart = ctx.lines(f"{p.name}: {name_of(comp, p.country)}, every year",
                      f"{label_of(comp, p.country)}, {per.window_label.lower()} (anomaly)",
                      [{"name": p.name, "points": [{"x": y, "y": rnd(v)} for y, v in window_series(p, comp, per.window)]}],
                      marker=year)
    return {"place": p.name, "period": per.label, "partial": per.partial, "note": per.note,
            "overall": ({"value": rnd(overall["value"]), "rank": overall["rank"], "of_years": overall["n_years"],
                         "level": severity(overall["value"])} if overall else None),
            "hazards": hazards, "not_measured": not_measured, "show": [card, chart]}


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
                    ["Rank", "When", "Anomaly", "Level"], [[i + 1, t["when"], t["value"], t["level"]] for i, t in enumerate(top)],
                    [2], note=f"Out of {len(items)} {what} in the record.")
    return {"place": p.name, "hazard": label_of(comp, p.country), "unit": unit, "order": word,
            "out_of": len(items), "top": top, "show": [rid]}


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
        months.append({"month": MONTH_NAMES[m - 1], "value": rnd(v), "level": severity(v),
                       "rank_among_same_month": rank_highest(v, same_month), "of_years": len(same_month)})
    if not months:
        raise ToolError(f"No data for {p.name} in {year}.")
    worst = max(months, key=lambda r: r["value"])
    rid = ctx.bars(f"{p.name}: {name_of(comp, p.country)}, month by month in {year}", "z-score",
                   [{"label": r["month"], "value": r["value"], "highlight": r is worst} for r in months])
    table = ctx.table(f"{p.name} {year}: each month against the same month in other years",
                      ["Month", "Anomaly", "Rank among same month", "Level"],
                      [[r["month"], r["value"], f"{r['rank_among_same_month']} of {r['of_years']}", r["level"]] for r in months], [1])
    return {"place": p.name, "year": year, "hazard": label_of(comp, p.country), "months": months,
            "highest_month": worst["month"], "show": [rid, table]}
