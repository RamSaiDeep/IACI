"""Many places at once. `within` is a place id from find_place (a state, or a whole country);
without it, the country selected on the page.

    list_places        the set to look at: districts of a state, coastal only, all states
    rank_places        order places by a hazard, by value or by change per decade
    filter_places      every place meeting one or more conditions (value above/below, record month or year)
    compare_to_parent  districts against their own state
    spread_within      how a state's districts differ: highest, lowest, middle
"""

from __future__ import annotations

from ..compute import components_of, label_of, period_mean, ranked, window_series
from ..data import Place, load_country
from ..labels import COUNTRY_INFO
from ..stats import rnd, simple_trend
from .context import OWN_NORMAL_NOTE, SCORE, Period, what_it_measures, ToolContext, ToolError, hazard_arg, period_arg, place_arg, name_of

LEVELS = {"district": "child", "county": "child", "state": "top", "province": "top", "nation": "top"}
OPS = {">": lambda v, t: v > t, ">=": lambda v, t: v >= t, "<": lambda v, t: v < t, "<=": lambda v, t: v <= t}


# ---------------------------------------------------------------- shared

def _scope(ctx: ToolContext, within: str | None) -> tuple[str, Place | None]:
    """(country, region or None for the whole country)."""
    if not within:
        return ctx.country, None
    w = place_arg(within)
    if w.level == "child":
        raise ToolError(f"{w.name} is a {w.level_label.lower()}; `within` must be a state/province or a country.")
    return w.country, (None if w.level == "country" else w)


def _pool(country: str, region: Place | None, level: str | None, coastal: bool | None, comp: str) -> list[Place]:
    lvl = LEVELS.get((level or "district").lower(), "child")
    if region and lvl == "top":
        raise ToolError(f"{region.name} is itself a {region.level_label.lower()}; rank its districts instead.")
    return [p for p in load_country(country).places.values()
            if p.level == lvl and (not region or p.parent_id == region.id)
            and (coastal is None or p.coastal == coastal)
            and (comp == "COMPOSITE" or comp in components_of(p))]


def _value(p: Place, comp: str, per: Period) -> float | None:
    """One period: the period's value (an unfinished year uses the months it has). A range: the mean."""
    if per.single:
        r = ranked(p, comp, per.y0, per.window)
        return r["value"] if r else None
    return period_mean(p, comp, per.window, per.y0, per.y1)


def _scope_label(country: str, region: Place | None, coastal: bool | None, level: str | None) -> str:
    plural = {"top": COUNTRY_INFO[country]["top_label"], "child": COUNTRY_INFO[country]["child_label"]}[
        LEVELS.get((level or "district").lower(), "child")].lower() + "s"
    where = region.name if region else COUNTRY_INFO[country]["name"]
    return f"{'coastal ' if coastal else 'inland ' if coastal is False else ''}{plural} in {where}"


def _row(p: Place, value: float | None, **extra) -> dict:
    return {"place": p.name, "id": p.id, "parent": p.parent_name, "value": rnd(value), **extra}


# ---------------------------------------------------------------- tools

def list_places(ctx: ToolContext, within: str | None = None, level: str = "district", coastal: bool | None = None) -> dict:
    country, region = _scope(ctx, within)
    pool = _pool(country, region, level, coastal, "COMPOSITE")
    names = sorted(p.name for p in pool)
    return {"scope": _scope_label(country, region, coastal, level), "count": len(pool),
            "places": [{"name": p.name, "id": p.id, "coastal": p.coastal} for p in sorted(pool, key=lambda p: p.name)]
            if len(pool) <= 60 else names[:60], "truncated": len(pool) > 60}


def rank_places(ctx: ToolContext, hazard: str = "composite", period: dict | None = None, within: str | None = None,
                level: str = "district", coastal: bool | None = None, by: str = "value", order: str = "highest",
                limit: int = 10) -> dict:
    country, region = _scope(ctx, within)
    comp = hazard_arg(hazard)
    per = period_arg(country, period, default="whole_record" if by == "change" else "last_complete_year")
    rows = []
    for p in _pool(country, region, level, coastal, comp):
        if by == "change":
            t = simple_trend(window_series(p, comp, per.window, per.y0, per.y1))
            if t["slope_per_decade"] is not None:
                rows.append(_row(p, t["slope_per_decade"], direction=t["direction"]))
        else:
            v = _value(p, comp, per)
            if v is not None:
                rows.append(_row(p, v))
    if not rows:
        raise ToolError(f"No places with {name_of(comp, country)} data for {per.label}"
                        + (" (a change needs at least 8 years)." if by == "change" else "."))
    rows.sort(key=lambda r: r["value"], reverse=order != "lowest")
    limit = max(1, min(int(limit or 10), 25))
    top = [{"rank": i + 1, **r} for i, r in enumerate(rows[:limit])]
    scope = _scope_label(country, region, coastal, level)
    unit = "score change per decade" if by == "change" else SCORE.lower()
    measure = (f"Change per decade in {name_of(comp, country)}, {per.label}" if by == "change"
               else f"{label_of(comp, country)}, {per.label}" + ("" if per.single else " (average of the years)"))
    table = ctx.table(f"{measure}: {scope}", ["#", "Place", "Within", "Change per decade" if by == "change" else SCORE],
                      [[r["rank"], r["place"], r["parent"] or "", r["value"]] for r in top], [] if by == "change" else [3],
                      note=f"{len(rows)} places ranked.")
    bars = ctx.bars(measure, unit, [{"label": r["place"], "sub": r["parent"], "value": r["value"]} for r in top])
    return {"measure": measure, "scope": scope, "ranked": len(rows), "order": order, "top": top,
            "partial": per.partial, "note": per.note, "what_it_measures": what_it_measures(comp),
            "how_to_read": OWN_NORMAL_NOTE, "show": [table, bars]}


def filter_places(ctx: ToolContext, conditions: list[dict], period: dict | None = None, within: str | None = None,
                  level: str = "district", coastal: bool | None = None) -> dict:
    """conditions: [{"hazard", "op": ">"|">="|"<"|"<=", "value"}] or [{"hazard", "record": true}]; all must hold.
    A record condition means the period was the highest on record at that place (one year/season/month only)."""
    if not conditions:
        raise ToolError("Give at least one condition, e.g. {hazard: 'drought', op: '>', value: 1.5}.")
    country, region = _scope(ctx, within)
    per = period_arg(country, period)
    checks = []
    for c in conditions:
        comp = hazard_arg(c.get("hazard"))
        if c.get("record"):
            if not per.single:
                raise ToolError("A record condition needs one year, season or month, not a range.")
            checks.append((comp, "record", None))
        else:
            if c.get("op") not in OPS or not isinstance(c.get("value"), (int, float)):
                raise ToolError("Each condition needs op ('>', '>=', '<', '<=') and a numeric value.")
            checks.append((comp, c["op"], float(c["value"])))
    pool = [p for p in _pool(country, region, level, coastal, "COMPOSITE")
            if all(comp == "COMPOSITE" or comp in components_of(p) for comp, _, _ in checks)]
    matches = []
    for p in pool:
        vals, ok = {}, True
        for comp, op, t in checks:
            if op == "record":
                r = ranked(p, comp, per.y0, per.window)
                ok = bool(r) and r["rank"] == 1
                v = r["value"] if r else None
            else:
                v = _value(p, comp, per)
                ok = v is not None and OPS[op](v, t)
            vals[label_of(comp, country)] = rnd(v)
            if not ok:
                break
        if ok:
            matches.append({"place": p.name, "id": p.id, "parent": p.parent_name, "values": vals})
    labels = [label_of(comp, country) for comp, _, _ in checks]
    described = " and ".join(f"{name_of(comp, country)} " + ("at a record high" if op == "record" else f"{op} {t:+g}")
                             for comp, op, t in checks)
    first = labels[0]
    matches.sort(key=lambda m: m["values"].get(first) or 0, reverse=True)
    rid = ctx.table(f"{_scope_label(country, region, coastal, level).capitalize()} with {described}, {per.label}",
                    ["Place", "Within", *labels], [[m["place"], m["parent"] or "", *[m["values"].get(l) for l in labels]]
                                                   for m in matches[:50]],
                    list(range(2, 2 + len(labels))), note=f"{len(matches)} of {len(pool)} places match.")
    return {"scope": _scope_label(country, region, coastal, level), "period": per.label, "condition": described,
            "matching": len(matches), "checked": len(pool), "places": matches[:25], "truncated": len(matches) > 25,
            "show": [rid] if matches else []}


def compare_to_parent(ctx: ToolContext, within: str, hazard: str = "composite", period: dict | None = None) -> dict:
    country, region = _scope(ctx, within)
    if not region:
        raise ToolError("compare_to_parent needs a state or province in `within`.")
    comp = hazard_arg(hazard)
    per = period_arg(country, period)
    parent_v = _value(region, comp, per)
    if parent_v is None:
        raise ToolError(f"No {name_of(comp, country)} value for {region.name} in {per.label}.")
    rows = []
    for p in _pool(country, region, "district", None, comp):
        v = _value(p, comp, per)
        if v is not None:
            rows.append(_row(p, v, difference=rnd(v - parent_v)))
    rows.sort(key=lambda r: r["difference"], reverse=True)
    above = [r for r in rows if r["difference"] > 0]
    rid = ctx.table(f"{COUNTRY_INFO[country]['child_label']}s of {region.name} against the {region.level_label.lower()}, "
                    f"{name_of(comp, country)}, {per.label}",
                    ["Place", SCORE, f"Difference from {region.name}"],
                    [[region.name + " (whole)", rnd(parent_v), 0]] + [[r["place"], r["value"], r["difference"]] for r in rows],
                    [1], highlight_row=0)
    return {"parent": region.name, "parent_value": rnd(parent_v), "period": per.label, "hazard": label_of(comp, country),
            "districts": len(rows), "above_parent": len(above), "most_above": rows[:5], "most_below": rows[-3:][::-1],
            "show": [rid]}


def spread_within(ctx: ToolContext, within: str, hazard: str = "composite", period: dict | None = None) -> dict:
    country, region = _scope(ctx, within)
    comp = hazard_arg(hazard)
    per = period_arg(country, period)
    vals = sorted(((v, p) for p in _pool(country, region, "district", None, comp)
                   if (v := _value(p, comp, per)) is not None), key=lambda t: t[0], reverse=True)
    if len(vals) < 2:
        raise ToolError(f"Not enough places with data in {region.name if region else country} for {per.label}.")
    middle = vals[len(vals) // 2][0]
    where = region.name if region else COUNTRY_INFO[country]["name"]
    rid = ctx.bars(f"{label_of(comp, country)} across {where}, {per.label}", SCORE.lower(),
                   [{"label": p.name, "value": rnd(v)} for v, p in vals[:30]],
                   note=f"{len(vals)} places" + ("; top 30 shown." if len(vals) > 30 else "."))
    return {"scope": where, "hazard": label_of(comp, country), "period": per.label, "places": len(vals),
            "highest": [_row(p, v) for v, p in vals[:3]], "lowest": [_row(p, v) for v, p in vals[-3:][::-1]],
            "middle_value": rnd(middle), "range": rnd(vals[0][0] - vals[-1][0]), "show": [rid]}
