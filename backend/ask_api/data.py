"""Read-only access to the index JSON in frontend/public/data, plus place-name matching.
Parsed once per country and cached. Nothing here talks to an LLM."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache

from .config import DATA_ROOT
from .labels import COUNTRY_INFO, COUNTRY_SLUGS, PLACE_ALIASES


@dataclass
class Place:
    id: str
    country: str
    level: str  # country | top | child
    level_label: str
    name: str
    key: str
    parent_id: str | None
    parent_name: str | None
    periods: list[int]
    cols: dict[str, list[float | None]]
    coastal: bool = False
    norm_name: str = ""
    index: dict[int, int] = field(default_factory=dict)  # YYYYMM -> row

    def value(self, comp: str, ym: int) -> float | None:
        c = self.cols.get(comp)
        i = self.index.get(ym)
        return None if c is None or i is None else c[i]

    def ref(self) -> dict:
        return {"id": self.id, "name": self.name, "level": self.level_label, "parent": self.parent_name,
                "country": COUNTRY_INFO[self.country]["name"]}


@dataclass
class CountryData:
    slug: str
    places: dict[str, Place]
    first: int
    last: int


# Characters lost in the pipeline: "BELAG<VI", "KOCH BIH>R" (ā), "BENGAL#RU", "DEHRAD@N" (ū),
# "B|RBH@M", "B\DAR" (ī). Nepal splits districts as "RUKUM_E" / "RUKUM_W".
_GLITCH = str.maketrans({"<": "a", ">": "a", "#": "u", "@": "u", "|": "i", "\\": "i"})


def repair(key: str) -> str:
    key = key.translate(_GLITCH)
    return re.sub(r"_E$", " EAST", re.sub(r"_W$", " WEST", key))
_SMALL = {"and", "of", "the", "on", "upon", "in", "with"}


def slugify(name: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", name.lower()))


def norm(s: str) -> str:
    s = repair(s).lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\b(district|city of|county|state)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def display_name(key: str) -> str:
    parts = re.split(r"(\s+|-|\(|\.)", repair(key).lower())
    out = []
    for i, w in enumerate(parts):
        if i > 0 and w in _SMALL:
            out.append(w)
        elif (re.fullmatch(r"[^aeiouy]{2,3}", w) and w.isalpha() and w != "dr") or len(w) == 1:
            out.append(w.upper())  # acronyms such as NTR
        else:
            out.append(w[:1].upper() + w[1:])
    return re.sub(r"\bAnd\b", "and", "".join(out))


def _read(rel: str):
    p = DATA_ROOT / rel
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def _place(c, level, label, key, fields, rows, parent, index_code, name=None) -> Place:
    info = COUNTRY_INFO[c]
    pid = c if level == "country" else (
        f"{c}/{info['top_id']}/{key}" if level == "top" else f"{c}/{info['child_id']}/{parent.key}/{key}")
    cols = {f: [] for f in fields}
    periods = []
    for row in rows:
        periods.append(row[0])
        for i, f in enumerate(fields):
            cols[f].append(row[i + 1] if i + 1 < len(row) else None)
    if index_code in cols:
        cols["COMPOSITE"] = cols[index_code]
    nm = name or display_name(key)
    return Place(id=pid, country=c, level=level, level_label=label, name=nm, key=key,
                 parent_id=parent.id if parent else None, parent_name=parent.name if parent else None,
                 periods=periods, cols=cols, coastal=any(v is not None for v in cols.get("SS", [])),
                 norm_name=norm(nm), index={p: i for i, p in enumerate(periods)})


@lru_cache(maxsize=None)
def load_country(c: str) -> CountryData:
    info = COUNTRY_INFO[c]
    country = _read(f"{c}/country.json")
    if not country:
        raise FileNotFoundError(f"No data found for {c} under {DATA_ROOT}")
    places: dict[str, Place] = {}
    cp = _place(c, "country", "Country", info["name"].upper(), country["fields"], country["rows"], None,
                info["index_code"], info["name"])
    places[cp.id] = cp
    top = _read(f"{c}/{info['top_id']}.json") or {"fields": [], "regions": {}}
    for key, rows in top["regions"].items():
        p = _place(c, "top", info["top_label"], key, top["fields"], rows, cp, info["index_code"])
        places[p.id] = p
        child = _read(f"{c}/{info['child_id']}/{slugify(key)}.json") or {"fields": [], "regions": {}}
        for ck, crows in child["regions"].items():
            q = _place(c, "child", info["child_label"], ck, child["fields"], crows, p, info["index_code"])
            places[q.id] = q
    return CountryData(c, places, cp.periods[0], cp.periods[-1])


def get_place(pid: str) -> Place | None:
    c = pid.split("/")[0]
    return load_country(c).places.get(pid) if c in COUNTRY_INFO else None


def _edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


@dataclass
class Match:
    place: Place
    how: str  # exact | alias | prefix | word | fuzzy


def find_places(query: str, countries: list[str] | None = None) -> list[Match]:
    """Candidates for a typed name, best kind first. Fuzzy matches are only suggestions, never auto-picked."""
    countries = countries or COUNTRY_SLUGS
    q0 = norm(query)
    if not q0:
        return []
    targets = PLACE_ALIASES.get(q0)
    # The typed name always counts too: "Patan" is both a Gujarat district and an alias of Lalitpur (Nepal).
    qs = (targets or []) + ([q0] if q0 not in (targets or []) else [])
    out: list[Match] = []
    seen: set[str] = set()

    def add(p: Place, how: str):
        if p.id not in seen:
            seen.add(p.id)
            out.append(Match(p, how))

    places = [p for c in countries for p in load_country(c).places.values()]
    for q in qs:
        only, _, q = q.rpartition(":")
        for p in places:
            if p.norm_name == q and (not only or p.country == only):
                add(p, "alias" if q != q0 else "exact")
    for q in qs:
        only, _, q = q.rpartition(":")
        if len(q) < 4 or only:
            continue
        for p in places:
            n = p.norm_name
            if n.startswith(q):
                add(p, "prefix")
            elif f" {q} " in f" {n} ":
                # Whole word(s) inside a longer official name: "nellore" -> "Sri Potti Sriramulu Nellore".
                add(p, "word")
    if out:
        return out
    limit = 1 if len(q0) <= 5 else 2
    for p in places:
        if p.level != "country" and _edit_distance(p.norm_name, q0) <= limit:
            add(p, "fuzzy")
    return out


def resolve(query: str, country: str | None) -> dict:
    """status: exact | ambiguous | suggestions | not_found, with matches (selected country first)."""
    order = [country] + [c for c in COUNTRY_SLUGS if c != country] if country in COUNTRY_SLUGS else COUNTRY_SLUGS
    m = find_places(query, [order[0]])
    if not m:
        m = find_places(query, order)
    good = [x for x in m if x.how != "fuzzy"]
    # A top-level region and a same-named district: prefer an exact top-level hit only if it is the only exact one.
    exact = [x for x in good if x.how in ("exact", "alias")]
    if len(exact) == 1:
        good = exact
    if len(good) == 1:
        status = "exact"
    elif good:
        status = "ambiguous"
    elif m:
        status = "suggestions"
    else:
        status = "not_found"
    shown = (good or m)[:8]
    alias_note = next((f'"{query}" is the former or alternative name of {x.place.name}.' for x in shown if x.how == "alias"), None)
    return {"status": status, "matches": shown, "note": alias_note}
