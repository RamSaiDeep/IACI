"""Step 1 and 2, paid by the site's Vercel AI Gateway key:
  1. Mammoth-1 (decision model): is the question in scope, and which category? One call.
  2. GPT-5 nano: fill the category's JSON slots (strict schema, minimal reasoning).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json

import httpx

from . import config
from .categories import CHOICES
from .categories.help import TOPIC_CHOICES
from .errors import AskError, provider_error
from .labels import COUNTRY_INFO

# Asked the other way round on purpose: on this site a bare "Chennai vs Hyderabad 2015-2025" IS a climate question,
# so we only turn away messages that are clearly about something else.
UNRELATED_Q = ("This message was typed into a climate-index website. Is it clearly about something OTHER than climate, "
               "weather, climate extremes or hazards (heat, cold, rain, drought, wind, sea level), the climate index, or "
               "how places, regions or years compare? Messages that only name places and/or years are NOT unrelated.")


class Usage:
    def __init__(self):
        self.calls = 0
        self.tokens = 0
        self.cost = 0.0

    def add(self, usage: dict | None, cost) -> None:
        self.calls += 1
        u = usage or {}
        self.tokens += int(u.get("total_tokens") or (u.get("prompt_tokens", 0) + u.get("completion_tokens", 0)) or 0)
        try:
            self.cost += float(cost or 0)
        except (TypeError, ValueError):
            pass

    def card(self) -> dict:
        return {"calls": self.calls, "tokens": self.tokens, "costUsd": round(self.cost, 6),
                "models": [config.ROUTER_MODEL, config.EXTRACT_MODEL]}


async def _post(client: httpx.AsyncClient, path: str, body: dict, model: str) -> dict:
    key = config.gateway_key()
    if not key:
        raise AskError("internal", "The site's AI Gateway key is not configured on the server.", 500)
    for attempt in range(2):
        try:
            r = await client.post(f"{config.GATEWAY_URL}{path}", json=body, timeout=60,
                                  headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        except httpx.HTTPError:
            raise AskError("model_error", "Could not reach the AI Gateway. Try again shortly.", 502)
        if r.status_code != 429 or attempt:
            break
        # shortcut: one retry after Retry-After (max 5 s); add a queue if traffic grows
        try:
            wait = min(float(r.headers.get("retry-after", "2")), 5.0)
        except ValueError:
            wait = 2.0
        await asyncio.sleep(wait)
    if r.status_code >= 400:
        try:
            detail = (r.json().get("error") or {}).get("message", "")
        except Exception:
            detail = ""
        e = provider_error(r.status_code, detail.replace(key, "[redacted]"), model, "The site's AI Gateway")
        if e.code in ("invalid_key", "insufficient_credit"):  # visitor can't fix the site's key
            e = AskError("internal", "The site's question router is unavailable right now. Please try again later.", 503)
        raise e
    return r.json()


def router_input(question: str, country: str, previous: dict | None) -> str:
    txt = f"Selected country: {COUNTRY_INFO[country]['name']}.\n"
    if previous and previous.get("question"):
        txt += f"Previous question: {previous['question']}\n(Previous answer type: {previous.get('category')})\nFollow-up question: "
    else:
        txt += "Question: "
    return txt + question


async def classify(client, question: str, country: str, previous: dict | None, usage: Usage) -> dict:
    body = {"model": config.ROUTER_MODEL, "input": router_input(question, country, previous), "questions": [
        {"type": "predicate", "name": "unrelated", "instructions": UNRELATED_Q},
        {"type": "choice", "name": "category", "instructions": "Which kind of answer does the user want?", "choices": CHOICES},
        # Asked every time so a help question needs no second request (Mammoth-1 allows 5 requests/minute).
        {"type": "choice", "name": "topic", "instructions": "If the user wants an explanation, which topic is it about?",
         "choices": TOPIC_CHOICES},
    ]}
    d = await _post(client, "/decisions", body, config.ROUTER_MODEL)
    usage.add(d.get("usage"), ((d.get("provider_metadata") or {}).get("gateway") or {}).get("cost"))
    ans = {a.get("name"): a for a in d.get("answers", [])}
    rel, cat = ans.get("unrelated", {}), ans.get("category", {})
    if rel.get("type") == "refusal" or cat.get("type") == "refusal":
        return {"related": 0.0, "category": None, "confidence": 0.0, "probabilities": []}
    probs = sorted(cat.get("probabilities", []), key=lambda p: -p.get("probability", 0))
    topic = ans.get("topic", {}).get("choice")
    return {"related": 1 - float(rel.get("probability", 0)), "category": cat.get("choice"), "topic": topic,
            "confidence": float(cat.get("confidence", 0)), "probabilities": probs}


async def extract(client, category: str, schema: dict, question: str, country: str, previous: dict | None, usage: Usage) -> dict:
    today = dt.date.today().isoformat()
    system = (f"Fill the fields for a '{category}' question about the Actuaries Climate Index. Today is {today}. "
              f"The user has selected {COUNTRY_INFO[country]['name']}. Copy place names exactly as written (do not correct "
              "or expand them). Use null for anything not stated: never invent a year, and never infer a season or month "
              "from the hazard (heat does not imply summer). 'last year' means the previous calendar year; 'this year' "
              "the current one.")
    user = question
    if previous and previous.get("slots"):
        user = (f"Previous question: {previous.get('question')}\nPrevious fields: {json.dumps(previous['slots'])}\n"
                f"Follow-up: {question}\nKeep previous fields unless the follow-up changes them.")
    body = {"model": config.EXTRACT_MODEL, "reasoning_effort": "minimal", "max_completion_tokens": 400,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_schema", "json_schema": {"name": category, "strict": True, "schema": schema}}}
    d = await _post(client, "/chat/completions", body, config.EXTRACT_MODEL)
    u = d.get("usage") or {}
    usage.add(u, u.get("cost"))
    try:
        return json.loads(d["choices"][0]["message"]["content"] or "{}")
    except (KeyError, IndexError, json.JSONDecodeError):
        raise AskError("model_error", "The question could not be read. Try rephrasing it.", 502)
