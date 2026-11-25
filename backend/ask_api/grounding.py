"""Every number in the writer's text must appear in the facts (or be a fixed constant).
Lexical check: proves the number exists in the results, not that it is attached to the right thing."""

import re

NUM = re.compile(r"(?<![\w.])[-+−]?\d+(?:\.\d+)?")
ALWAYS = {1, 5, 10, 12, 1991, 2020, 0.05}


def allowed_numbers(*sources) -> set[float]:
    out: set[float] = set()

    def walk(x):
        if isinstance(x, bool):
            return
        if isinstance(x, (int, float)):
            out.add(abs(float(x)))
        elif isinstance(x, str):
            out.update(abs(float(t.replace("−", "-"))) for t in NUM.findall(x))
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, (list, tuple)):
            for v in x:
                walk(v)
    for s in sources:
        walk(s)
    return out


def _ok(tok: str, allowed: set[float]) -> bool:
    t = abs(float(tok.replace("−", "-")))
    if t in ALWAYS:
        return True
    d = len(tok.split(".")[1]) if "." in tok else 0
    return any(abs(round(a, d) - t) < 1e-9 for a in allowed)


def ungrounded(text: str, allowed: set[float]) -> list[str]:
    return [t for t in NUM.findall(text or "") if not _ok(t, allowed)]


def _split(text: str) -> list[str]:
    return re.split(r"(?<=[.!?])\s+", text or "")


def strip_ungrounded(text: str, allowed: set[float]) -> tuple[str, list[str]]:
    keep, removed = [], []
    for s in _split(text):
        (removed if ungrounded(s, allowed) else keep).append(s)
    return " ".join(keep).strip(), removed


ATTRIBUTION = re.compile(
    r"(caused|driven|triggered|exacerbated|worsened|made worse|attributable|due)\s+(by|to)\s+[^.]*\b(climate change|global warming|anthropogenic)"
    r"|climate change\s+(caused|made|led|drove|is responsible)|because of (climate change|global warming)", re.I)


def strip_attribution(text: str) -> tuple[str, list[str]]:
    keep, removed = [], []
    for s in _split(text):
        (removed if ATTRIBUTION.search(s) else keep).append(s)
    return " ".join(keep).strip(), removed
