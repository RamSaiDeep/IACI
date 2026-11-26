"""Tools the Ask agent can call. Start with registry.py: the full list, with what the model is told.

    registry.py     TOOLS (name, description, input schema, function) and call_tool
    context.py      ToolContext (country, tables/charts store, trace), ToolError, input checks, Period

    places.py       find_place            name -> one place (our names, then Bharatlas)
    resolve.py      resolve_hazard        "flood" -> heavy rainfall
                    resolve_period        "monsoon 2024", "last 10 years" -> checked and labelled
                    data_coverage         hazards, years, coastal, overall index or not
    one_place.py    get_snapshot, get_extremes, get_month_profile
    over_time.py    get_series, get_trend, compare_periods, count_exceedances
    many_places.py  list_places, rank_places, filter_places, compare_to_parent, spread_within
    comparing.py    compare_places, neighbours
    explain.py      explain_index, explain_place_method, explain_value  (text from knowledge/index_knowledge.json)

Data tools return a short summary for the model plus "show": [result ids]. The tables and charts behind
those ids are built by our code (ctx.results), so the page never shows a number the model wrote itself.
"""
