"""The agent loop with a scripted fake model (no provider, no network, no cost).

Each script step is a function that sees the conversation so far and returns that turn's Reply, so a
step can read real tool results (place ids, result ids, values) the way a real model would.
"""

import asyncio

import pytest

from ask_api.agent.loop import MAX_STEPS, run_agent
from ask_api.agent.model import Call, Reply
from ask_api.errors import AskError
from ask_api.tools.context import ToolContext

MUMBAI = "india/district/MAHARASHTRA/MUMBAI"


class ScriptedModel:
    name = "fake-model"

    def __init__(self, *steps):
        self.steps, self.seen = list(steps), []

    async def turn(self, system, messages, tools, force=None):
        self.seen.append({"system": system, "tools": [t.name for t in tools], "force": force, "messages": list(messages)})
        step = self.steps.pop(0)
        r = step(messages) if callable(step) else step
        r.input_tokens, r.output_tokens = 100, 20
        return r


def call(tool, /, **args):
    return Reply(calls=[Call(f"c_{tool}", tool, args)])


def in_scope(*kinds):
    return call("triage", in_scope=True, kinds=list(kinds), reason="climate question")


def last_result(messages, name):
    return next(m["result"] for m in reversed(messages) if m["role"] == "tool" and m["name"] == name)


def run(model, question="How was 2024 for Mumbai?", **ctx_kw):
    ctx = ToolContext("india", **ctx_kw)
    steps: list[str] = []
    out = asyncio.run(run_agent(question, ctx, model, steps.append))
    return out, steps, model


def snapshot_steps(final):
    """triage -> find_place -> get_snapshot -> `final(messages)`."""
    return (in_scope("snapshot"),
            call("find_place", name="Mumbai"),
            lambda m: call("get_snapshot", place_id=last_result(m, "find_place")["place"]["id"], period={"year": 2024}),
            final)


def good_final(m):
    s = last_result(m, "get_snapshot")
    return call("final_answer", headline=f"Mumbai's 2024 overall index was {s['overall']['value']:+.2f}, rank "
                                         f"{s['overall']['rank']} of {s['overall']['of_years']}.",
                sections=[{"title": "Heat", "body": "Extreme heat stood out."}], show=s["show"],
                followups=["What about the monsoon?"])


# ---------------------------------------------------------------- happy path

def test_snapshot_answer_end_to_end():
    out, steps, model = run(ScriptedModel(*snapshot_steps(good_final)))
    assert out["kind"] == "answer" and out["grounding"]["status"] == "verified"
    assert out["headline"].startswith("Mumbai's 2024 overall index was")
    kinds = [s["kind"] for s in out["sections"]]
    assert kinds == ["text", "table", "lines"]  # model's paragraph, then our table and chart
    assert [t["name"] for t in out["trace"]] == ["triage", "find_place", "get_snapshot"]
    assert out["usage"] == {"model": "fake-model", "calls": 4, "inputTokens": 400, "outputTokens": 80}
    assert "Looking up Mumbai" in steps and "Scoring the period" in steps


def test_triage_is_forced_and_prompt_has_context():
    _, _, model = run(ScriptedModel(*snapshot_steps(good_final)))
    first = model.seen[0]
    assert first["force"] == "triage" and first["tools"] == ["triage"]
    assert "India" in first["system"] and "1991-2020" in first["system"]
    assert "final_answer" in model.seen[1]["tools"] and "get_trend" in model.seen[1]["tools"]


# ---------------------------------------------------------------- scope

def test_off_topic_stops_after_triage():
    out, _, model = run(ScriptedModel(call("triage", in_scope=False, kinds=[], reason="That's about cricket.")),
                        question="Who won the cricket?")
    assert out["kind"] == "out_of_scope" and len(out["options"]) == 4
    assert "cricket" not in out["message"] and "Try one of these" in out["message"]  # triage reason stays in the trace
    assert "cricket" in out["trace"][0]["summary"] and len(model.seen) == 1


def test_model_can_decline_later_in_the_loop():
    out, _, _ = run(ScriptedModel(in_scope("trend"), call("out_of_scope", reason="The index doesn't forecast.")),
                    question="Will 2030 be hotter in Delhi?")
    assert out["kind"] == "out_of_scope" and out["message"].startswith("The index doesn't forecast.")


# ---------------------------------------------------------------- places

def test_ambiguous_place_asks_then_reruns_with_the_choice():
    def ask(m):
        fp = last_result(m, "find_place")
        return call("ask_user", question=fp["message"], options=fp["options"], query="Aurangabad")
    out, _, _ = run(ScriptedModel(in_scope("snapshot"), call("find_place", name="Aurangabad"), ask),
                    question="How was 2024 for Aurangabad?")
    assert out["kind"] == "clarify" and out["query"] == "Aurangabad" and all("id" in o for o in out["options"])

    picked = out["options"][0]["id"]
    model = ScriptedModel(in_scope("snapshot"), call("find_place", name="Aurangabad"),
                          lambda m: call("final_answer", headline="ok", sections=[], show=[], followups=[]))
    run(model, question="How was 2024 for Aurangabad?", resolved={"aurangabad": picked})
    assert last_result(model.seen[-1]["messages"], "find_place")["place"]["id"] == picked


def test_tool_errors_go_back_to_the_model():
    model = ScriptedModel(in_scope("snapshot"), call("get_snapshot", place_id="nowhere"),
                          lambda m: call("final_answer", headline="I couldn't find that place.", sections=[], show=[], followups=[]))
    out, _, model = run(model)
    assert "Unknown place id" in last_result(model.seen[-1]["messages"], "get_snapshot")["error"]
    assert out["kind"] == "answer" and out["trace"][1]["ok"] is False


# ---------------------------------------------------------------- number check

def test_made_up_number_gets_one_rewrite():
    bad = lambda m: call("final_answer", headline="Mumbai hit 9.87 in 2024.", sections=[], show=[], followups=[])  # noqa: E731
    out, steps, model = run(ScriptedModel(*snapshot_steps(bad), good_final))
    assert out["grounding"]["status"] == "repaired" and "9.87" not in out["headline"]
    assert "9.87" in last_result(model.seen[-1]["messages"], "final_answer")["error"]
    assert any("did not match the data" in s for s in steps)


def test_still_wrong_after_rewrite_is_removed():
    bad = lambda m: call("final_answer", headline="Mumbai was warm. It hit 9.87 in 2024.",  # noqa: E731
                         sections=[{"title": "x", "body": "Rainfall was 7.77 above normal."}], show=[], followups=["Was 6.66 a record?"])
    out, _, _ = run(ScriptedModel(*snapshot_steps(bad), bad))
    assert out["grounding"]["status"] == "stripped" and out["headline"] == "Mumbai was warm."
    assert out["followups"] == [] and all("7.77" not in s.get("body", "") for s in out["sections"])


def test_claims_of_cause_are_removed():
    def final(m):
        s = last_result(m, "get_snapshot")
        return call("final_answer", headline="It was a hot year. This was caused by climate change.", sections=[],
                    show=s["show"], followups=[])
    out, _, _ = run(ScriptedModel(*snapshot_steps(final)))
    assert out["headline"] == "It was a hot year." and out["grounding"]["removed"]


def test_missing_headline_uses_first_paragraph():
    out, _, _ = run(ScriptedModel(*snapshot_steps(lambda m: call(
        "final_answer", headline="", sections=[{"title": "", "body": "Mumbai had a warm year."}], show=[], followups=[]))))
    assert out["headline"] == "Mumbai had a warm year." and out["sections"][0]["kind"] == "table"


def test_empty_turn_after_data_forces_final_answer():
    model = ScriptedModel(in_scope("snapshot"), call("find_place", name="Mumbai"), Reply(),
                          lambda m: call("final_answer", headline="Mumbai is a district.", sections=[], show=[], followups=[]))
    out, _, model = run(model)
    assert out["kind"] == "answer" and model.seen[-1]["force"] == "final_answer" and model.seen[-1]["tools"] == ["final_answer"]


def test_unknown_result_ids_are_ignored_and_empty_show_falls_back():
    out, _, _ = run(ScriptedModel(*snapshot_steps(
        lambda m: call("final_answer", headline="Done.", sections=[], show=["r99"], followups=[]))))
    assert [s["kind"] for s in out["sections"]] == ["table", "lines"]


# ---------------------------------------------------------------- limits

def test_answering_without_tools_twice_is_an_error():
    with pytest.raises(AskError, match="without using the tools"):
        run(ScriptedModel(in_scope("snapshot"), Reply(text="It was hot."), Reply(text="Really hot.")))


def test_running_out_of_turns_forces_a_final_answer():
    steps = [in_scope("snapshot")] + [call("find_place", name="Mumbai")] * MAX_STEPS + \
            [call("final_answer", headline="Mumbai is a district in Maharashtra.", sections=[], show=[], followups=[])]
    out, _, model = run(ScriptedModel(*steps))
    assert out["kind"] == "answer" and model.seen[-1]["force"] == "final_answer"


def test_follow_up_carries_the_earlier_answer():
    model = ScriptedModel(*snapshot_steps(good_final))
    ctx = ToolContext("india")
    asyncio.run(run_agent("And the monsoon?", ctx, model, lambda _t: None,
                          previous={"question": "How was 2024 for Mumbai?", "summary": "Mumbai: 2024. It was hot."}))
    first_user = model.seen[0]["messages"][0]["text"]
    assert "Earlier question: How was 2024 for Mumbai?" in first_user and "Follow-up question: And the monsoon?" in first_user
