"""HELP: what the index or a component means. Fixed text picked by the router; no calculation, no writer."""

from ..labels import BASELINE, COMPOSITE_FORMULA, COUNTRY_INFO, DATA_SOURCE, HELP_TOPICS
from .common import Ctx, Planned

NAME = "help"
TOPIC_CHOICES = [
    {"value": "index", "description": "What the Actuaries Climate Index is, how the overall index is built"},
    {"value": "heat", "description": "The extreme heat component"},
    {"value": "cold", "description": "The extreme cold component"},
    {"value": "rainfall", "description": "The heavy rainfall component"},
    {"value": "wind", "description": "The strong wind component"},
    {"value": "drought", "description": "The drought / dry days component"},
    {"value": "sea level", "description": "The sea level component"},
    {"value": "baseline", "description": "The 1991-2020 baseline, anomalies, z-scores, what the numbers mean"},
    {"value": "ranks", "description": "How ranks and comparisons across years work"},
    {"value": "data", "description": "Data sources, coverage, countries, regions, time span"},
]


def run(topic: str, ctx: Ctx) -> Planned:
    topic = topic if topic in HELP_TOPICS else "index"
    title, body = HELP_TOPICS[topic]
    info = COUNTRY_INFO[ctx.country]
    ctx.step("help_topic", {"topic": topic}, title)
    extra = ""
    if topic == "index":
        f = COMPOSITE_FORMULA["inland"] if ctx.country == "nepal" else f"{COMPOSITE_FORMULA['coastal']} on coasts, {COMPOSITE_FORMULA['inland']} inland"
        extra = f"For {info['name']} ({info['index_name']}, {info['version']}) the overall index is {f}."
    return Planned(NAME, ctx.country, title, f"{info['index_name']} · {info['version']}",
                   {"topic": topic}, {"body": body, "extra": extra})


def assemble(pl: Planned, n: dict) -> list[dict]:
    out = [{"kind": "text", "title": "", "body": pl.data["body"]}]
    if pl.data["extra"]:
        out.append({"kind": "text", "title": "Formula", "body": pl.data["extra"]})
    out.append({"kind": "text", "title": "Where it comes from", "body": f"Baseline {BASELINE}. Data: {DATA_SOURCE}."})
    return out


def template(pl: Planned) -> dict:
    return {"headline": pl.title, "sections": {}, "followups": [
        "How was 2024 for my district?", "Which districts had the most extreme heat last summer?"]}
