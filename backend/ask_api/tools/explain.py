"""Explaining how the index is built. Every sentence comes from knowledge/index_knowledge.json
(written from the website's About pages); the model rewords it but never invents method details.

    explain_index         a topic, in general or for one country
    explain_place_method  how one place's index is put together, from its own data
    explain_value         what a number such as +1.6 means
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ..labels import COUNTRY_INFO
from ..stats import severity
from .context import ToolContext, ToolError, place_arg
from .resolve import data_coverage

KNOWLEDGE = Path(__file__).resolve().parent.parent / "knowledge" / "index_knowledge.json"
COUNTRY_TOPICS = ("components", "formula", "datasets", "levels", "status")  # answers differ by country
HAZARD_TOPICS = ("heat", "cold", "rainfall", "wind", "drought", "sea_level")
TOPICS = ("overview", "why", "calculation", "grid", "baseline", "percentiles", "bands", "applications", "future",
          "limitations", *COUNTRY_TOPICS, *HAZARD_TOPICS, "differences")


@lru_cache(maxsize=1)
def knowledge() -> dict:
    return json.loads(KNOWLEDGE.read_text(encoding="utf-8"))


def _country_entry(country: str, topic: str) -> dict:
    c = knowledge()["countries"][country]
    hz = knowledge()["hazards"]
    text = {"components": "; ".join(f"{hz[h]['name']}: {hz[h]['measures']}" for h in c["components"]),
            "formula": " ".join(c["formula"].values()),
            "datasets": c["datasets"], "levels": c["levels"], "status": f"{c['index']}: {c['status']}."}[topic]
    return {"title": f"{c['index']}: {topic}", "text": text}


def explain_index(ctx: ToolContext, topic: str, country: str | None = None) -> dict:
    if topic not in TOPICS:
        raise ToolError(f"Unknown topic {topic!r}. Topics: {', '.join(TOPICS)}.")
    k = knowledge()
    if topic in HAZARD_TOPICS:
        h = k["hazards"][topic]
        return {"topic": topic, "entries": [{"title": h["name"], "text": f"{h['measures']} Data: {h['data']}."}]}
    if topic == "differences":
        return {"topic": topic, "entries": [
            {"title": c["index"], "text": f"{c['status']}. Levels: {c['levels']} Hazards: {len(c['components'])}. "
                                          f"Formula: {' '.join(c['formula'].values())} {' '.join(c['notes'])}"}
            for c in k["countries"].values()]}
    if topic in COUNTRY_TOPICS:
        main = country if country in k["countries"] else ctx.country
        others = [c for c in k["countries"] if c != main]
        return {"topic": topic, "country": COUNTRY_INFO[main]["name"],
                "entries": [_country_entry(main, topic), *({"title": "Notes", "text": n} for n in k["countries"][main]["notes"])],
                "how_others_differ": [_country_entry(c, topic) for c in others]}
    return {"topic": topic, "entries": [k["shared"][topic]]}


def explain_place_method(ctx: ToolContext, place_id: str) -> dict:
    """Which formula applies at this place and why, decided from its data (coastal, inland, landlocked, none)."""
    p = place_arg(place_id)
    cov = data_coverage(place_id)
    c = knowledge()["countries"][p.country]
    hz = {v["code"]: v for v in knowledge()["hazards"].values()}
    if not cov["has_overall_index"]:
        formula = "No overall index here."
    elif any(h["code"] == "SS" for h in cov["hazards"]):
        formula = c["formula"]["coastal"]
    else:
        formula = c["formula"]["inland"]
    rid = ctx.table(f"How {p.name}'s index is built", ["Hazard", "What it measures", "Data"],
                    [[hz[h["code"]]["name"], hz[h["code"]]["measures"], hz[h["code"]]["data"]] for h in cov["hazards"]])
    return {"place": p.name, "level": p.level_label, "index": c["index"], "summary": cov["formula"],
            "formula": formula, "hazards_measured": [h["label"] for h in cov["hazards"]],
            "has_overall_index": cov["has_overall_index"],
            "notes": [n for n in c["notes"] if p.name.split()[0].lower() in n.lower()],  # notes that name this place
            "show": [rid]}


def explain_value(ctx: ToolContext, value: float, country: str | None = None) -> dict:
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise ToolError("value must be a number, e.g. 1.5 or -0.8.")
    band = severity(v)
    side = "above" if v > 0 else "below" if v < 0 else "at"
    meaning = (f"{v:+.2f} is in the {band} band: {abs(v):.2f} standard deviations {side} the 1991–2020 normal for the "
               "same month and place." if v else "0 means exactly the 1991–2020 normal for the same month and place.")
    return {"value": v, "band": band, "meaning": meaning, "bands": knowledge()["shared"]["bands"]["text"]}
