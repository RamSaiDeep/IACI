"""Every tool the agent can call, in one list: name, what to tell the model, its inputs, and the function.

`TOOLS` is what gets sent to the model (as JSON schemas). `call_tool` runs one call: it keeps only the
inputs the schema allows, turns ToolError into {"error": ...} for the model to fix, and records the call
in ctx.trace for the "How this was worked out" box. Loop-control tools (triage, final_answer, ask_user,
out_of_scope) belong to the agent loop, not here.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Callable

from ..labels import HAZARD_CHOICES, SEASONS
from . import comparing, explain, many_places, one_place, over_time
from .context import ToolContext, ToolError
from .places import find_place
from .resolve import data_coverage, resolve_hazard, resolve_period

# ---------------------------------------------------------------- shared input shapes

PLACE = {"type": "string", "description": "A place id returned by find_place."}
HAZARD = {"type": "string", "enum": HAZARD_CHOICES, "description": "Hazard; 'composite' is the overall index. "
          "Map everyday words (flood, heatwave...) with resolve_hazard first."}
PERIOD = {
    "type": "object", "additionalProperties": False,
    "description": "Give one of: year (+ optional season or month); from_year/to_year; last_years; or relative. "
                   "Omit to use the tool's default (stated in its description).",
    "properties": {
        "year": {"type": "integer"},
        "season": {"type": "string", "enum": list(SEASONS)},
        "month": {"type": "integer", "minimum": 1, "maximum": 12},
        "from_year": {"type": "integer"}, "to_year": {"type": "integer"},
        "last_years": {"type": "integer", "minimum": 1},
        "relative": {"type": "string", "enum": ["this_year", "last_year", "last_complete_year", "latest_month"]},
    },
}
WITHIN = {"type": "string", "description": "Place id of a state/province or a country (from find_place). "
          "Omit for the whole country selected on the page."}
LEVEL = {"type": "string", "enum": ["district", "state"], "description": "Which level to look at (default district)."}
COASTAL = {"type": "boolean", "description": "true: only coastal places; false: only inland. Omit for all."}


def schema(required: list[str], **props) -> dict:
    return {"type": "object", "additionalProperties": False, "required": required, "properties": props}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict
    fn: Callable


TOOLS: list[Tool] = [
    # Step 0: words -> exact inputs
    Tool("find_place", "Turn a typed place name into one place id. Works for countries, states, districts, and (in India) "
         "neighbourhoods, towns, villages and PIN codes. Call it for every place before fetching data. If it returns "
         "'choose' or 'not_found', ask the visitor with ask_user using its options and message.",
         schema(["name"], name={"type": "string", "description": "The place exactly as the visitor wrote it."},
                level_hint={"type": "string", "enum": ["country", "state", "district"],
                            "description": "Only if the visitor said 'state', 'district' etc."},
                within={"type": "string", "description": "A state the visitor named, to narrow the search."},
                country={"type": "string", "enum": ["india", "uk", "nepal"], "description": "Only if the visitor named a country."}),
         lambda ctx, country=None, **a: find_place(ctx.client, country=country or ctx.country, **a)),
    Tool("resolve_hazard", "Map an everyday hazard word (flood, heatwave, cyclone, frost...) to the index's hazards. "
         "Says when the index doesn't measure it (earthquake, landslide).",
         schema(["word"], word={"type": "string"}),
         lambda ctx, word: resolve_hazard(word, ctx.country)),
    Tool("resolve_period", "Check a period against the data and get its label (e.g. whether the current year is partial).",
         schema([], **PERIOD["properties"]),
         lambda ctx, **a: resolve_period(ctx.country, **a)),
    Tool("data_coverage", "What a place has: hazards measured, date range, coastal or not, whether it has an overall index.",
         schema(["place_id"], place_id=PLACE),
         lambda ctx, place_id: data_coverage(place_id)),

    # One place, one period
    Tool("get_snapshot", "How one place did in ONE year, season or month: each hazard's value, its rank among all years "
         "(1 = highest), level word, and how much it pushed the overall index. Default period: last complete year.",
         schema(["place_id"], place_id=PLACE, period=PERIOD), one_place.get_snapshot),
    Tool("get_extremes", "A place's most extreme months or years on record for one hazard.",
         schema(["place_id"], place_id=PLACE, hazard=HAZARD, unit={"type": "string", "enum": ["month", "year"]},
                order={"type": "string", "enum": ["highest", "lowest"]}, top_n={"type": "integer", "minimum": 1, "maximum": 20},
                season={"type": "string", "enum": list(SEASONS), "description": "Years only: rank this season."}),
         one_place.get_extremes),
    Tool("get_month_profile", "Month by month within one year at a place, each against the same month in other years.",
         schema(["place_id", "year"], place_id=PLACE, year={"type": "integer"}, hazard=HAZARD), one_place.get_month_profile),

    # One place over time
    Tool("get_series", "Year-by-year values of one hazard at a place (line chart). Default period: whole record.",
         schema(["place_id"], place_id=PLACE, hazard=HAZARD, period=PERIOD), over_time.get_series),
    Tool("get_trend", "Is a hazard rising or falling at a place: change per decade (straight line), earlier vs recent "
         "10-year averages, direction. Default period: whole record. Needs 8+ years.",
         schema(["place_id"], place_id=PLACE, hazard=HAZARD, period=PERIOD), over_time.get_trend),
    Tool("compare_periods", "Two periods at one place, e.g. 1991–2000 vs 2011–2020: each average and the difference.",
         schema(["place_id", "period_a", "period_b"], place_id=PLACE, period_a=PERIOD, period_b=PERIOD, hazard=HAZARD),
         over_time.compare_periods),
    Tool("count_exceedances", "How many months a hazard was above (or below) a value at a place, which years, and the most "
         "recent such month. Default period: whole record.",
         schema(["place_id", "threshold"], place_id=PLACE, threshold={"type": "number"},
                above={"type": "boolean", "description": "true = above (default), false = below"},
                hazard=HAZARD, period=PERIOD), over_time.count_exceedances),

    # Many places
    Tool("list_places", "The places in a state or country, optionally coastal or inland only.",
         schema([], within=WITHIN, level=LEVEL, coastal=COASTAL), many_places.list_places),
    Tool("rank_places", "Order places by a hazard. by='value': most extreme in a period (default: last complete year; a "
         "range gives the average). by='change': fastest rising per decade (default: whole record).",
         schema([], hazard=HAZARD, period=PERIOD, within=WITHIN, level=LEVEL, coastal=COASTAL,
                by={"type": "string", "enum": ["value", "change"]}, order={"type": "string", "enum": ["highest", "lowest"]},
                limit={"type": "integer", "minimum": 1, "maximum": 25}), many_places.rank_places),
    Tool("filter_places", "Every place meeting ALL conditions in a period, e.g. drought > 1.5, or heat > 1 and drought > 1, "
         "or a record (highest on record that period). Default period: last complete year.",
         schema(["conditions"], conditions={"type": "array", "minItems": 1, "items": {
             "type": "object", "additionalProperties": False, "required": ["hazard"], "properties": {
                 "hazard": HAZARD, "op": {"type": "string", "enum": [">", ">=", "<", "<="]}, "value": {"type": "number"},
                 "record": {"type": "boolean", "description": "true: the period was the highest on record there"}}}},
                period=PERIOD, within=WITHIN, level=LEVEL, coastal=COASTAL), many_places.filter_places),
    Tool("compare_to_parent", "The districts of a state against the state as a whole: which are above it and by how much.",
         schema(["within"], within=WITHIN, hazard=HAZARD, period=PERIOD), many_places.compare_to_parent),
    Tool("spread_within", "How the districts of a state (or country) differ: highest, lowest, middle value, range.",
         schema(["within"], within=WITHIN, hazard=HAZARD, period=PERIOD), many_places.spread_within),

    # Comparing places
    Tool("compare_places", "2–4 places side by side (any levels, any countries): averages per hazard, change per decade, "
         "5-year rolling chart, which hazards differ most. Default period: whole record.",
         schema(["place_ids"], place_ids={"type": "array", "items": PLACE, "minItems": 2, "maxItems": 4},
                hazard=HAZARD, period=PERIOD), comparing.compare_places),
    Tool("neighbours", "One place next to the places around it and its state, for one year, season or month.",
         schema(["place_id"], place_id=PLACE, period=PERIOD, hazard=HAZARD), comparing.neighbours),

    # Explaining the index
    Tool("explain_index", "How the index is built, from the website's About pages. Topics: " + ", ".join(explain.TOPICS)
         + ". Country-specific topics answer for the given country (default: the page's) and list how the others differ.",
         schema(["topic"], topic={"type": "string", "enum": list(explain.TOPICS)},
                country={"type": "string", "enum": ["india", "uk", "nepal"]}), explain.explain_index),
    Tool("explain_place_method", "How one place's index is put together: coastal (6 hazards), inland (5), landlocked, or "
         "no overall index, with the reason.", schema(["place_id"], place_id=PLACE), explain.explain_place_method),
    Tool("explain_value", "What a number means, e.g. +1.6: its band and plain meaning.",
         schema(["value"], value={"type": "number"}), explain.explain_value),
]

BY_NAME = {t.name: t for t in TOOLS}


async def call_tool(ctx: ToolContext, name: str, args: dict) -> dict:
    """Run one tool call from the model. Never raises for the model's mistakes: returns {"error": ...}."""
    tool = BY_NAME.get(name)
    if not tool:
        out = {"error": f"Unknown tool {name!r}."}
    else:
        allowed = tool.parameters["properties"]
        clean = {k: v for k, v in (args or {}).items() if k in allowed and v is not None}
        missing = [k for k in tool.parameters["required"] if k not in clean]
        try:
            if missing:
                raise ToolError(f"Missing {', '.join(missing)}.")
            out = tool.fn(ctx, **clean)
            if inspect.isawaitable(out):
                out = await out
        except ToolError as e:
            out = {"error": str(e)}
    ctx.trace.append({"name": name, "args": args, "ok": "error" not in out,
                      "summary": out.get("error") or out.get("label") or out.get("period") or out.get("status") or "done"})
    return out
