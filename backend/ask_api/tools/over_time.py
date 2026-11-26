"""One place over time.

    get_series         year-by-year values for one hazard (also the line chart)
    get_trend          is it going up or down: change per decade, earlier vs recent averages
    compare_periods    two periods at one place (e.g. 2011–2020 vs 1991–2000)
    count_exceedances  how many months were above/below a value, and when it last happened
"""

from __future__ import annotations

from ..compute import components_of, label_of, period_mean, window_series
from ..labels import COMPONENT_LABEL, MONTH_NAMES
from ..stats import rnd, simple_trend
from .context import SCORE, ToolContext, ToolError, hazard_arg, period_arg, place_arg, name_of


def _hazard_at(p, hazard: str) -> str:
    comp = hazard_arg(hazard)
    if comp != "COMPOSITE" and comp not in components_of(p):
        raise ToolError(f"{COMPONENT_LABEL[comp]} is not measured at {p.name}.")
    return comp


def get_series(ctx: ToolContext, place_id: str, hazard: str = "composite", period: dict | None = None) -> dict:
    p = place_arg(place_id)
    comp = _hazard_at(p, hazard)
    per = period_arg(p.country, period, default="whole_record")
    s = window_series(p, comp, per.window, per.y0, per.y1)
    if not s:
        raise ToolError(f"No {name_of(comp, p.country)} data for {p.name} in {per.label}.")
    hi, lo = max(s, key=lambda t: t[1]), min(s, key=lambda t: t[1])
    rid = ctx.lines(f"{p.name}: {name_of(comp, p.country)}, {per.label}",
                    f"{label_of(comp, p.country)}, {per.window_label.lower()} ({SCORE.lower()})",
                    [{"name": p.name, "points": [{"x": y, "y": rnd(v)} for y, v in s]}])
    return {"place": p.name, "hazard": label_of(comp, p.country), "period": per.label,
            "values": [{"year": y, "value": rnd(v)} for y, v in s],
            "highest": {"year": hi[0], "value": rnd(hi[1])}, "lowest": {"year": lo[0], "value": rnd(lo[1])},
            "show": [rid]}


def get_trend(ctx: ToolContext, place_id: str, hazard: str = "composite", period: dict | None = None) -> dict:
    p = place_arg(place_id)
    comp = _hazard_at(p, hazard)
    per = period_arg(p.country, period, default="whole_record")
    s = window_series(p, comp, per.window, per.y0, per.y1)
    t = simple_trend(s)
    if t["slope_per_decade"] is None:
        raise ToolError(f"A trend needs at least 8 years; {per.label} has {t['n']}. Use a longer range.")
    # Straight line drawn from the fitted slope, so the chart shows what the numbers say.
    mx = sum(y for y, _ in s) / len(s)
    my = sum(v for _, v in s) / len(s)
    fit = [{"x": y, "y": rnd(my + t["slope_per_decade"] / 10 * (y - mx))} for y, _ in s]
    rid = ctx.lines(f"{p.name}: {name_of(comp, p.country)} trend, {per.label}",
                    f"{label_of(comp, p.country)}, {per.window_label.lower()} ({SCORE.lower()})",
                    [{"name": p.name, "points": [{"x": y, "y": rnd(v)} for y, v in s]},
                     {"name": "Straight-line trend", "points": fit}])
    table = ctx.table(f"Trend: {name_of(comp, p.country)} at {p.name}", ["Measure", "Value"], [
        ["Change per decade", rnd(t["slope_per_decade"])],
        [f"Average {t['early_years']}", rnd(t["early_mean"])],
        [f"Average {t['recent_years']}", rnd(t["recent_mean"])],
        ["Direction", t["direction"]], ["Years used", t["n"]]], [1])
    return {"place": p.name, "hazard": label_of(comp, p.country), "period": per.label,
            "change_per_decade": rnd(t["slope_per_decade"]), "direction": t["direction"],
            "early": {"years": t["early_years"], "average": rnd(t["early_mean"])},
            "recent": {"years": t["recent_years"], "average": rnd(t["recent_mean"])},
            "years_used": t["n"], "show": [rid, table]}


def compare_periods(ctx: ToolContext, place_id: str, period_a: dict, period_b: dict, hazard: str = "composite") -> dict:
    p = place_arg(place_id)
    comp = _hazard_at(p, hazard)
    a, b = period_arg(p.country, period_a), period_arg(p.country, period_b)
    out = []
    for per in (a, b):
        v = period_mean(p, comp, per.window, per.y0, per.y1)
        if v is None:
            raise ToolError(f"No {name_of(comp, p.country)} data for {p.name} in {per.label}.")
        out.append({"period": per.label, "average": rnd(v)})
    diff = rnd(out[1]["average"] - out[0]["average"])
    rid = ctx.table(f"{p.name}: {name_of(comp, p.country)}, {a.label} vs {b.label}",
                    ["Period", f"Average {SCORE.lower()}"], [[o["period"], o["average"]] for o in out] + [["Difference (second − first)", diff]],
                    [1])
    return {"place": p.name, "hazard": label_of(comp, p.country), "first": out[0], "second": out[1],
            "difference": diff, "show": [rid]}


def count_exceedances(ctx: ToolContext, place_id: str, threshold: float, above: bool = True,
                      hazard: str = "composite", period: dict | None = None) -> dict:
    p = place_arg(place_id)
    comp = _hazard_at(p, hazard)
    per = period_arg(p.country, period, default="whole_record")
    months = [(ym, p.value(comp, ym)) for ym in p.periods if per.y0 <= ym // 100 <= per.y1
              and (per.whole_year or any(m == ym % 100 for _, m in per.window))]
    hits = [(ym, v) for ym, v in months if v is not None and (v > threshold if above else v < threshold)]
    word = "above" if above else "below"
    by_year: dict[int, int] = {}
    for ym, _ in hits:
        by_year[ym // 100] = by_year.get(ym // 100, 0) + 1
    last = hits[-1] if hits else None
    rid = ctx.bars(f"{p.name}: months with {name_of(comp, p.country)} {word} {threshold:+g}, per year",
                   "months", [{"label": str(y), "value": n} for y, n in sorted(by_year.items())],
                   note=f"{len(hits)} of {len(months)} months in {per.label}.") if hits else None
    return {"place": p.name, "hazard": label_of(comp, p.country), "period": per.label,
            "condition": f"{word} {threshold:+g}", "months_meeting_it": len(hits), "months_checked": len(months),
            "years_with_any": sorted(by_year),
            "most_recent": ({"month": f"{MONTH_NAMES[last[0] % 100 - 1]} {last[0] // 100}", "value": rnd(last[1])}
                            if last else None),
            "show": [rid] if rid else []}
