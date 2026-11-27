"""Connections to the visitor's chosen model, speaking the loop's neutral format (see model.py).

    AnthropicModel    Anthropic Messages API, native tool use
    OpenAIStyleModel  the OpenAI chat-completions format, used by both Google Gemini (its OpenAI-compatible
                      endpoint) and OpenRouter (any model, incl. the free defaults below)
    make_model        picks the adapter from the visitor's provider choice

The visitor's key is used for this request only: never logged, stored or echoed (it is removed from any
provider error text before that text is shown).
"""

from __future__ import annotations

import json
import re
import time
import uuid

import httpx

from ..errors import AskError, provider_error
from .model import Call, Reply, ToolSpec

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

DEFAULT_MODELS = {"anthropic": "claude-sonnet-5-5", "gemini": "gemini-2.5-flash",
                  "openrouter": "google/gemma-4-31b-it:free"}
# OpenRouter tries these in order within one request when the first is rate-limited or down (both free).
OPENROUTER_FALLBACK = "nvidia/nemotron-3.5-lightning:free"

# Free OpenRouter models with tool calling (26 Nov 2026); used when the live list can't be fetched.
FREE_TOOL_MODELS = [
    "google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free", "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3.5-super-vl:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "inclusionai/ling-3.2-flash:free",
    "baidu/ernie-5.5-flash-preview:free", "particle-ai/particle-1:free", "recursive/flint-v1.0:free",
    "liquid/lfm-3-1.7b:free",
]
CATALOG_URL = "https://openrouter.ai/api/v1/models"
CATALOG_TTL = 24 * 3600
_catalog: dict = {"at": 0.0, "models": []}

MAX_TOKENS = 8192  # reasoning models spend much of this thinking (seen: 2,700 before a final answer); too low = empty reply
TIMEOUT = 110.0


def make_model(provider: str, model: str | None, key: str | None, client: httpx.AsyncClient) -> "AnthropicModel | OpenAIStyleModel":
    if provider not in DEFAULT_MODELS:
        raise AskError("bad_request", "Unknown provider.")
    if not key:
        raise AskError("missing_key", "Set your API key to get answers.", 401)
    name = (model or "").strip() or DEFAULT_MODELS[provider]
    if not re.fullmatch(r"[\w.:/-]{1,100}", name):
        raise AskError("bad_request", "That model name looks invalid. Copy it exactly from the provider's model list.")
    if provider == "anthropic":
        return AnthropicModel(name, key, client)
    if provider == "gemini":
        return OpenAIStyleModel(name, key, client, GEMINI_URL, "Google Gemini", strip_additional_properties=True)
    return OpenAIStyleModel(name, key, client, OPENROUTER_URL, "OpenRouter",
                            fallbacks=[OPENROUTER_FALLBACK] if name != OPENROUTER_FALLBACK else [])


# ---------------------------------------------------------------- OpenRouter's public model list

async def openrouter_catalog(client: httpx.AsyncClient) -> list[dict]:
    """OpenRouter's public model list (no key needed), cached for a day. [] if it can't be fetched."""
    if _catalog["models"] and time.time() - _catalog["at"] < CATALOG_TTL:
        return _catalog["models"]
    try:
        r = await client.get(CATALOG_URL, headers={"User-Agent": "iaci-ask/1.0"}, timeout=15)
        models = r.json()["data"] if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError, KeyError):
        models = []
    if models:
        _catalog.update(at=time.time(), models=models)
    return models or _catalog["models"]


def _is_free(m: dict) -> bool:
    p = m.get("pricing") or {}
    try:
        return float(p.get("prompt", 1)) == 0 and float(p.get("completion", 1)) == 0
    except (TypeError, ValueError):
        return False


async def free_tool_models(client: httpx.AsyncClient) -> list[str]:
    """Free OpenRouter models that support tool calling: the default first, then its fallback, then the rest."""
    live = [m["id"] for m in await openrouter_catalog(client)
            if _is_free(m) and "tools" in (m.get("supported_parameters") or []) and m["id"] != "openrouter/free"]
    ids = live or FREE_TOOL_MODELS
    first = [i for i in (DEFAULT_MODELS["openrouter"], OPENROUTER_FALLBACK) if i in ids]
    return first + sorted(i for i in ids if i not in first)


async def supports_tools(client: httpx.AsyncClient, model: str) -> bool | None:
    """For an OpenRouter model id: True/False from its listing, or None if it isn't listed (can't tell)."""
    m = next((m for m in await openrouter_catalog(client) if m.get("id") == model), None)
    return None if m is None else "tools" in (m.get("supported_parameters") or [])


# ---------------------------------------------------------------- shared

async def _post(client: httpx.AsyncClient, url: str, body: dict, headers: dict, key: str, model: str, who: str) -> dict:
    try:
        r = await client.post(url, json=body, headers=headers, timeout=TIMEOUT)
    except httpx.HTTPError:
        raise AskError("model_error", f"Could not reach {who}. Check your connection and try again.", 502)
    if r.status_code >= 400:
        raise provider_error(r.status_code, _error_text(r).replace(key, "[redacted]"), model, who)
    return r.json()


def _error_text(r: httpx.Response) -> str:
    try:
        j = r.json()
        j = j[0] if isinstance(j, list) else j
        e = j.get("error")
        return (e.get("message", "") if isinstance(e, dict) else str(e or "")) or ""
    except Exception:  # noqa: BLE001 - any unreadable body just means no detail
        return ""


def _args(raw) -> dict:
    """Tool arguments arrive as a dict (Anthropic) or a JSON string (OpenAI style); bad JSON -> {}."""
    if isinstance(raw, dict):
        return raw
    try:
        v = json.loads(raw or "{}")
        return v if isinstance(v, dict) else {}
    except json.JSONDecodeError:
        return {}


def _result_text(result: dict) -> str:
    return json.dumps(result, ensure_ascii=False, default=str)


# ---------------------------------------------------------------- Anthropic

class AnthropicModel:
    def __init__(self, name: str, key: str, client: httpx.AsyncClient):
        self.name, self._key, self._client = name, key, client

    async def turn(self, system: str, messages: list[dict], tools: list[ToolSpec], force: str | None = None) -> Reply:
        body = {"model": self.name, "max_tokens": MAX_TOKENS, "system": system,
                "messages": anthropic_messages(messages),
                "tools": [{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools],
                "tool_choice": {"type": "tool", "name": force} if force else {"type": "any"}}
        headers = {"x-api-key": self._key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        d = await _post(self._client, ANTHROPIC_URL, body, headers, self._key, self.name, "Anthropic")
        blocks = d.get("content") or []
        u = d.get("usage") or {}
        return Reply(text="".join(b.get("text", "") for b in blocks if b.get("type") == "text") or None,
                     calls=[Call(b["id"], b["name"], _args(b.get("input"))) for b in blocks if b.get("type") == "tool_use"],
                     input_tokens=int(u.get("input_tokens") or 0), output_tokens=int(u.get("output_tokens") or 0))


def anthropic_messages(messages: list[dict]) -> list[dict]:
    """Neutral -> Anthropic. Tool results go inside a user turn, and consecutive user turns are merged,
    because Anthropic requires user and assistant turns to alternate."""
    out: list[dict] = []

    def add(role: str, blocks: list[dict]):
        if out and out[-1]["role"] == role:
            out[-1]["content"].extend(blocks)
        else:
            out.append({"role": role, "content": blocks})

    for m in messages:
        if m["role"] == "user":
            add("user", [{"type": "text", "text": m["text"]}])
        elif m["role"] == "tool":
            add("user", [{"type": "tool_result", "tool_use_id": m["id"], "content": _result_text(m["result"])}])
        else:
            blocks = [{"type": "text", "text": m["text"]}] if m.get("text") else []
            blocks += [{"type": "tool_use", "id": c["id"], "name": c["name"], "input": c["args"]} for c in m.get("calls") or []]
            add("assistant", blocks or [{"type": "text", "text": "(no reply)"}])
    return out


# ---------------------------------------------------------------- OpenAI style (Gemini, OpenRouter)

class OpenAIStyleModel:
    def __init__(self, name: str, key: str, client: httpx.AsyncClient, url: str, who: str,
                 fallbacks: list[str] | None = None, strip_additional_properties: bool = False):
        self.name, self._key, self._client, self._url, self._who = name, key, client, url, who
        self._fallbacks = fallbacks or []
        self._strip = strip_additional_properties

    async def turn(self, system: str, messages: list[dict], tools: list[ToolSpec], force: str | None = None) -> Reply:
        body = {"model": self.name, "max_tokens": MAX_TOKENS,
                "messages": [{"role": "system", "content": system}] + openai_messages(messages),
                "tools": [{"type": "function", "function": {"name": t.name, "description": t.description,
                                                             "parameters": _clean_schema(t.parameters) if self._strip else t.parameters}}
                          for t in tools],
                "tool_choice": {"type": "function", "function": {"name": force}} if force else "required"}
        if self._fallbacks:  # OpenRouter: same request retried on the next model if the first can't serve it
            body["models"] = [self.name, *self._fallbacks]
            body["provider"] = {"require_parameters": True}  # only providers that actually support tool calling
        headers = {"Authorization": f"Bearer {self._key}", "content-type": "application/json"}
        try:
            d = await _post(self._client, self._url, body, headers, self._key, self.name, self._who)
        except AskError as e:
            # Some models accept tools but not a forced/required choice: retry once letting the model choose.
            if e.code != "bad_request" or "tool_choice" not in e.message.lower():
                raise
            body["tool_choice"] = "auto"
            d = await _post(self._client, self._url, body, headers, self._key, self.name, self._who)
        msg = ((d.get("choices") or [{}])[0].get("message")) or {}
        u = d.get("usage") or {}
        # Some models send no id: make one that is unique across the whole conversation, or results get mixed up.
        calls = [Call(tc.get("id") or f"call_{uuid.uuid4().hex[:12]}", (tc.get("function") or {}).get("name", ""),
                      _args((tc.get("function") or {}).get("arguments")))
                 for tc in msg.get("tool_calls") or []]
        return Reply(text=msg.get("content") or None, calls=calls,
                     input_tokens=int(u.get("prompt_tokens") or 0), output_tokens=int(u.get("completion_tokens") or 0))


def openai_messages(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        if m["role"] == "user":
            out.append({"role": "user", "content": m["text"]})
        elif m["role"] == "tool":
            out.append({"role": "tool", "tool_call_id": m["id"], "content": _result_text(m["result"])})
        else:
            a = {"role": "assistant", "content": m.get("text") or None}
            if m.get("calls"):
                a["tool_calls"] = [{"id": c["id"], "type": "function",
                                    "function": {"name": c["name"], "arguments": json.dumps(c["args"], ensure_ascii=False)}}
                                   for c in m["calls"]]
            out.append(a)
    return out


def _clean_schema(s):
    """Gemini's function schemas don't accept `additionalProperties`; drop it everywhere."""
    if isinstance(s, dict):
        return {k: _clean_schema(v) for k, v in s.items() if k != "additionalProperties"}
    if isinstance(s, list):
        return [_clean_schema(v) for v in s]
    return s
