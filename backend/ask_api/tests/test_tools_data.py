"""Data, explain and registry tools, on the real published data (no model, no network)."""

import asyncio
import json
import re

import pytest

from ask_api.config import REPO_DIR
from ask_api.data import load_country
from ask_api.labels import COMPOSITE_FORMULA, COUNTRY_INFO
from ask_api.stats import severity, simple_trend
from ask_api.tools import comparing, explain, many_places, one_place, over_time
from ask_api.tools.context import ToolContext, ToolError
from ask_api.tools.registry import BY_NAME, TOOLS, call_tool

MUMBAI = "india/district/MAHARASHTRA/MUMBAI"
CHENNAI = "india/district/TAMIL NADU/CHENNAI"
KOLKATA = "india/district/WEST BENGAL/KOLKATA"
DELHI = "india/state/DELHI"
KERALA = "india/state/KERALA"


@pytest.fixture
def ctx():
    return ToolContext("india")


def shown(ctx, out):
    """Every result id a tool returns must point at a section our code built."""
    assert out["show"] and all(r in ctx.results for r in out["show"])
    return [ctx.results[r] for r in out["show"]]


# ---------------------------------------------------------------- one place

def test_snapshot_year_has_overall_hazards_and_chart(ctx):
    out = one_place.get_snapshot(ctx, MUMBAI, {"year": 2024})
    assert out["period"] == "2024" and out["overall"]["of_years"] >= 30 and len(out["hazards"]) == 6
    table, chart = shown(ctx, out)
    assert table["kind"] == "table" and chart["kind"] == "lines" and chart["marker"] == 2024


def test_snapshot_refuses_a_range(ctx):
    with pytest.raises(ToolError, match="one year"):
        one_place.get_snapshot(ctx, MUMBAI, {"from_year": 2015, "to_year": 2020})


def test_extremes_and_month_profile(ctx):
    top = one_place.get_extremes(ctx, CHENNAI, "rainfall", "month", top_n=3)["top"]
    assert len(top) == 3 and top[0]["value"] >= top[1]["value"] >= top[2]["value"]
    prof = one_place.get_month_profile(ctx, DELHI, 2024, "heat")
    assert len(prof["months"]) == 12 and prof["highest_month"] in [m["month"] for m in prof["months"]]


def test_sea_level_not_measured_inland(ctx):
    with pytest.raises(ToolError, match="not measured"):
        one_place.get_extremes(ctx, DELHI, "sea level")


# ---------------------------------------------------------------- over time

def test_simple_trend_on_a_known_line():
    t = simple_trend([(y, 0.05 * (y - 2000)) for y in range(2000, 2020)])
    assert round(t["slope_per_decade"], 6) == 0.5 and t["direction"] == "rising"
    assert simple_trend([(2000, 1.0)] * 3)["slope_per_decade"] is None


def test_trend_series_periods_exceedances(ctx):
    t = over_time.get_trend(ctx, DELHI, "heat")
    assert t["direction"] in ("rising", "falling", "little change") and t["years_used"] >= 30
    assert len(shown(ctx, t)[0]["series"]) == 2  # values + straight-line trend
    s = over_time.get_series(ctx, DELHI, "heat", {"season": "summer"})
    assert "Summer" in s["period"] and len(s["values"]) >= 30
    c = over_time.compare_periods(ctx, KERALA, {"from_year": 1991, "to_year": 2000}, {"from_year": 2011, "to_year": 2020})
    assert c["difference"] == round(c["second"]["average"] - c["first"]["average"], 2)
    e = over_time.count_exceedances(ctx, "india/state/ODISHA", 1.5, True, "wind")
    assert e["months_meeting_it"] >= 1 and e["most_recent"]["value"] > 1.5


def test_trend_needs_eight_years(ctx):
    with pytest.raises(ToolError, match="8 years"):
        over_time.get_trend(ctx, DELHI, "heat", {"from_year": 2020, "to_year": 2024})


# ---------------------------------------------------------------- many places

def test_list_and_rank(ctx):
    assert many_places.list_places(ctx, KERALA)["count"] == 14
    r = many_places.rank_places(ctx, "drought", {"year": 2024}, "india/state/RAJASTHAN", limit=5)
    vals = [t["value"] for t in r["top"]]
    assert len(vals) == 5 and vals == sorted(vals, reverse=True) and all(t["parent"] == "Rajasthan" for t in r["top"])
    coastal = many_places.rank_places(ctx, "sea level", {"year": 2023}, coastal=True, limit=3)
    assert coastal["ranked"] > 50


def test_filter_conditions_all_hold(ctx):
    r = many_places.filter_places(ctx, [{"hazard": "heat", "op": ">", "value": 1}, {"hazard": "drought", "op": ">", "value": 1}],
                                  {"year": 2024})
    assert all(p["values"]["Extreme heat"] > 1 and p["values"]["Drought"] > 1 for p in r["places"])
    rec = many_places.filter_places(ctx, [{"hazard": "composite", "record": True}], {"year": 2024})
    assert 0 <= rec["matching"] <= rec["checked"] == 782


def test_parent_and_spread(ctx):
    p = many_places.compare_to_parent(ctx, KERALA, "rainfall", {"year": 2024, "season": "monsoon"})
    assert p["districts"] == 14 and all(d["difference"] > 0 for d in p["most_above"][:p["above_parent"]])
    s = many_places.spread_within(ctx, KERALA)
    assert s["highest"][0]["value"] >= s["middle_value"] >= s["lowest"][0]["value"]


def test_within_must_be_a_state_or_country(ctx):
    with pytest.raises(ToolError, match="must be a state"):
        many_places.rank_places(ctx, within=MUMBAI)


# ---------------------------------------------------------------- comparing

def test_compare_places_same_and_cross_country(ctx):
    r = comparing.compare_places(ctx, [CHENNAI, KOLKATA], period={"from_year": 2015, "to_year": 2025})
    assert r["period"] == "2015–2025" and len(r["trends"]) == 2 and r["differ_most"]
    india, uk = (next(p.id for p in load_country(c).places.values() if p.level == "country") for c in ("india", "uk"))
    x = comparing.compare_places(ctx, [india, uk], "heat")
    assert any("different countries" in n for n in x["notes"])
    table = ctx.results[x["show"][0]]
    assert table["rows"][0][0] == "Overall index"  # same row key for both countries


def test_neighbours_includes_parent(ctx):
    r = comparing.neighbours(ctx, "india/district/ANDHRA PRADESH/GUNTUR", {"year": 2024})
    assert r["places"][0]["role"] == "This place" and r["places"][-1]["role"].startswith("Its ")


# ---------------------------------------------------------------- explain + knowledge file in sync

def test_explain_topics_and_place_method(ctx):
    assert "z-score" in explain.explain_index(ctx, "calculation")["entries"][0]["text"]
    f = explain.explain_index(ctx, "formula")
    assert f["country"] == "India" and len(f["how_others_differ"]) == 2
    assert explain.explain_place_method(ctx, CHENNAI)["formula"].endswith("including sea level.")
    assert "/ 5" in explain.explain_place_method(ctx, DELHI)["formula"]
    lak = explain.explain_place_method(ctx, "india/state/LAKSHADWEEP")
    assert lak["has_overall_index"] is False and lak["notes"]
    assert explain.explain_value(ctx, 1.6)["band"] == "Elevated"
    with pytest.raises(ToolError):
        explain.explain_index(ctx, "astrology")


def test_knowledge_matches_code_and_website():
    k = explain.knowledge()
    # Formulas: same signs as labels.py (extreme cold is subtracted, matching the stored data).
    assert COMPOSITE_FORMULA["coastal"].split("/")[0].strip("() ") in k["countries"]["india"]["formula"]["coastal"]
    assert COMPOSITE_FORMULA["inland"].split("/")[0].strip("() ") in k["countries"]["india"]["formula"]["inland"]
    # Hazard lists per country match COUNTRY_INFO.
    codes = {name: h["code"] for name, h in k["hazards"].items()}
    for c, info in k["countries"].items():
        assert [codes[h] for h in info["components"]] == COUNTRY_INFO[c]["components"]
    # Bands: the frontend legend's upper limits, stats.severity and the knowledge text all agree.
    ts = (REPO_DIR / "frontend" / "src" / "lib" / "indicators.ts").read_text(encoding="utf-8")
    maxes = [float(m) for m in re.findall(r"max:\s*(-?[\d.]+)", ts)]
    assert maxes == [-1, 0, 1, 2, 3.5]
    labels = [severity(m) for m in maxes] + [severity(99)]
    assert all(lbl in k["shared"]["bands"]["text"] for lbl in labels)


# ---------------------------------------------------------------- registry

def test_every_tool_has_a_valid_schema():
    assert len(TOOLS) == len(BY_NAME) == 21
    for t in TOOLS:
        p = t.parameters
        assert p["type"] == "object" and set(p["required"]) <= set(p["properties"]) and t.description
        json.dumps(p)  # serialisable for the model


def test_call_tool_turns_mistakes_into_errors(ctx):
    run = lambda name, args: asyncio.run(call_tool(ctx, name, args))  # noqa: E731
    assert "error" in run("no_such_tool", {})
    assert "Missing place_id" in run("get_snapshot", {})["error"]
    assert "Unknown place id" in run("get_snapshot", {"place_id": "nowhere"})["error"]
    ok = run("get_snapshot", {"place_id": MUMBAI, "period": {"year": 2024}, "made_up_arg": 1})
    assert "error" not in ok and ok["period"] == "2024"
    assert [t["ok"] for t in ctx.trace] == [False, False, False, True]
