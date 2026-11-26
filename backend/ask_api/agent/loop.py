"""run_agent: one visitor question, answered by the visitor's model calling our tools.

    1. Triage    forced `triage` call: is this something the site can answer? If not, stop.
    2. Loop      up to MAX_STEPS model turns; each turn calls tools, our code runs them, results go back.
                 It ends only through a finishing tool: final_answer, ask_user or out_of_scope.
    3. Check     every number in the final text must appear in a tool result (one rewrite, then
                 unverifiable sentences are removed); claims of cause are removed.
    4. Answer    headline + the model's short sections + the tables/charts it chose (built by our code).

Returns one of:
    {"kind": "answer", "headline", "sections", "followups", "notes", "grounding", "trace", "usage"}
    {"kind": "clarify", "question", "options": [{"label", "id"?, "question"?}], "query", "trace", "usage"}
    {"kind": "out_of_scope", "message", "options": [{"label", "question"}], "trace", "usage"}
"""

from __future__ import annotations

import datetime as dt
import json
from dataclasses import asdict
from typing import Callable

from ..data import get_place
from ..errors import AskError
from ..grounding import allowed_numbers, strip_attribution, strip_ungrounded, ungrounded
from ..labels import EXAMPLE_QUESTIONS
from ..tools.context import ToolContext
from ..tools.registry import TOOLS, call_tool
from ..bharatlas import CREDIT as BHARATLAS_CREDIT
from .model import Model, Reply, ToolSpec
from .prompt import FINAL_ANSWER, FINISHERS, TRIAGE, system_prompt

MAX_STEPS = 8  # model turns after triage
MAX_CALLS = 12  # data/lookup tool calls in total
RESULT_CHARS = 8000  # longest tool result sent back to the model (the full result is kept for the number check)

OUT_OF_SCOPE_TEXT = ("I can answer questions about climate extremes in the Actuaries Climate Index for India, "
                     "the UK and Nepal, and about how the index is built. Try one of these:")

# What the visitor sees in the progress box while each tool runs.
STEP_TEXT = {
    "find_place": "Looking up {name}", "resolve_hazard": "Matching \"{word}\" to the index's hazards",
    "resolve_period": "Checking the period", "data_coverage": "Checking what is measured there",
    "get_snapshot": "Scoring the period", "get_extremes": "Finding the record months and years",
    "get_month_profile": "Going month by month", "get_series": "Reading the year-by-year values",
    "get_trend": "Calculating the trend", "compare_periods": "Comparing the two periods",
    "count_exceedances": "Counting the months above the threshold", "list_places": "Listing the places",
    "rank_places": "Ranking the places", "filter_places": "Filtering the places",
    "compare_to_parent": "Comparing the districts with their state", "spread_within": "Measuring the spread",
    "compare_places": "Comparing the places", "neighbours": "Comparing with the neighbouring places",
    "explain_index": "Reading how the index is built", "explain_place_method": "Reading how this place's index is built",
    "explain_value": "Reading what the number means",
}
TOOL_SPECS = [ToolSpec(t.name, t.description, t.parameters) for t in TOOLS] + list(FINISHERS.values())


class Usage:
    def __init__(self, model: str):
        self.model, self.calls, self.input_tokens, self.output_tokens = model, 0, 0, 0

    def add(self, r: Reply) -> Reply:
        self.calls += 1
        self.input_tokens += r.input_tokens
        self.output_tokens += r.output_tokens
        return r

    def card(self) -> dict:
        return {"model": self.model, "calls": self.calls, "inputTokens": self.input_tokens, "outputTokens": self.output_tokens}


async def run_agent(question: str, ctx: ToolContext, model: Model, emit: Callable[[str], None],
                    previous: dict | None = None) -> dict:
    system = system_prompt(ctx.country)
    text = question if not previous else (
        f"Earlier question: {previous.get('question') or '(from a form)'}\n"
        f"Earlier answer: {previous.get('summary', '')}\nFollow-up question: {question}")
    messages: list[dict] = [{"role": "user", "text": text}]
    usage = Usage(model.name)

    # 1. Triage
    emit(f"{model.name} is checking the question")
    r = usage.add(await model.turn(system, messages, [TRIAGE], force="triage"))
    tri = next((c for c in r.calls if c.name == "triage"), None)
    verdict = tri.args if tri else {"in_scope": True, "kinds": [], "reason": "no triage returned"}
    ctx.trace.append({"name": "triage", "args": verdict, "ok": True,
                      "summary": ("in scope: " + ", ".join(verdict.get("kinds") or ["question"])) if verdict.get("in_scope")
                      else f"out of scope: {verdict.get('reason', '')}"})
    if verdict.get("in_scope") is False:
        return _out_of_scope(verdict.get("reason"), ctx, usage)
    if tri:
        messages += [{"role": "assistant", "text": r.text, "calls": [asdict(tri)]},
                     {"role": "tool", "id": tri.id, "name": "triage", "result": {"ok": True}}]

    # 2. Loop
    facts: list[dict] = [{"question": question}, {"earlier": (previous or {}).get("summary", "")}]
    calls_made, nudged, repaired = 0, False, False
    for _ in range(MAX_STEPS):
        r = usage.add(await model.turn(system, messages, TOOL_SPECS))
        if not r.calls:
            if nudged:
                raise AskError("model_error", f"{model.name} answered without using the tools. Try again, or pick another model.", 502)
            nudged = True
            messages += [{"role": "assistant", "text": r.text, "calls": []},
                         {"role": "user", "text": "Use the tools, then finish with final_answer, ask_user or out_of_scope."}]
            continue
        messages.append({"role": "assistant", "text": r.text, "calls": [asdict(c) for c in r.calls]})
        finisher = None
        for c in r.calls:
            if c.name in FINISHERS:
                finisher = finisher or c
                continue
            if calls_made >= MAX_CALLS:
                result = {"error": "Tool-call limit reached. Finish now with final_answer."}
            else:
                emit(_step_text(c.name, c.args))
                result = await call_tool(ctx, c.name, c.args)
                calls_made += 1
                facts.append(result)
            messages.append({"role": "tool", "id": c.id, "name": c.name, "result": _trim(result)})
        if not finisher:
            continue
        if finisher.name == "ask_user":
            return _clarify(finisher.args, ctx, usage)
        if finisher.name == "out_of_scope":
            return _out_of_scope(finisher.args.get("reason"), ctx, usage)
        # final_answer: number check, with one chance to rewrite.
        bad = _ungrounded_numbers(finisher.args, facts)
        if bad and not repaired:
            repaired = True
            emit(f"Some numbers did not match the data ({', '.join(bad)}); asking for a rewrite")
            messages.append({"role": "tool", "id": finisher.id, "name": "final_answer", "result": {
                "error": f"These numbers are not in any tool result: {', '.join(bad)}. Call final_answer again "
                         "using only numbers that appear in the tool results (or no numbers)."}})
            continue
        return _answer(finisher.args, facts, ctx, usage, "repaired" if repaired else "verified")

    # Out of turns: one last forced final answer from what has been gathered.
    emit("Finishing with what has been found so far")
    r = usage.add(await model.turn(system, messages + [{"role": "user", "text": "Finish now with final_answer."}],
                                   [FINAL_ANSWER], force="final_answer"))
    fin = next((c for c in r.calls if c.name == "final_answer"), None)
    if not fin:
        raise AskError("model_error", f"{model.name} did not finish the answer. Try again, or pick another model.", 502)
    return _answer(fin.args, facts, ctx, usage, "verified")


# ---------------------------------------------------------------- finishing

def _answer(args: dict, facts: list[dict], ctx: ToolContext, usage: Usage, status: str) -> dict:
    allowed = _allowed(facts)
    removed: list[str] = []

    def clean(text: str) -> str:
        nonlocal status
        text, r1 = strip_attribution(text or "")
        if ungrounded(text, allowed):
            text, r2 = strip_ungrounded(text, allowed)
            removed.extend(r2)
            status = "stripped"
        removed.extend(r1)
        return text

    headline = clean(args.get("headline", ""))
    sections = [{"kind": "text", "title": s.get("title", ""), "body": body}
                for s in (args.get("sections") or [])[:3] if (body := clean(s.get("body", "")))]
    show = [rid for rid in dict.fromkeys(args.get("show") or []) if rid in ctx.results]
    if not show:  # the model forgot to choose: show what the tools produced, in order
        show = list(ctx.results)[:4]
    sections += [ctx.results[rid] for rid in show]
    followups = [f for f in (args.get("followups") or [])[:3] if isinstance(f, str) and not ungrounded(f, allowed)]
    if not headline:
        headline = "Here is what the index shows." if show else "I couldn't find an answer in the index."
    return {"kind": "answer", "headline": headline, "sections": sections, "followups": followups,
            "notes": _notes(facts), "grounding": {"status": status, "removed": removed},
            "trace": ctx.trace, "usage": usage.card()}


def _clarify(args: dict, ctx: ToolContext, usage: Usage) -> dict:
    options = []
    for o in (args.get("options") or [])[:8]:
        label = str(o.get("label") or "").strip()
        if not label:
            continue
        pid = o.get("id")
        # A real place id lets the page rerun the question with that place chosen; anything else is asked as text.
        options.append({"label": label, "id": pid} if pid and get_place(pid) else {"label": label, "question": label})
    return {"kind": "clarify", "question": args.get("question") or "Which one do you mean?", "options": options,
            "query": args.get("query"), "trace": ctx.trace, "usage": usage.card()}


def _out_of_scope(reason: str | None, ctx: ToolContext, usage: Usage) -> dict:
    msg = (f"{reason.strip()} " if reason else "") + OUT_OF_SCOPE_TEXT
    return {"kind": "out_of_scope", "message": msg, "options": [{"label": q, "question": q} for q in EXAMPLE_QUESTIONS],
            "trace": ctx.trace, "usage": usage.card()}


# ---------------------------------------------------------------- helpers

def _allowed(facts: list[dict]) -> set[float]:
    return allowed_numbers(facts, [dt.date.today().year])


def _ungrounded_numbers(args: dict, facts: list[dict]) -> list[str]:
    allowed = _allowed(facts)
    texts = [args.get("headline", "")] + [s.get("body", "") for s in args.get("sections") or []]
    return sorted({t for x in texts for t in ungrounded(x, allowed)})


def _notes(facts: list[dict]) -> list[str]:
    """Plain notes the tools attached (partial year, mapped place names, different countries...)."""
    out: list[str] = []
    for f in facts:
        for n in [f.get("note")] + list(f.get("notes") or []):
            if isinstance(n, str) and n and n not in out:
                out.append(n)
    if any(f.get("how") == "bharatlas" for f in facts):
        out.append(f"Place lookup: {BHARATLAS_CREDIT}.")
    return out


def _step_text(name: str, args: dict) -> str:
    try:
        return STEP_TEXT.get(name, "Running {name}").format(name=args.get("name", name), word=args.get("word", ""))
    except (KeyError, IndexError):
        return f"Running {name}"


def _trim(result: dict) -> dict:
    s = json.dumps(result, ensure_ascii=False, default=str)
    return result if len(s) <= RESULT_CHARS else {"truncated": True, "json": s[:RESULT_CHARS]}
