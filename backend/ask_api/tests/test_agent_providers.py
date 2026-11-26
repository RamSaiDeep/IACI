"""Provider adapters against a mocked HTTP layer: the exact request each sends, and how replies are read."""

import asyncio
import json

import httpx
import pytest

from ask_api.agent.loop import run_agent
from ask_api.agent.model import ToolSpec
from ask_api.agent.providers import (OPENROUTER_FALLBACK, AnthropicModel, OpenAIStyleModel, anthropic_messages,
                                     make_model, openai_messages)
from ask_api.errors import AskError
from ask_api.tools.context import ToolContext

KEY = "sk-test-SECRET"
TOOL = ToolSpec("find_place", "Find a place.", {"type": "object", "additionalProperties": False, "required": ["name"],
                                                "properties": {"name": {"type": "string"}}})
CONVO = [
    {"role": "user", "text": "How was 2024 for Mumbai?"},
    {"role": "assistant", "text": None, "calls": [{"id": "t1", "name": "find_place", "args": {"name": "Mumbai"}},
                                                  {"id": "t2", "name": "find_place", "args": {"name": "Delhi"}}]},
    {"role": "tool", "id": "t1", "name": "find_place", "result": {"status": "found"}},
    {"role": "tool", "id": "t2", "name": "find_place", "result": {"status": "found"}},
    {"role": "user", "text": "Finish now."},
]


def mock(*replies):
    """An AsyncClient whose requests are recorded and answered from `replies` (status, json) in order."""
    sent, queue = [], list(replies)

    def handler(request: httpx.Request):
        sent.append({"url": str(request.url), "headers": dict(request.headers), "body": json.loads(request.content)})
        status, body = queue.pop(0)
        return httpx.Response(status, json=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), sent


def turn(model, messages=CONVO, tools=(TOOL,), force=None):
    return asyncio.run(model.turn("SYSTEM", list(messages), list(tools), force))


# ---------------------------------------------------------------- choosing a model

def test_make_model_checks_key_name_and_provider():
    c = httpx.AsyncClient()
    with pytest.raises(AskError) as e:
        make_model("openrouter", None, None, c)
    assert e.value.code == "missing_key"
    with pytest.raises(AskError):
        make_model("openrouter", "bad name; drop", KEY, c)
    with pytest.raises(AskError):
        make_model("nope", None, KEY, c)
    assert isinstance(make_model("anthropic", None, KEY, c), AnthropicModel)
    assert make_model("openrouter", None, KEY, c).name == "google/gemma-4-31b-it:free"


# ---------------------------------------------------------------- Anthropic

def test_anthropic_messages_alternate_and_carry_tool_results():
    out = anthropic_messages(CONVO)
    assert [m["role"] for m in out] == ["user", "assistant", "user"]
    assert [b["type"] for b in out[1]["content"]] == ["tool_use", "tool_use"]
    assert [b["type"] for b in out[2]["content"]] == ["tool_result", "tool_result", "text"]  # merged into one turn
    assert out[2]["content"][0]["tool_use_id"] == "t1"


def test_anthropic_request_and_reply():
    client, sent = mock((200, {"content": [{"type": "text", "text": "Looking."},
                                           {"type": "tool_use", "id": "tu1", "name": "find_place", "input": {"name": "Pune"}}],
                               "usage": {"input_tokens": 50, "output_tokens": 9}}))
    r = turn(AnthropicModel("claude-sonnet-5-5", KEY, client), force="find_place")
    req = sent[0]
    assert req["headers"]["x-api-key"] == KEY and req["body"]["system"] == "SYSTEM"
    assert req["body"]["tools"][0]["input_schema"]["required"] == ["name"]
    assert req["body"]["tool_choice"] == {"type": "tool", "name": "find_place"}
    assert r.text == "Looking." and r.calls[0].args == {"name": "Pune"} and (r.input_tokens, r.output_tokens) == (50, 9)
    client2, sent2 = mock((200, {"content": [], "usage": {}}))
    turn(AnthropicModel("m", KEY, client2))
    assert sent2[0]["body"]["tool_choice"] == {"type": "any"}  # must call some tool


# ---------------------------------------------------------------- OpenAI style

def test_openai_messages_shape():
    out = openai_messages(CONVO)
    assert [m["role"] for m in out] == ["user", "assistant", "tool", "tool", "user"]
    assert json.loads(out[1]["tool_calls"][0]["function"]["arguments"]) == {"name": "Mumbai"}
    assert out[2]["tool_call_id"] == "t1"


def openai_reply(calls, text=None):
    return (200, {"choices": [{"message": {"content": text, "tool_calls": [
        {"id": f"id{i}", "type": "function", "function": {"name": n, "arguments": a}} for i, (n, a) in enumerate(calls)]}}],
        "usage": {"prompt_tokens": 70, "completion_tokens": 12}})


def test_openrouter_sends_fallback_and_requires_tools():
    client, sent = mock(openai_reply([("find_place", '{"name": "Pune"}')]))
    r = turn(make_model("openrouter", None, KEY, client))
    body = sent[0]["body"]
    assert sent[0]["url"].startswith("https://openrouter.ai/") and sent[0]["headers"]["authorization"] == f"Bearer {KEY}"
    assert body["models"] == ["google/gemma-4-31b-it:free", OPENROUTER_FALLBACK]
    assert body["provider"] == {"require_parameters": True} and body["tool_choice"] == "required"
    assert body["messages"][0] == {"role": "system", "content": "SYSTEM"}
    assert r.calls[0].name == "find_place" and r.calls[0].args == {"name": "Pune"} and r.input_tokens == 70


def test_gemini_drops_additional_properties_and_forces_a_tool():
    client, sent = mock(openai_reply([("find_place", "{}")]))
    turn(make_model("gemini", None, KEY, client), force="find_place")
    body = sent[0]["body"]
    assert "generativelanguage.googleapis.com" in sent[0]["url"] and "models" not in body
    assert "additionalProperties" not in json.dumps(body["tools"])
    assert body["tool_choice"] == {"type": "function", "function": {"name": "find_place"}}


def test_bad_json_arguments_become_empty_args():
    client, _ = mock(openai_reply([("find_place", "{not json")]))
    assert turn(make_model("openrouter", "x/y", KEY, client)).calls[0].args == {}


def test_tool_choice_not_supported_retries_with_auto():
    client, sent = mock((400, {"error": {"message": "tool_choice 'required' is not supported"}}),
                        openai_reply([("find_place", '{"name": "Pune"}')]))
    r = turn(make_model("openrouter", "x/y", KEY, client))
    assert [s["body"]["tool_choice"] for s in sent] == ["required", "auto"] and r.calls


# ---------------------------------------------------------------- errors

@pytest.mark.parametrize("status,code", [(401, "invalid_key"), (402, "insufficient_credit"), (429, "rate_limited"),
                                         (404, "model_error"), (503, "overloaded")])
def test_provider_errors_are_plain_and_never_show_the_key(status, code):
    client, _ = mock((status, {"error": {"message": f"key {KEY} problem"}}))
    with pytest.raises(AskError) as e:
        turn(make_model("openrouter", "x/y", KEY, client))
    assert e.value.code == code and KEY not in e.value.message


# ---------------------------------------------------------------- the loop through a real adapter

def test_run_agent_through_the_openai_adapter():
    client, sent = mock(
        openai_reply([("triage", '{"in_scope": true, "kinds": ["explain"], "reason": "about the index"}')]),
        openai_reply([("explain_value", '{"value": 1.6}')]),
        openai_reply([("final_answer", json.dumps({"headline": "A score of 1.6 is Elevated.", "sections": [],
                                                   "show": [], "followups": []}))]))
    ctx = ToolContext("india")
    out = asyncio.run(run_agent("What does 1.6 mean?", ctx, make_model("openrouter", None, KEY, client), lambda _t: None))
    assert out["kind"] == "answer" and out["headline"] == "A score of 1.6 is Elevated."
    assert [t["name"] for t in out["trace"]] == ["triage", "explain_value"]
    last = sent[-1]["body"]["messages"]
    assert last[-1]["role"] == "tool" and json.loads(last[-1]["content"])["band"] == "Elevated"


def test_missing_call_ids_are_unique_across_turns():
    no_id = (200, {"choices": [{"message": {"tool_calls": [{"type": "function", "function": {"name": "find_place", "arguments": "{}"}}]}}]})
    client, _ = mock(no_id, no_id)
    m = make_model("openrouter", "x/y", KEY, client)
    a, b = turn(m).calls[0].id, turn(m).calls[0].id
    assert a != b and a.startswith("call_")
