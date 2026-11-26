"""What every tool shares: the request context, the store of tables/charts, errors, and periods.

A data tool returns a short JSON summary for the model to read, plus a `result_id`. The table or chart
behind that id is built here by our code and kept in `ctx.results`; the model's final answer only
names which ids to show. So a chart or table can never contain a number the model made up.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from ..compute import YEAR, label_of, window
from ..data import Place, get_place, load_country
from ..labels import HAZARD_TO_CODE
from .resolve import resolve_period


class ToolError(Exception):
    """A plain-language problem the model can fix (bad place id, period outside the data...).
    The agent loop sends the message back to the model as the tool's result."""


@dataclass
class ToolContext:
    country: str  # the country selected on the page; the default when a question names none
    client: httpx.AsyncClient | None = None  # for find_place's Bharatlas lookups
    resolved: dict[str, str] = field(default_factory=dict)  # typed name (lower case) -> place id the visitor picked
    results: dict[str, dict] = field(default_factory=dict)  # result_id -> report section
    trace: list[dict] = field(default_factory=list)  # one entry per tool call, shown under the answer

    def add(self, section: dict) -> str:
        """Keep a table/chart/bars section and return its id ("r1", "r2", ...)."""
        rid = f"r{len(self.results) + 1}"
        self.results[rid] = section
        return rid

    def table(self, title: str, columns: list[str], rows: list[list], value_cols: list[int] | None = None,
              note: str | None = None, highlight_row: int | None = None) -> str:
        s = {"kind": "table", "title": title, "columns": columns, "rows": rows, "valueCols": value_cols or []}
        if note:
            s["note"] = note
        if highlight_row is not None:
            s["highlightRow"] = highlight_row
        return self.add(s)

    def lines(self, title: str, y_label: str, series: list[dict], marker: int | None = None) -> str:
        """series: [{"name": ..., "points": [{"x": year, "y": value or None}, ...]}]"""
        return self.add({"kind": "lines", "title": title, "xLabel": "Year", "yLabel": y_label,
                         "series": series, "marker": marker})

    def bars(self, title: str, unit: str, rows: list[dict], note: str | None = None) -> str:
        """rows: [{"label", "sub"?, "value", "highlight"?}]"""
        s = {"kind": "bars", "title": title, "unit": unit, "rows": rows}
        if note:
            s["note"] = note
        return self.add(s)


# ---------------------------------------------------------------- inputs every data tool checks

def place_arg(place_id: str) -> Place:
    p = get_place(place_id or "")
    if not p:
        raise ToolError(f"Unknown place id {place_id!r}. Call find_place first and use the id it returns.")
    return p


def hazard_arg(hazard: str | None) -> str:
    """Hazard name from the tool schema ("heat", "rainfall"...) -> component code ("T90S", "PS"...)."""
    code = HAZARD_TO_CODE.get((hazard or "composite").strip().lower())
    if not code:
        raise ToolError(f"Unknown hazard {hazard!r}. Use resolve_hazard to map everyday words first.")
    return code


def name_of(comp: str, country: str) -> str:
    """Hazard name for use inside a sentence: "extreme heat", "overall index (IACI)" (keeps the code's capitals)."""
    s = label_of(comp, country)
    return s[0].lower() + s[1:]


@dataclass(frozen=True)
class Period:
    """A checked period: which months of the year (window) and which years."""
    window: list  # (year offset, month) pairs, see compute.window
    window_label: str  # "Year", "Monsoon (Jun–Sep)", "July"
    y0: int
    y1: int
    label: str  # "Monsoon (Jun–Sep) 2024", "2015–2025"
    partial: bool
    note: str | None

    @property
    def single(self) -> bool:
        return self.y0 == self.y1

    @property
    def whole_year(self) -> bool:
        return self.window == YEAR


def period_arg(country: str, period: dict | None, default: str = "last_complete_year") -> Period:
    """Check a period object (the fields of resolve_period) and turn it into months + years.

    With no year given, `default` decides: "last_complete_year", or "whole_record" (every year,
    used by trends and record-finding). A season or month without years keeps that season/month."""
    args = {k: v for k, v in (period or {}).items() if v not in (None, "")}
    if not any(k in args for k in ("year", "from_year", "to_year", "last_years", "relative")):
        if default == "whole_record":
            args["from_year"] = load_country(country).first // 100
        else:
            args["relative"] = default
    r = resolve_period(country, **args)
    if r["status"] != "ok":
        raise ToolError(r["note"])
    p = r["period"]
    win, win_label = window(p["season"], p["month"])
    y0 = p["year"] if p["kind"] != "range" else p["from_year"]
    y1 = p["year"] if p["kind"] != "range" else p["to_year"]
    return Period(win, win_label, y0, y1, r["label"], r["partial"], r["note"])
