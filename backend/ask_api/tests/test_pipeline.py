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


def test_help_needs_no_key(fake, monkeypatch):
    fake["cls"] = {"related": 0.9, "category": "help", "confidence": 0.9, "probabilities": [], "topic": "drought"}
    out, _ = run({"country": "india", "question": "What does drought mean?"}, key=None)
    r = out["report"]
    assert r["feature"] == "help" and r["usage"]["provider"] == "none" and r["router"]["calls"] == 1
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
