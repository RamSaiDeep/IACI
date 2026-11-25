"""Shared pieces for the category functions: context, clarification, place resolution, period handling."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..data import Place, get_place, load_country, resolve
from ..labels import COUNTRY_INFO, HAZARD_CHOICES, HAZARD_TO_CODE, SEASONS


class Clarify(Exception):
    """Stop and ask the user one question (optionally with clickable options)."""

    def __init__(self, question: str, options: list[dict] | None = None, query: str | None = None):
        super().__init__(question)
        self.question, self.options, self.query = question, options or [], query


class UserError(Exception):
    """A plain-language error that is safe to show (bad year, hazard not measured...)."""


@dataclass
class Ctx:
    country: str
    resolved: dict[str, str] = field(default_factory=dict)  # typed name (lower) -> place id
    emit: Callable[[str], None] = lambda _t: None
    trace: list[dict] = field(default_factory=list)

    def step(self, name: str, args: dict, summary: str, ok: bool = True) -> None:
        self.trace.append({"name": name, "args": args, "ok": ok, "summary": summary})
        self.emit(f"{name}: {summary}")


@dataclass
class Planned:
    category: str
    country: str
    title: str
    subtitle: str
    facts: dict[str, Any]  # compact JSON the writer reads (the only source of numbers)
    data: dict[str, Any]  # everything assemble() needs
    notes: list[str] = field(default_factory=list)


def place_of(name: str | None, ctx: Ctx, what: str = "place") -> Place:
    if not name or not str(name).strip():
        raise Clarify(f"Which {what} do you mean? For example: {COUNTRY_INFO[ctx.country]['example']}.")
    name = str(name).strip()
    pid = ctx.resolved.get(name.lower())
    if pid and (p := get_place(pid)):
        return p
    r = resolve(name, ctx.country)
    ms = r["matches"]
    ctx.step("resolve_place", {"name": name}, f"{r['status']}: " + (", ".join(m.place.name for m in ms[:3]) or "no match"),
             ok=r["status"] == "exact")
    if r["status"] == "exact":
        if r["note"]:
            ctx.emit(r["note"])
        return ms[0].place
    opts = [{"label": _opt_label(m.place), "id": m.place.id} for m in ms]
    if r["status"] == "ambiguous":
        raise Clarify(f'More than one place matches "{name}". Which one do you mean?', opts, name)
    if r["status"] == "suggestions":
        raise Clarify(f'I could not find "{name}". Did you mean one of these?', opts, name)
    raise Clarify(f'I could not find a place called "{name}" in India, the UK or Nepal. Check the spelling, or try the district or state name.')


def _opt_label(p: Place) -> str:
    bits = [p.name, p.level_label.lower()]
    if p.parent_name:
        bits.append(p.parent_name)
    elif p.level != "country":
        bits.append(COUNTRY_INFO[p.country]["name"])
    return f"{bits[0]} ({', '.join(bits[1:])})"


def hazard_code(h: str | None, default: str = "COMPOSITE") -> str:
    if not h:
        return default
    code = HAZARD_TO_CODE.get(str(h).strip().lower())
    if not code:
        raise UserError(f'Unknown hazard "{h}". Use one of: {", ".join(HAZARD_CHOICES)}.')
    return code


def year_bounds(country: str) -> tuple[int, int, int]:
    """(first year, last year, last COMPLETE year)."""
    d = load_country(country)
    first, last = d.first // 100, d.last // 100
    return first, last, last if d.last % 100 == 12 else last - 1


def check_year(y: int | None, country: str) -> None:
    first, last, _ = year_bounds(country)
    if y is not None and not first <= y <= last:
        raise UserError(f"The record runs from {first} to {last}; {y} is outside it.")


def season_or_none(s: str | None) -> str | None:
    return s if s in SEASONS else None


# ---------------------------------------------------------------- JSON schema helpers (strict mode)

def nullable(t: str, **kw) -> dict:
    return {"type": [t, "null"], **kw}


def obj(props: dict) -> dict:
    return {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}


HAZARD_SLOT = {"type": ["string", "null"], "enum": HAZARD_CHOICES + [None],
               "description": "Hazard the user names: hot/warming/heatwave=heat, rain/flood=rainfall, dry=drought. "
                              "null if no hazard is named (means the overall index)"}
SEASON_SLOT = {"type": ["string", "null"], "enum": list(SEASONS) + [None],
               "description": "ONLY if the user names a season (monsoon=Jun-Sep, summer=Mar-May, post_monsoon=Oct-Nov, "
                              "winter=Dec-Feb). Otherwise null. Never guess it from the hazard."}
