"""Every tool the agent can call, in one list. This is exactly what the model is told about each tool.

Each Tool states, in the same shape, so that small free models can use them correctly:
    purpose    what it does, in one or two sentences
    use_when   which questions it answers (and what to use instead)
    returns    the fields of its result
    example    one typical call
    parameters JSON schema; every input has a description
The model sees them combined as one description (Tool.description) plus the schema.

`call_tool` runs one call: it keeps only the inputs the schema allows, turns ToolError into
{"error": ...} for the model to fix, and records the call in ctx.trace. Loop-control tools (triage,
final_answer, ask_user, out_of_scope) belong to the agent loop (agent/prompt.py), not here.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Callable

from ..labels import HAZARD_CHOICES, SEASONS
from . import comparing, events, explain, many_places, one_place, over_time
from .context import ToolContext, ToolError
from .places import chosen, find_place
from .resolve import data_coverage, resolve_hazard, resolve_period

# ---------------------------------------------------------------- shared input shapes

PLACE = {"type": "string", "description": "A place id exactly as returned by find_place, e.g. "
         "\"india/district/MAHARASHTRA/MUMBAI\". Never invent one."}
HAZARD = {"type": "string", "enum": HAZARD_CHOICES,
          "description": "Which hazard. 'composite' = the overall index (all hazards together); use it when the "
                         "visitor names no hazard. Everyday words (flood, heatwave, cyclone) go through resolve_hazard first."}
PERIOD = {
    "type": "object", "additionalProperties": False,
    "description": "When. Give ONE of: {year} (optionally with season or month); {from_year, to_year} for a range; "
                   "{last_years}; or {relative}. Leave it out to use the tool's stated default.",
    "properties": {
        "year": {"type": "integer", "description": "A single year, e.g. 2024."},
        "season": {"type": "string", "enum": list(SEASONS),
                   "description": "monsoon = Jun–Sep, summer = Mar–May, post_monsoon = Oct–Nov, winter = Dec–Feb "
                                  "(winter 2024 = Dec 2023–Feb 2024). Only if the visitor names a season."},
        "month": {"type": "integer", "minimum": 1, "maximum": 12, "description": "A single month, 1 = January."},
        "from_year": {"type": "integer", "description": "First year of a range, e.g. 2015."},
        "to_year": {"type": "integer", "description": "Last year of a range, e.g. 2025."},
        "last_years": {"type": "integer", "minimum": 1, "description": "\"the last 10 years\" = 10."},
        "relative": {"type": "string", "enum": ["this_year", "last_year", "last_complete_year", "latest_month"],
                     "description": "For words like \"this year\" or \"last year\"; this_year is partial (data so far)."},
    },
}
WITHIN = {"type": "string", "description": "Place id of a STATE/PROVINCE or a COUNTRY from find_place, to look only "
          "inside it. Leave it out to cover the whole country selected on the page. Never a district id."}
LEVEL = {"type": "string", "enum": ["district", "state"],
         "description": "Required. \"state\" when the visitor asks about states, provinces or nations (uses each "
                        "state's own index, not its districts); \"district\" for districts or counties."}
COASTAL = {"type": "boolean", "description": "true = only coastal places, false = only inland places. Leave out for all."}
SHOW = "show: [result ids] - tables/charts our code built; put the ones you want in final_answer.show"


def schema(required: list[str], **props) -> dict:
    return {"type": "object", "additionalProperties": False, "required": required, "properties": props}


@dataclass(frozen=True)
class Tool:
    name: str
    purpose: str
    use_when: str
    returns: str
    example: str
    parameters: dict
    fn: Callable

    @property
    def description(self) -> str:
        return (f"PURPOSE: {self.purpose}\nUSE WHEN: {self.use_when}\nRETURNS: {self.returns}\n"
                f"EXAMPLE: {self.example}\nOn a problem it returns {{\"error\": \"...\"}} instead: read it and fix the input.")


def _find_place(ctx: ToolContext, name: str, country: str | None = None, **a):
    """A name the visitor already picked from options comes back as that place; otherwise look it up."""
    picked = ctx.resolved.get(name.strip().lower())
    return chosen(picked) if picked else find_place(ctx.client, name, country=country or ctx.country, **a)


TOOLS: list[Tool] = [
    # ---------------------------------------------------------------- words -> exact inputs
    Tool(
        "find_place",
        "Turns the place name the visitor typed into one place id. Decides itself whether it is a country, state, "
        "district or (in India) a town, city ward, village or PIN code inside a district.",
        "ALWAYS, once for every place the visitor names, before any data tool. Not needed for rank_places/filter_places "
        "over a whole country, and never call it for each place in a list.",
        "{status: found | choose | not_found | lookup_unavailable, place: {id, name, level, parent, country, coastal} "
        "or null, how: name | alias | bharatlas | chosen, note, options: [{label, id}], message, asked_for, "
        "inside_district}. found -> use place.id. inside_district: true -> the index has no separate data for that "
        "town; place is the district containing it: say so at the start of your answer (note has the wording). "
        "choose / not_found -> call ask_user with message and options. lookup_unavailable -> tell the visitor to use "
        "the district name.",
        '{"name": "Rajahmundry"} -> found, place East Godavari, inside_district true',
        schema(["name"],
               name={"type": "string", "description": "The place exactly as the visitor wrote it, e.g. \"Whitefield\", "
                                                      "\"Bombay\", \"500032\". Do not correct or expand it."},
               level_hint={"type": "string", "enum": ["country", "state", "district"],
                           "description": "Only if the visitor said the word 'state', 'district' or 'country'."},
               within={"type": "string", "description": "A state name the visitor gave, e.g. \"Himachal Pradesh\", "
                                                        "to narrow a common name like Rampur."},
               country={"type": "string", "enum": ["india", "uk", "nepal"],
                        "description": "Only if the visitor named a different country from the page's."}),
        _find_place),
    Tool(
        "resolve_hazard",
        "Maps an everyday hazard word to the index's hazards, and says when the index does not measure it.",
        "The visitor uses a word that is not exactly a hazard name: flood, heatwave, cyclone, frost, dry spell, "
        "earthquake, landslide...",
        "{status: ok | approximate | not_measured | unknown, hazards: [{code, label}], note}. approximate -> use the "
        "hazard and mention the note (e.g. floods are measured as heavy rainfall). not_measured -> tell the visitor.",
        '{"word": "flood"} -> approximate, heavy rainfall',
        schema(["word"], word={"type": "string", "description": "The hazard word as the visitor wrote it."}),
        lambda ctx, word: resolve_hazard(word, ctx.country)),
    Tool(
        "resolve_period",
        "Checks a period against the data (1991 to the latest month) and gives its label.",
        "Rarely needed: data tools check periods themselves. Use it only to find out what years exist or whether "
        "the current year is partial.",
        "{status: ok | error, period: {kind, year, season, month, from_year, to_year}, label, partial, note}",
        '{"relative": "this_year"} -> label "2026 (so far)", partial true',
        schema([], **PERIOD["properties"]),
        lambda ctx, **a: resolve_period(ctx.country, **a)),
    Tool(
        "data_coverage",
        "Says what the index has for one place: hazards measured, date range, coastal or not, overall index or not.",
        "Questions like \"is sea level measured in Delhi?\", or before answering about a hazard that may not apply.",
        "{place, index, hazards: [{code, label}], has_overall_index, formula, first_month, last_month}",
        '{"place_id": "india/state/DELHI"} -> 5 hazards, no sea level',
        schema(["place_id"], place_id=PLACE),
        lambda ctx, place_id: data_coverage(place_id)),

    # ---------------------------------------------------------------- one place, one period
    Tool(
        "get_snapshot",
        "How ONE place did in ONE year, season or month: the overall score and each hazard's score, each compared "
        "with every other year since 1991.",
        "\"How was 2024 for Mumbai?\", \"How bad was the 2023 monsoon in Kerala?\", \"What was May 2024 like in Delhi?\", "
        "\"Was 2024 Bihar's worst year?\". Not for ranges of years (use get_series, get_trend or compare_periods).",
        "{place, period, partial, note, overall: {value, level, compared_with_other_years, rank, of_years} or null, "
        "hazards: [{hazard, value, level, compared_with_other_years, rank, of_years, pushes_overall_by}], "
        f"not_measured, what_hazards_measure, {SHOW}. Write compared_with_other_years (\"2nd highest of 35 years\"), never rank.",
        '{"place_id": "india/district/MAHARASHTRA/MUMBAI", "period": {"year": 2024}}',
        schema(["place_id"], place_id=PLACE,
               period={**PERIOD, "description": "One year, season of a year, or month of a year. Default: the last complete year."}),
        one_place.get_snapshot),
    Tool(
        "get_extremes",
        "A place's most extreme (or mildest) months or years on record for one hazard.",
        "\"What was Puri's most extreme month ever?\", \"Delhi's 3 hottest years\", \"wettest monsoon on record in Assam\".",
        f"{{place, hazard, unit, order, out_of, top: [{{when, value, level}}], what_it_measures, {SHOW}}}",
        '{"place_id": "india/district/ODISHA/PURI", "unit": "month", "top_n": 5}',
        schema(["place_id"], place_id=PLACE, hazard=HAZARD,
               unit={"type": "string", "enum": ["month", "year"], "description": "Rank single months (default) or whole years."},
               order={"type": "string", "enum": ["highest", "lowest"], "description": "highest (default) = most extreme."},
               top_n={"type": "integer", "minimum": 1, "maximum": 20, "description": "How many to list (default 5)."},
               season={"type": "string", "enum": list(SEASONS), "description": "With unit=year only: rank this season of each year."}),
        one_place.get_extremes),
    Tool(
        "get_month_profile",
        "Every month of one year at one place, each compared with the same month in other years; names the highest month.",
        "\"Which month of 2024 was worst in Delhi?\", \"How did 2023 go month by month in Chennai?\".",
        f"{{place, year, hazard, months: [{{month, value, level, compared_with_same_month}}], highest_month, "
        f"what_it_measures, {SHOW}}}",
        '{"place_id": "india/state/DELHI", "year": 2024, "hazard": "heat"}',
        schema(["place_id", "year"], place_id=PLACE, year={"type": "integer", "description": "The year, e.g. 2024."},
               hazard=HAZARD),
        one_place.get_month_profile),

    # ---------------------------------------------------------------- one place over time
    Tool(
        "get_series",
        "Year-by-year scores of one hazard at one place, with the highest and lowest year (draws a line chart).",
        "\"Show me rainfall in Assam since 2000\", or when the visitor wants to see the years themselves.",
        f"{{place, hazard, period, values: [{{year, value}}], highest: {{year, value}}, lowest: {{year, value}}, "
        f"what_it_measures, {SHOW}}}",
        '{"place_id": "india/state/ASSAM", "hazard": "rainfall", "period": {"from_year": 2000}}',
        schema(["place_id"], place_id=PLACE, hazard=HAZARD,
               period={**PERIOD, "description": "Range of years (a season or month narrows it). Default: the whole record."}),
        over_time.get_series),
    Tool(
        "get_trend",
        "Whether a hazard is rising or falling at one place: change per decade (straight line) and the average of the "
        "earliest 10 years against the latest 10 years.",
        "\"Is heat increasing in Delhi?\", \"Has rainfall got worse in Assam since 2000?\". Needs at least 8 years.",
        f"{{place, hazard, period, change_per_decade, direction: rising | falling | little change, early: {{years, "
        f"average}}, recent: {{years, average}}, years_used, what_it_measures, {SHOW}}}",
        '{"place_id": "india/state/DELHI", "hazard": "heat"}',
        schema(["place_id"], place_id=PLACE, hazard=HAZARD,
               period={**PERIOD, "description": "Range of years. Default: the whole record (1991 onwards)."}),
        over_time.get_trend),
    Tool(
        "compare_periods",
        "Compares two periods at one place: the average of each and the difference.",
        "\"Was 2011–2020 worse than 1991–2000 in Gujarat?\", \"Is the last decade different from the 1990s?\".",
        f"{{place, hazard, first: {{period, average}}, second: {{period, average}}, difference (second minus first), {SHOW}}}",
        '{"place_id": "india/state/GUJARAT", "period_a": {"from_year": 1991, "to_year": 2000}, '
        '"period_b": {"from_year": 2011, "to_year": 2020}}',
        schema(["place_id", "period_a", "period_b"], place_id=PLACE,
               period_a={**PERIOD, "description": "The first (usually earlier) period."},
               period_b={**PERIOD, "description": "The second (usually later) period."}, hazard=HAZARD),
        over_time.compare_periods),
    Tool(
        "count_exceedances",
        "Counts the months a hazard was above (or below) a score at one place, lists the years, and gives the most "
        "recent such month.",
        "\"How many months since 2000 was Rajasthan's drought above 1?\", \"When did Odisha last have an extreme wind month?\" "
        "(use threshold 1.5 or 2 for 'extreme').",
        f"{{place, hazard, period, condition, months_meeting_it, months_checked, years_with_any, most_recent: {{month, "
        f"value}} or null, what_it_measures, {SHOW}}}",
        '{"place_id": "india/state/RAJASTHAN", "hazard": "drought", "threshold": 1, "period": {"from_year": 2000}}',
        schema(["place_id", "threshold"], place_id=PLACE,
               threshold={"type": "number", "description": "The score to compare with, e.g. 1 (clearly above normal) or 2 (rare)."},
               above={"type": "boolean", "description": "true (default) = count months above the threshold; false = below."},
               hazard=HAZARD,
               period={**PERIOD, "description": "Range of years. Default: the whole record."}),
        over_time.count_exceedances),

    # ---------------------------------------------------------------- many places
    Tool(
        "list_places",
        "Lists the places inside a state or country (optionally only coastal or inland ones).",
        "ONLY for \"which/how many districts are in Kerala?\" or \"which states are coastal?\". To rank or filter, call "
        "rank_places or filter_places directly: they already search every place.",
        "{scope, count, places: [{name, id, coastal}], truncated}",
        '{"within": "india/state/KERALA", "level": "district"}',
        schema(["level"], within=WITHIN, level=LEVEL, coastal=COASTAL),
        many_places.list_places),
    Tool(
        "rank_places",
        "Ranks ALL places in a country or state by a hazard, in one call: by score in a period, or by how fast it is "
        "rising.",
        "\"Top 5 Odisha districts for monsoon rainfall in 2024\", \"Worst drought districts in Rajasthan\", \"Which states "
        "are warming fastest?\" (by=change), \"coastal districts with the highest sea level\" (coastal=true). No "
        "find_place per place.",
        f"{{measure, scope, ranked, order, top: [{{rank, place, id, parent, value}}], partial, note, what_it_measures, "
        f"how_to_read, {SHOW}}}. A higher score means more unusual for that place, not hotter or wetter.",
        '{"hazard": "drought", "within": "india/state/RAJASTHAN", "level": "district", "period": {"year": 2024}, "limit": 5}  '
        'or  {"hazard": "heat", "level": "state", "by": "change"}',
        schema(["level"], hazard=HAZARD,
               period={**PERIOD, "description": "by=value: one year/season/month, or a range (gives the average). Default: "
                                                "last complete year. by=change: a range; default the whole record."},
               within=WITHIN, level=LEVEL, coastal=COASTAL,
               by={"type": "string", "enum": ["value", "change"],
                   "description": "value (default) = most extreme score; change = fastest rising per decade."},
               order={"type": "string", "enum": ["highest", "lowest"],
                      "description": "highest (default); lowest for 'mildest' or 'least'."},
               limit={"type": "integer", "minimum": 1, "maximum": 25, "description": "How many to list (default 10)."}),
        many_places.rank_places),
    Tool(
        "filter_places",
        "Finds every place where ALL the given conditions hold in a period (a score above/below a value, or a record).",
        "\"Which Maharashtra districts were above 1.5 for drought in 2022?\", \"districts with both heat and drought above "
        "1 in 2024\", \"how many districts had a record year in 2024?\" (record: true).",
        f"{{scope, period, condition, matching, checked, places: [{{place, id, parent, values}}], truncated, {SHOW}}}",
        '{"conditions": [{"hazard": "heat", "op": ">", "value": 1}, {"hazard": "drought", "op": ">", "value": 1}], '
        '"level": "district", "period": {"year": 2024}}',
        schema(["conditions", "level"],
               conditions={"type": "array", "minItems": 1,
                           "description": "One or more conditions; a place must meet all of them.",
                           "items": {"type": "object", "additionalProperties": False, "required": ["hazard"], "properties": {
                               "hazard": HAZARD,
                               "op": {"type": "string", "enum": [">", ">=", "<", "<="], "description": "Comparison."},
                               "value": {"type": "number", "description": "The score to compare with, e.g. 1.5."},
                               "record": {"type": "boolean", "description": "true = this period was the highest on record "
                                                                            "there (instead of op/value; needs one year)."}}}},
               period={**PERIOD, "description": "One year/season/month, or a range (average). Default: last complete year."},
               within=WITHIN, level=LEVEL, coastal=COASTAL),
        many_places.filter_places),
    Tool(
        "compare_to_parent",
        "Compares the districts of one state with the state as a whole: which districts are above it and by how much.",
        "\"Which Kerala districts were worse than Kerala as a whole in 2024?\".",
        f"{{parent, parent_value, period, hazard, districts, above_parent, most_above: [...], most_below: [...], {SHOW}}}",
        '{"within": "india/state/KERALA", "period": {"year": 2024}}',
        schema(["within"], within={**WITHIN, "description": "Place id of the STATE (from find_place)."}, hazard=HAZARD,
               period={**PERIOD, "description": "Default: last complete year."}),
        many_places.compare_to_parent),
    Tool(
        "spread_within",
        "How much the districts of a state differ: the highest, lowest, middle value and the range.",
        "\"How did Kerala's districts differ in 2024?\", \"Which district stood out in Bihar?\".",
        f"{{scope, hazard, period, places, highest: [...], lowest: [...], middle_value, range, {SHOW}}}",
        '{"within": "india/state/KERALA", "period": {"year": 2024}}',
        schema(["within"], within={**WITHIN, "description": "Place id of the state (or country) from find_place."},
               hazard=HAZARD, period={**PERIOD, "description": "Default: last complete year."}),
        many_places.spread_within),

    # ---------------------------------------------------------------- comparing places
    Tool(
        "compare_places",
        "Puts 2 to 4 places side by side (any level, any country): average score per hazard, change per decade, a "
        "5-year rolling chart, and which hazards differ most.",
        "\"Chennai vs Kolkata, 2015–2025\", \"Kerala vs Tamil Nadu on rainfall\", \"Is the UK warming faster than India?\". "
        "Call find_place for each place first.",
        f"{{places: [{{place, country, coastal, averages}}], period, trend_hazard, trends: [{{place, change_per_decade, "
        f"direction}}], differ_most: [{{hazard, gap}}], what_it_measures, notes, {SHOW}}}. Each place is measured "
        "against its own normal: say which was more unusual for itself, never which was hotter or wetter.",
        '{"place_ids": ["india/district/TAMIL NADU/CHENNAI", "india/district/WEST BENGAL/KOLKATA"], '
        '"period": {"from_year": 2015, "to_year": 2025}}',
        schema(["place_ids"],
               place_ids={"type": "array", "items": PLACE, "minItems": 2, "maxItems": 4,
                          "description": "2 to 4 place ids from find_place."},
               hazard={**HAZARD, "description": HAZARD["description"] + " Used for the trend and the chart."},
               period={**PERIOD, "description": "Range of years. Default: the whole record."}),
        comparing.compare_places),
    Tool(
        "neighbours",
        "Shows one place next to the places around it and its state, for one year, season or month.",
        "\"Was Guntur worse than its neighbours in 2024?\", \"How did nearby districts do?\".",
        f"{{place, period, hazard, places: [{{place, role, value, compared_with_its_past}}], {SHOW}}}",
        '{"place_id": "india/district/ANDHRA PRADESH/GUNTUR", "period": {"year": 2024}}',
        schema(["place_id"], place_id=PLACE,
               period={**PERIOD, "description": "One year, season or month. Default: last complete year."}, hazard=HAZARD),
        comparing.neighbours),

    # ---------------------------------------------------------------- historical disaster events
    Tool(
        "find_events",
        "Searches the database of past disasters (floods, landslides, cyclones and storms, heatwaves, cold waves, "
        "droughts, wildfires) by place, type, years or name.",
        "The visitor mentions a disaster: \"the 2022 Assam floods\", \"Cyclone Fani\", \"floods in Nepal in 2024\", "
        "\"heatwaves in Odisha\". Then call get_event and event_signal with an event_id it returns.",
        f"{{matching, events: [{{event_id, name, type, start_date, end_date, country, states, deaths, source}}], "
        f"truncated, note, {SHOW}}}. matching 0 -> say the database has no such event (note says what it covers).",
        '{"name": "Fani"}  or  {"place_id": "india/state/ASSAM", "type": "flood", "from_year": 2022, "to_year": 2022}',
        schema([],
               place_id={**PLACE, "description": "A place id from find_place. A state also finds events in its "
                                                 "districts; a district also finds state-wide events."},
               type={"type": "string", "enum": list(events.EVENT_HAZARDS),
                     "description": "Event type. Floods include flash floods and heavy-rain events; cyclone_storm "
                                    "includes UK named storms."},
               from_year={"type": "integer", "description": "Earliest year, e.g. 2019."},
               to_year={"type": "integer", "description": "Latest year, e.g. 2022."},
               name={"type": "string", "description": "Words from the event's name, e.g. \"Fani\" or \"Storm Doris\"."},
               limit={"type": "integer", "minimum": 1, "maximum": 25, "description": "How many to list (default 10)."}),
        events.find_events),
    Tool(
        "get_event",
        "Gives one disaster in full: type, dates, reported impacts, and where it struck (the states, and the districts "
        "when it affected only one or two states).",
        "After find_events, to describe the event: \"which states did it affect?\", \"how many people died?\".",
        f"{{event_id, name, type, start_date, end_date, country, states_affected, where: [{{state, districts, "
        f"district_count}}], impacts: {{deaths, missing, injured, people_affected, families_affected, damage, "
        f"damage_unit}}, summary, index_hazards_for_this_type, source, source_url, {SHOW}}}. Name districts only "
        "when where lists them; always credit the source.",
        '{"event_id": "gdacs:TC-1000552"}',
        schema(["event_id"], event_id={"type": "string", "description": "An event_id returned by find_events."}),
        events.get_event),
    Tool(
        "event_signal",
        "Shows what the climate index recorded at the places a disaster struck, during the event's months, for the "
        "hazards that match its type (flood -> heavy rainfall; cyclone -> strong wind, heavy rainfall, sea level; "
        "heatwave -> extreme heat; cold wave -> extreme cold; drought -> drought; wildfire -> heat and drought), plus "
        "the overall index, each compared with the same months in every other year.",
        "\"Was the rainfall during the Assam floods unusual?\", \"What did the index show during Cyclone Fani?\", or "
        "whenever you describe an event: it links the event to the index.",
        f"{{event, months, places_checked, places_not_shown, hazards_for_this_type, readings: [{{place, hazard, value, "
        f"level, compared_with_same_months}}], strongest: {{...}}, {SHOW}}}. If readings are near 0, say the index did "
        "not show it as unusual (it is a monthly average over each district).",
        '{"event_id": "gdacs:TC-1000552"}',
        schema(["event_id"], event_id={"type": "string", "description": "An event_id returned by find_events."},
               max_places={"type": "integer", "minimum": 1, "maximum": 12,
                           "description": "How many affected places to read (default 6)."}),
        events.event_signal),

    # ---------------------------------------------------------------- explaining the index
    Tool(
        "explain_index",
        "Explains how the index is built, using text from the website's About pages.",
        "\"What is the index?\", \"How is it calculated?\", \"What does drought measure?\", \"Which datasets?\", \"How is "
        "Nepal's index different?\" (topic differences).",
        "{topic, entries: [{title, text}], country, how_others_differ: [...]}. Reword the text; do not add method details.",
        '{"topic": "calculation"}',
        schema(["topic"],
               topic={"type": "string", "enum": list(explain.TOPICS),
                      "description": "overview, why, calculation, grid, baseline, percentiles, bands, applications, "
                                     "future, limitations; country-specific: components, formula, datasets, levels, status; "
                                     "one hazard: heat, cold, rainfall, wind, drought, sea_level; or differences."},
               country={"type": "string", "enum": ["india", "uk", "nepal"],
                        "description": "For country-specific topics. Default: the page's country."}),
        explain.explain_index),
    Tool(
        "explain_place_method",
        "Explains how one place's index is put together, from its own data: coastal (6 hazards, with sea level), "
        "inland (5), landlocked (Nepal), or no overall index, with the reason.",
        "\"How is Chennai's index worked out?\", \"Why is sea level missing for Delhi?\", \"Why does Lakshadweep have no index?\".",
        f"{{place, level, index, summary, formula, hazards_measured, has_overall_index, notes, {SHOW}}}",
        '{"place_id": "india/state/LAKSHADWEEP"}',
        schema(["place_id"], place_id=PLACE),
        explain.explain_place_method),
    Tool(
        "explain_value",
        "Says what a score means: its band (Normal, Moderate, Elevated...) and a plain sentence.",
        "\"What does a score of 1.5 mean?\", or to explain a number in your answer.",
        "{value, band, meaning, bands}",
        '{"value": 1.5}',
        schema(["value"], value={"type": "number", "description": "The score, e.g. 1.5 or -0.8."}),
        explain.explain_value),
]

BY_NAME = {t.name: t for t in TOOLS}


async def call_tool(ctx: ToolContext, name: str, args: dict) -> dict:
    """Run one tool call from the model. Never raises for the model's mistakes: returns {"error": ...}."""
    tool = BY_NAME.get(name)
    if not tool:
        out = {"error": f"Unknown tool {name!r}. Use one of: {', '.join(BY_NAME)}."}
    else:
        allowed = tool.parameters["properties"]
        clean = {k: v for k, v in (args or {}).items() if k in allowed and v is not None}
        missing = [k for k in tool.parameters["required"] if k not in clean]
        try:
            if missing:
                raise ToolError(f"Missing {', '.join(missing)}. Example call: {tool.example}")
            out = tool.fn(ctx, **clean)
            if inspect.isawaitable(out):
                out = await out
        except ToolError as e:
            out = {"error": str(e)}
    ctx.trace.append({"name": name, "args": args, "ok": "error" not in out,
                      "summary": out.get("error") or out.get("label") or out.get("period") or out.get("status") or "done"})
    return out
