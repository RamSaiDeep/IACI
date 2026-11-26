"""The agentic workflow for one question:

  question -> Mammoth-1 (in scope? which category?) -> GPT-5 nano (category slots as JSON)
           -> category function (all numbers, in code) -> writer (visitor's key) -> number check -> report
"""

from __future__ import annotations

import datetime as dt
from typing import Callable

import httpx

from . import config
from .categories import CATEGORIES, LABELS
from .categories.common import Clarify, Ctx, UserError
from .errors import AskError
from .grounding import allowed_numbers, strip_attribution, strip_ungrounded, ungrounded
from .labels import BASELINE, COUNTRY_INFO, COUNTRY_SLUGS, DATA_SOURCE, STANDARD_CAVEATS
from .router import WAIT_NOTICE, Usage, classify, extract
from .writer import Writer

# The chat answers these four kinds of question only (event and help stay reachable by category, not by free text).
CHAT_SCOPE = ("snapshot", "compare", "rank", "trend")
OUT_OF_SCOPE = ("I can look into four kinds of questions about the Actuaries Climate Index for India, the UK and Nepal: "
                "a snapshot of one place in a year or season, a comparison of two places, a ranking of districts, "
                "and a trend at one place.")
EXAMPLES = ["How was 2024 for Mumbai?", "Chennai vs Kolkata, 2015–2025",
            "Worst drought districts in Rajasthan", "Is heat increasing in Delhi?"]


def method(country: str) -> dict:
    i = COUNTRY_INFO[country]
    return {"baseline": BASELINE, "version": i["version"], "source": DATA_SOURCE, "index": f"{i['index_name']} ({i['index_code']})"}


async def run_ask(body: dict, key: str | None, emit: Callable[[str], None]) -> dict:
    country = body.get("country") if body.get("country") in COUNTRY_SLUGS else "india"
    question = (body.get("question") or "").strip()[:600] or None
    category, slots = body.get("category"), body.get("slots")
    previous = body.get("previous") or None
    ctx = Ctx(country=country, resolved={k.lower(): v for k, v in (body.get("resolved") or {}).items()}, emit=emit)
    usage = Usage()
    WAIT_NOTICE.set(emit)
    writer: Writer | None = None
    topic = None
    if category and category not in CATEGORIES:
        raise AskError("bad_request", "Unknown answer type.")
    if not category and not question:
        raise AskError("bad_request", "Type a question first.")

    async with httpx.AsyncClient() as client:
        try:
            if not category:
                emit("Mammoth-1 is checking what kind of question this is")
                c = await classify(client, question, country, previous, usage)
                ctx.step("classify", {"model": config.ROUTER_MODEL},
                         f"in scope {c['related']:.0%}; {c['category']} ({c['confidence']:.0%} sure)")
                if c["related"] < config.RELATED_MIN or c["category"] not in CHAT_SCOPE:
                    raise Clarify(OUT_OF_SCOPE + " Try one of these:", [{"label": q, "question": q} for q in EXAMPLES])
                if c["confidence"] < config.CATEGORY_MIN:
                    top = [p["value"] for p in c["probabilities"][:2]]
                    raise Clarify("What kind of answer would help most?",
                                  [{"label": LABELS[t], "category": t} for t in top if t in CHAT_SCOPE])
                category, topic = c["category"], c.get("topic")
            mod = CATEGORIES[category]

            if category == "help":
                topic = (slots or {}).get("topic") or topic or "index"
                planned = mod.run(topic, ctx)
                narrative, status, removed = mod.template(planned), "verified", []
                slots = {"topic": topic}
            else:
                writer = Writer(body.get("provider") or "anthropic", body.get("model"), key)  # fails fast without a key
                if slots is None:
                    emit("GPT-5 nano is reading the place, period and hazard")
                    slots = await extract(client, category, mod.SCHEMA, question, country, previous, usage)
                    ctx.step("extract", {"model": config.EXTRACT_MODEL},
                             ", ".join(f"{k}={v}" for k, v in slots.items() if v not in (None, [], "")))
                planned = mod.run(slots, ctx)
                narrative, status, removed = await _write(client, writer, mod, planned, question, emit)
        except Clarify as q:
            return {"kind": "clarify", "question": q.question, "options": q.options, "query": q.query,
                    "category": category, "slots": slots, "usage": writer.usage() if writer else None,
                    "router": usage.card(), "trace": ctx.trace}
        except UserError as e:
            raise AskError("bad_request", str(e))

    emit("Assembling the report")
    notes = list(STANDARD_CAVEATS) + planned.notes
    if planned.country == "uk":
        notes.append("The UK index is a draft.")
    if planned.country == "nepal":
        notes.append("Nepal is landlocked: sea level is not part of its index.")
    report = {
        "feature": category, "title": planned.title, "subtitle": planned.subtitle, "country": planned.country,
        "request": {"country": country, "question": question, "category": category, "slots": slots},
        "headline": narrative["headline"], "sections": mod.assemble(planned, narrative), "followups": narrative["followups"],
        "notes": notes, "method": method(planned.country), "trace": ctx.trace,
        "grounding": {"status": status, "removed": removed},
        "usage": writer.usage() if writer else {"provider": "none", "model": "fixed text", "calls": 0,
                                                "inputTokens": 0, "outputTokens": 0, "costUsd": 0},
        "router": usage.card(), "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    return {"kind": "report", "report": report}


async def _write(client, writer: Writer, mod, planned, question, emit):
    emit(f"{writer.model} is writing the answer from the calculated figures")
    allowed = allowed_numbers(planned.facts, [dt.date.today().year])
    n = await writer.write(client, mod.NAME, question, planned.facts, mod.WRITER_SLOTS)
    texts = lambda: [n["headline"], *n["sections"].values()]  # noqa: E731
    status, removed = "verified", []
    emit("Checking every number in the text against the data")
    bad = sorted({t for x in texts() for t in ungrounded(x, allowed)})
    if bad:
        emit(f"Some numbers did not match the data ({', '.join(bad)}); asking for a rewrite")
        n = await writer.write(client, mod.NAME, question, planned.facts, mod.WRITER_SLOTS,
                               f"These numbers are not in the FACTS: {', '.join(bad)}. Rewrite using only numbers from the FACTS (or none).")
        status = "repaired"
        if any(ungrounded(x, allowed) for x in texts()):
            status = "stripped"
            n["headline"], r = strip_ungrounded(n["headline"], allowed)
            removed += r
            for k in list(n["sections"]):
                n["sections"][k], r = strip_ungrounded(n["sections"][k], allowed)
                removed += r
    n["headline"], r = strip_attribution(n["headline"])
    removed += r
    for k in list(n["sections"]):
        n["sections"][k], r = strip_attribution(n["sections"][k])
        removed += r
    n["followups"] = [f for f in n["followups"] if not ungrounded(f, allowed)]
    if not n["headline"]:
        n["headline"] = mod.template(planned)["headline"]
    return n, status, removed
