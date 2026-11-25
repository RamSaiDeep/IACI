"""TREND: is a hazard rising or falling at one place?

Sen's slope per decade + Mann-Kendall test on yearly (or seasonal) values, the early (first 15 years)
vs recent (last 15 years) means, and the series for the chart.
"""

from ..compute import components_of, label_of, trend, window
from ..labels import COMPONENT_LABEL, COUNTRY_INFO, SEASONS
from ..stats import fmt, mean, rnd
from .common import HAZARD_SLOT, SEASON_SLOT, Ctx, Planned, UserError, check_year, hazard_code, nullable, obj, place_of, season_or_none, year_bounds

NAME = "trend"
SCHEMA = obj({
    "place": {"type": "string", "description": "Place name as written"},
    "hazard": HAZARD_SLOT,
    "season": SEASON_SLOT,
    "from_year": nullable("integer"), "to_year": nullable("integer"),
})
WRITER_SLOTS = {"meaning": "1-2 sentences on what the trend means in plain words, and how certain it is (use p)"}


def run(slots: dict, ctx: Ctx) -> Planned:
    p = place_of(slots.get("place"), ctx)
    comp = hazard_code(slots.get("hazard"))
    if comp != "COMPOSITE" and comp not in components_of(p):
        raise UserError(f"{COMPONENT_LABEL[comp]} is not measured for {p.name}.")
    first, _, last_full = year_bounds(p.country)
    y0, y1 = slots.get("from_year") or first, slots.get("to_year") or last_full
    check_year(y0, p.country)
    check_year(y1, p.country)
    season = season_or_none(slots.get("season"))
    win, _ = window(season)
    t = trend(p, comp, win, y0, y1)
    s = t["series"]
    if t["slope_per_decade"] is None:
        raise UserError(f"A trend needs at least 8 years of data; {y0}–{y1} has {len(s)}.")
    k = min(15, len(s) // 2)
    early, recent = s[:k], s[-k:]
    split = {"early_years": f"{early[0][0]}–{early[-1][0]}", "early_mean": rnd(mean(v for _, v in early)),
             "recent_years": f"{recent[0][0]}–{recent[-1][0]}", "recent_mean": rnd(mean(v for _, v in recent))}
    hz = label_of(comp, p.country) + (f", {SEASONS[season]['label']}" if season else "")
    ctx.step("trend_test", {"place": p.id, "hazard": label_of(comp), "years": f"{t['first_year']}–{t['last_year']}"},
             f"{t['direction']}, {fmt(t['slope_per_decade'])} per decade (p={rnd(t['p'], 3)})")
    facts = {"place": p.ref(), "hazard": hz, "years": f"{t['first_year']}–{t['last_year']}", "n_years": t["n"],
             "slope_per_decade": rnd(t["slope_per_decade"]), "p": rnd(t["p"], 3), "direction": t["direction"], **split}
    return Planned(NAME, p.country, f"{p.name}: {hz} trend",
                   f"{p.level_label}{', ' + p.parent_name if p.parent_name else ''} · {COUNTRY_INFO[p.country]['name']} · {facts['years']}",
                   facts, {"series": [{"x": y, "y": rnd(v)} for y, v in s]},
                   ["Trend test: Sen's slope with Mann-Kendall, alpha 0.05, on yearly values (does not adjust for autocorrelation)."])


def assemble(pl: Planned, n: dict) -> list[dict]:
    f = pl.facts
    out = [
        {"kind": "text", "title": "Headline", "body": n["headline"]},
        {"kind": "table", "title": "Trend result", "columns": ["Measure", "Value"],
         "rows": [["Direction", f["direction"]], ["Change per decade", f["slope_per_decade"]], ["Mann-Kendall p-value", f["p"]],
                  [f"Mean {f['early_years']}", f["early_mean"]], [f"Mean {f['recent_years']}", f["recent_mean"]],
                  ["Years used", f["n_years"]]]},
        {"kind": "lines", "title": "Year by year", "xLabel": "Year", "yLabel": f"{f['hazard']} (anomaly)",
         "series": [{"name": f["place"]["name"], "points": pl.data["series"]}]},
    ]
    if n["sections"].get("meaning"):
        out.append({"kind": "text", "title": "What it means", "body": n["sections"]["meaning"]})
    return out


def template(pl: Planned) -> dict:
    f = pl.facts
    return {"headline": f"{f['hazard']} at {f['place']['name']}: {f['direction']}, {fmt(f['slope_per_decade'])} per decade "
                        f"over {f['years']} (p = {f['p']}).", "sections": {}, "followups": []}
