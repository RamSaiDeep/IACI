"""Step 3: write the answer text with the VISITOR's own key (Anthropic, Google Gemini or OpenRouter).
The key is used for this request only and never logged, stored or echoed."""

from __future__ import annotations

import json
import re

import httpx

from .errors import AskError, provider_error

PROVIDERS = {
    "anthropic": "https://api.anthropic.com/v1/messages",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
}
DEFAULT_MODELS = {"anthropic": "claude-sonnet-5-5", "gemini": "gemini-2.5-flash", "openrouter": "google/gemini-2.5-flash"}

SYSTEM = """You write short, plain-English answers about the Actuaries Climate Index for a general audience.
Rules:
- Use ONLY numbers that appear in the FACTS. Never calculate, round differently or estimate new numbers.
- Values are anomalies against the 1991-2020 baseline (0 = normal). Rank 1 = highest in the record.
- Never say climate change (or anything else) caused an event. Describe, don't attribute.
- No hazard codes (T90S etc.); use the hazard names given.
- Reply with ONE JSON object only: {"headline": "...", "sections": {...}, "followups": ["...", "..."]}"""


class Writer:
    def __init__(self, provider: str, model: str | None, key: str | None):
        if provider not in PROVIDERS:
            raise AskError("bad_request", "Unknown provider.")
        if not key:
            raise AskError("missing_key", "Set your API key to get answers.", 401)
        model = (model or "").strip() or DEFAULT_MODELS[provider]
        if not re.fullmatch(r"[\w.:/-]{1,100}", model):
            raise AskError("bad_request", "That model name looks invalid. Copy it exactly from the provider's model list.")
        self.provider, self.model, self._key = provider, model, key
        self.calls = self.input_tokens = self.output_tokens = 0

    async def _complete(self, client: httpx.AsyncClient, system: str, user: str, max_tokens: int) -> str:
        if self.provider == "anthropic":
            headers = {"x-api-key": self._key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
            body = {"model": self.model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": user}]}
        else:
            headers = {"Authorization": f"Bearer {self._key}", "content-type": "application/json"}
            body = {"model": self.model, "max_tokens": max_tokens,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        try:
            r = await client.post(PROVIDERS[self.provider], json=body, headers=headers, timeout=110)
        except httpx.HTTPError:
            raise AskError("model_error", "Could not reach the model provider. Check your connection and try again.", 502)
        if r.status_code >= 400:
            try:
                j = r.json()
                j = j[0] if isinstance(j, list) else j
                detail = (j.get("error") or {}).get("message", "") if isinstance(j.get("error"), dict) else str(j.get("error", ""))
            except Exception:
                detail = ""
            raise provider_error(r.status_code, detail.replace(self._key, "[redacted]"), self.model)
        d = r.json()
        self.calls += 1
        u = d.get("usage") or {}
        self.input_tokens += int(u.get("input_tokens") or u.get("prompt_tokens") or 0)
        self.output_tokens += int(u.get("output_tokens") or u.get("completion_tokens") or 0)
        if self.provider == "anthropic":
            return "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")
        return ((d.get("choices") or [{}])[0].get("message") or {}).get("content") or ""

    async def test(self, client) -> None:
        await self._complete(client, "Reply with OK.", "OK?", 16)

    async def write(self, client, category: str, question: str | None, facts: dict, slots: dict[str, str],
                    feedback: str | None = None) -> dict:
        shape = {"headline": "2 sentences that answer the question directly",
                 "sections": slots, "followups": "2-3 short follow-up questions the user could ask next"}
        user = (f"Answer type: {category}\nQuestion: {question or '(chosen from a form)'}\n"
                f"FACTS (the only source of numbers): {json.dumps(facts, ensure_ascii=False, separators=(',', ':'))}\n"
                f"Fill this JSON shape: {json.dumps(shape)}")
        if feedback:
            user += f"\n\n{feedback}"
        text = await self._complete(client, SYSTEM, user, 700)
        return parse_narrative(text, slots)

    def usage(self) -> dict:
        return {"provider": self.provider, "model": self.model, "calls": self.calls,
                "inputTokens": self.input_tokens, "outputTokens": self.output_tokens, "costUsd": None}


def parse_narrative(text: str, slots: dict) -> dict:
    m = re.search(r"\{.*\}", text or "", re.S)
    data = {}
    if m:
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            data = {}
    headline = data.get("headline") if isinstance(data.get("headline"), str) else ""
    secs = data.get("sections") if isinstance(data.get("sections"), dict) else {}
    fu = data.get("followups") if isinstance(data.get("followups"), list) else []
    return {"headline": headline.strip(),
            "sections": {k: v.strip() for k, v in secs.items() if k in slots and isinstance(v, str)},
            "followups": [f for f in fu if isinstance(f, str)][:3]}
