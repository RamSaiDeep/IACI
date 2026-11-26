"""The neutral conversation format the loop speaks, and the one method a model adapter must provide.

Messages in a conversation (plain dicts, so they are easy to log and test):
    {"role": "user", "text": "..."}
    {"role": "assistant", "text": "..." | None, "calls": [{"id": "c1", "name": "find_place", "args": {...}}]}
    {"role": "tool", "id": "c1", "name": "find_place", "result": {...}}

A provider adapter (Anthropic, or the OpenAI-style format used by Gemini and OpenRouter) turns these
into its own request shape and its reply back into a `Reply`. The loop never sees provider details.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Call:
    id: str
    name: str
    args: dict


@dataclass
class Reply:
    text: str | None = None
    calls: list[Call] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class ToolSpec:
    """What the model is told about one tool."""
    name: str
    description: str
    parameters: dict  # JSON schema of the arguments


class Model(Protocol):
    name: str  # model id, for the usage line ("google/gemma-4-31b-it:free")

    async def turn(self, system: str, messages: list[dict], tools: list[ToolSpec], force: str | None = None) -> Reply:
        """One model call. `force`: the name of a tool the model must call (used for triage); otherwise
        the model must call at least one tool (the loop only ends through a finishing tool)."""
        ...
