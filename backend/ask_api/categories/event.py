"""EVENT: one month at one place against the same month in every other year.

Overall index and each hazard with its rank among all same months, each hazard's contribution,
the top-5 same months on record, and the neighbours in that month. Context, never attribution.
"""

from ..compute import components_of, contribution, neighbours, ranked, window_series
from ..labels import COMPONENT_LABEL, COUNTRY_INFO, MONTH_NAMES
from ..stats import fmt, rnd
from .common import Clarify, Ctx, Planned, UserError, check_year, nullable, obj, place_of

NAME = "event"
SCHEMA = obj({
    "place": {"type": "string", "description": "Place name as written"},
    "month": nullable("integer", description="1-12"),
    "year": nullable("integer"),
})
WRITER_SLOTS = {"how_extreme": "1 sentence on how unusual the month was against the place's own history",
                "drivers": "1-2 sentences on which hazards drove the reading. Never say what caused it."}


def run(slots: dict, ctx: Ctx) -> Planned:
    p = place_of(slots.get("place"), ctx)
    month, year = slots.get("month"), slots.get("year")
    if month not in range(1, 13) or not year:
        raise Clarify(f"Which month and year at {p.name}? For example: July 2024.")
    check_year(year, p.country)
    win = [(0, month)]
    mname = MONTH_NAMES[month - 1]
    o = ranked(p, "COMPOSITE", year, win)
    if not o:
        raise UserError(f"There is no data for {p.name} in {mname} {year}.")
    hazards = []
    for c in components_of(p):
        r = ranked(p, c, year, win)
        if r:
            hazards.append({"hazard": COMPONENT_LABEL[c], "value": rnd(r["value"]), "rank": r["rank"], "n_years": r["n_years"],
                            "contribution": rnd(contribution(p, c, r["value"]))})
    driver = max(hazards, key=lambda h: abs(h["contribution"]))["hazard"] if hazards else None
    top5 = sorted(window_series(p, "COMPOSITE", win), key=lambda x: -x[1])[:5]
    ctx.step("score_month", {"place": p.id, "month": f"{mname} {year}"},
             f"overall {fmt(o['value'])}, rank {o['rank']} of {o['n_years']} {mname}s")
    nb = []
    for q in neighbours(p):
        r = ranked(q, "COMPOSITE", year, win)
        if r:
            nb.append({"place": q.name, "value": rnd(r["value"]), "rank": r["rank"], "n_years": r["n_years"]})
    ctx.step("neighbours_same_month", {"place": p.id}, f"{len(nb)} neighbours compared")
    missing = [COMPONENT_LABEL[c] for c in COUNTRY_INFO[p.country]["components"] if c not in components_of(p)]
    facts = {"place": p.ref(), "month": f"{mname} {year}", "overall": {"value": rnd(o["value"]), "rank": o["rank"], "n_years": o["n_years"]},
             "is_record_high": o["rank"] == 1, "hazards": hazards, "main_driver": driver, "not_measured": missing,
             "top5_same_month": [{"year": y, "value": rnd(v)} for y, v in top5], "neighbours": nb}
    return Planned(NAME, p.country, f"{p.name}: {mname} {year}",
                   f"{p.level_label}{', ' + p.parent_name if p.parent_name else ''} · {COUNTRY_INFO[p.country]['name']}",
                   facts, {"mname": mname, "year": year},
                   ["This is context, not attribution: the index does not say what caused an event."])


def assemble(pl: Planned, n: dict) -> list[dict]:
    f, m = pl.facts, pl.data["mname"]
    o = f["overall"]
    record = (f"This is the highest {m} on record in the index for {f['place']['name']}." if f["is_record_high"]
              else f"Against every {m} in the record, this one ranks {o['rank']} of {o['n_years']} (1 = highest).")
    out = [
        {"kind": "text", "title": "Event summary", "body": n["headline"]},
        {"kind": "table", "title": "What the index recorded", "columns": ["Hazard", "Anomaly", f"Rank among all {m}s (1 = highest)"],
         "rows": [["Overall index", o["value"], f"{o['rank']} of {o['n_years']}"]]
                 + [[h["hazard"], h["value"], f"{h['rank']} of {h['n_years']}"] for h in f["hazards"]], "valueCols": [1]},
        {"kind": "text", "title": "How extreme it was", "body": " ".join(x for x in [record, n["sections"].get("how_extreme")] if x)},
        {"kind": "bars", "title": "Component breakdown", "unit": "contribution to the overall index",
         "rows": [{"label": h["hazard"], "value": h["contribution"], "highlight": h["hazard"] == f["main_driver"]} for h in f["hazards"]],
         "note": "Each hazard's share of the overall index this month (extreme cold counts negatively)."},
    ]
    if n["sections"].get("drivers"):
        out.append({"kind": "text", "title": "", "body": n["sections"]["drivers"]})
    out.append({"kind": "table", "title": f"Highest {m}s on record", "columns": ["Year", "Overall index"],
                "rows": [[t["year"], t["value"]] for t in f["top5_same_month"]], "valueCols": [1],
                "highlightRow": next((i for i, t in enumerate(f["top5_same_month"]) if t["year"] == pl.data["year"]), None)})
    if f["neighbours"]:
        out.append({"kind": "table", "title": f"Neighbours in {f['month']}", "columns": ["Place", "Overall index", f"Rank among {m}s"],
                    "rows": [[x["place"], x["value"], f"{x['rank']} of {x['n_years']}"] for x in f["neighbours"]], "valueCols": [1]})
    return out


def template(pl: Planned) -> dict:
    f = pl.facts
    o = f["overall"]
    return {"headline": f"{f['place']['name']} in {f['month']}: overall index {fmt(o['value'])}, rank {o['rank']} of "
                        f"{o['n_years']} for that month.", "sections": {}, "followups": []}
