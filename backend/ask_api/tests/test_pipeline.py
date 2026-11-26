"""Pipeline with the gateway and writer faked (no network, no cost)."""

import asyncio
import json

import pytest

from ask_api import pipeline
from ask_api.errors import AskError
from ask_api.grounding import allowed_numbers, strip_attribution, ungrounded
from ask_api.writer import Writer, parse_narrative


def run(body, key="k", monkey=None):
    steps = []
    out = asyncio.run(pipeline.run_ask(body, key, steps.append))
    return out, steps


@pytest.fixture
def fake(monkeypatch):
    state = {"cls": {"related": 0.95, "category": "snapshot", "confidence": 0.99, "probabilities": []},
             "slots": {"place": "Nellore", "year": 2024, "season": None, "month": None}, "replies": []}

    async def classify(client, q, c, prev, usage):
        usage.add({"total_tokens": 300}, "0.00003")
        return state["cls"]

    async def extract(client, cat, schema, q, c, prev, usage):
        usage.add({"total_tokens": 150}, "0.00002")
        return state["slots"]

    async def complete(self, client, system, user, max_tokens):
        self.calls += 1
        state.setdefault("prompts", []).append(user)
        return state["replies"].pop(0)

    monkeypatch.setattr(pipeline, "classify", classify)
    monkeypatch.setattr(pipeline, "extract", extract)
    monkeypatch.setattr(Writer, "_complete", complete)
    return state


def test_out_of_scope_returns_examples(fake):
    fake["cls"] = {"related": 0.1, "category": "snapshot", "confidence": 0.9, "probabilities": []}
    out, _ = run({"country": "india", "question": "Who won the cricket?"})
    assert out["kind"] == "clarify" and all("question" in o for o in out["options"])


def test_low_confidence_offers_two_categories(fake):
    fake["cls"] = {"related": 0.9, "category": "trend", "confidence": 0.4,
                   "probabilities": [{"value": "trend", "probability": 0.4}, {"value": "snapshot", "probability": 0.35}]}
    out, _ = run({"country": "india", "question": "Guntur heat"})
    assert [o["category"] for o in out["options"]] == ["trend", "snapshot"]


def test_snapshot_end_to_end_with_repair(fake):
    fake["replies"] = [
        json.dumps({"headline": "Nellore hit 9.99 in 2024.", "sections": {"regional": "x"}, "followups": []}),
        json.dumps({"headline": "Nellore's 2024 was above normal.", "sections": {"regional": "Close to its neighbours."},
                    "followups": ["And the monsoon?"]}),
    ]
    out, steps = run({"country": "india", "question": "How was 2024 for Nellore?", "provider": "openrouter", "model": "x/y"})
    r = out["report"]
    assert out["kind"] == "report" and r["feature"] == "snapshot"
    assert r["title"].startswith("Sri Potti Sriramulu Nellore")
    assert r["grounding"]["status"] == "repaired"
    assert r["router"]["calls"] == 2 and r["usage"]["calls"] == 2
    assert any("Mammoth-1" in s for s in steps) and any("GPT-5 nano" in s for s in steps)
    assert r["request"]["slots"]["place"] == "Nellore"


def test_ambiguous_place_returns_options_and_slots(fake):
    fake["slots"] = {"place": "Aurangabad", "year": 2024, "season": None, "month": None}
    out, _ = run({"country": "india", "question": "Aurangabad 2024"})
    assert out["kind"] == "clarify" and out["category"] == "snapshot" and out["slots"]["place"] == "Aurangabad"
    assert len(out["options"]) >= 2 and all("id" in o for o in out["options"])


def test_forced_category_and_slots_skip_the_router(fake):
    fake["cls"] = None  # would crash if called
    fake["replies"] = [json.dumps({"headline": "Fine.", "sections": {}, "followups": []})]
    out, _ = run({"country": "india", "category": "trend", "slots": {"place": "Guntur", "hazard": None, "season": None,
                                                                      "from_year": None, "to_year": None}})
    assert out["report"]["router"]["calls"] == 0


def test_missing_key_is_refused_before_writing(fake):
    with pytest.raises(AskError) as e:
        run({"country": "india", "question": "How was 2024 for Guntur?"}, key=None)
    assert e.value.code == "missing_key"


@pytest.mark.parametrize("cat", ["help", "event"])
def test_chat_outside_four_types_lists_them(fake, cat):
    fake["cls"] = {"related": 0.9, "category": cat, "confidence": 0.9, "probabilities": [], "topic": "drought"}
    out, _ = run({"country": "india", "question": "What does drought mean?"}, key=None)
    assert out["kind"] == "clarify" and "four kinds" in out["question"] and len(out["options"]) == 4


def test_help_needs_no_key(fake, monkeypatch):
    fake["cls"] = None  # chosen by category, so the router is never asked
    out, _ = run({"country": "india", "category": "help", "slots": {"topic": "drought"}}, key=None)
    r = out["report"]
    assert r["feature"] == "help" and r["usage"]["provider"] == "none" and r["router"]["calls"] == 0
    assert "dry days" in r["sections"][0]["body"]


def test_grounding_and_attribution():
    allowed = allowed_numbers({"v": 0.551, "rank": 3, "label": "rank 3 of 35"})
    assert ungrounded("It was 0.55 and ranked 3 of 35.", allowed) == []
    assert ungrounded("It was 0.62.", allowed) == ["0.62"]
    text, removed = strip_attribution("July was wet. The floods were caused by climate change.")
    assert text == "July was wet." and removed


def test_parse_narrative_tolerates_prose_around_json():
    n = parse_narrative('Sure! {"headline": "H", "sections": {"a": "A", "zz": "drop"}, "followups": ["q"]} thanks',
                        {"a": "hint"})
    assert n == {"headline": "H", "sections": {"a": "A"}, "followups": ["q"]}


def test_rate_limit_is_waited_out_with_a_notice(monkeypatch):
    import httpx
    from ask_api import router

    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"retry-after": "0"}, json={"error": {"message": "limit"}})
        return httpx.Response(200, json={"answers": [{"name": "unrelated", "probability": 0.01},
                                                     {"name": "category", "choice": "trend", "confidence": 0.9}]})

    async def go():
        notes = []
        router.WAIT_NOTICE.set(notes.append)
        monkeypatch.setattr(router.config, "gateway_key", lambda: "test")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            out = await router.classify(c, "Is heat rising in Guntur?", "india", None, router.Usage())
        return out, notes

    out, notes = asyncio.run(go())
    assert out["category"] == "trend" and len(calls) == 2 and "busy" in notes[0]


# ---------------------------------------------------------------- v3: typed questions go to the agent (ASK_AGENT=1)

@pytest.fixture
def agent_on(monkeypatch, fake):
    """Agent switched on, with run_agent replaced by a canned result (the loop has its own tests)."""
    seen = {}

    async def fake_agent(question, ctx, model, emit, previous=None):
        seen.update(question=question, resolved=ctx.resolved, model=model.name, previous=previous)
        return seen.pop("reply")

    monkeypatch.setattr(pipeline.config, "AGENT_ENABLED", True)
    monkeypatch.setattr(pipeline, "run_agent", fake_agent)
    return seen


def test_typed_question_becomes_an_agent_report(agent_on):
    agent_on["reply"] = {"kind": "answer", "headline": "Heat is rising.", "sections": [{"kind": "text", "title": "", "body": "x"}],
                         "followups": ["And rain?"], "notes": ["2026 so far."], "grounding": {"status": "verified", "removed": []},
                         "trace": [{"name": "triage", "args": {}, "ok": True, "summary": "in scope"}],
                         "usage": {"model": "m", "calls": 3, "inputTokens": 10, "outputTokens": 5}}
    out, _ = run({"country": "india", "question": "Is heat rising in Delhi?", "provider": "openrouter",
                  "resolved": {"Delhi": "india/state/DELHI"}})
    r = out["report"]
    assert out["kind"] == "report" and r["feature"] == "answer" and r["router"] is None
    assert r["headline"] == "Heat is rising." and r["notes"][-1] == "2026 so far." and len(r["notes"]) > 1
    assert r["request"] == {"country": "india", "question": "Is heat rising in Delhi?", "category": None, "slots": None}
    assert agent_on["resolved"] == {"delhi": "india/state/DELHI"} and agent_on["model"] == "google/gemma-4-31b-it:free"


def test_agent_clarify_and_out_of_scope_use_the_clarify_shape(agent_on):
    agent_on["reply"] = {"kind": "clarify", "question": "Which one?", "options": [{"label": "A", "id": "india/state/DELHI"}],
                         "query": "Aurangabad", "trace": []}
    out, _ = run({"country": "india", "question": "Aurangabad 2024"})
    assert out == {"kind": "clarify", "question": "Which one?", "options": [{"label": "A", "id": "india/state/DELHI"}],
                   "query": "Aurangabad", "category": None, "slots": None, "trace": []}
    agent_on["reply"] = {"kind": "out_of_scope", "message": "Try one of these:", "options": [{"label": "q", "question": "q"}], "trace": []}
    out, _ = run({"country": "india", "question": "cricket?"})
    assert out["kind"] == "clarify" and out["question"] == "Try one of these:" and out["options"][0]["question"] == "q"


def test_forms_skip_the_agent_even_when_it_is_on(agent_on, fake):
    fake["cls"] = None
    fake["replies"] = [json.dumps({"headline": "Fine.", "sections": {}, "followups": []})]
    out, _ = run({"country": "india", "category": "trend", "slots": {"place": "Guntur", "hazard": None, "season": None,
                                                                      "from_year": None, "to_year": None}})
    assert out["report"]["feature"] == "trend" and "question" not in agent_on


def test_agent_needs_a_key(agent_on):
    with pytest.raises(AskError) as e:
        run({"country": "india", "question": "How was 2024 for Mumbai?"}, key=None)
    assert e.value.code == "missing_key"


def test_models_free_endpoint(monkeypatch):
    from fastapi.testclient import TestClient

    from ask_api import main

    async def fake_free(client):
        return ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"]

    monkeypatch.setattr(main, "free_tool_models", fake_free)
    r = TestClient(main.app).get("/models/free")
    assert r.status_code == 200 and r.json()["default"] == "google/gemma-4-31b-it:free"
