"""Tools the Ask agent can call. Each module is one group; every tool returns plain JSON-able dicts.

    places.py    find_place            name -> one place (our names, then Bharatlas)
    resolve.py   resolve_hazard        "flood" -> heavy rainfall
                 resolve_period        "monsoon 2024", "last 10 years" -> checked months and a label
                 data_coverage         what a place has: hazards, years, coastal, overall index or not

The data tools (snapshot, trend, rank, ...) and explain tools are added in the next build steps.
"""
