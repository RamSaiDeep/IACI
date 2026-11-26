"""Bharatlas (bharatlas.com): looks up Indian place names and PIN codes that are not districts.

Used only by find_place, and only after our own name and alias list has found nothing.
The model never calls Bharatlas directly.

What it searches (exact name, any case; Bharatlas has no partial matching):
    PIN code (6 digits)  datagov_pincodes             e.g. 500032      -> a point
    city ward            sbm_wards (national)         e.g. Gachibowli  -> a point + district
                         wards_bengaluru_bbmp_2022    e.g. Whitefield  -> a point
    sub-district         lgd_subdistricts             e.g. Secunderabad
    block                lgd_blocks
    village / town       lgd_villages

Every hit comes back with coordinates (`_lat`, `_lng`), which find_place tests against our own
district boundaries. Only the typed name is sent, with a generic User-Agent.
Limits: 120 reads a minute per IP, shared by every visitor, so results are cached by name.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass

import httpx

API = "https://bharatlas.com/api/v1"
HEADERS = {"User-Agent": "iaci-ask/1.0"}
TIMEOUT = 5.0
MAX_ROWS = 10  # per layer; a common village name can match far more, and the visitor then names the state
CREDIT = "Bharatlas (bharatlas.com), from LGD and data.gov.in boundaries"


@dataclass(frozen=True)
class Hit:
    name: str  # as Bharatlas spells it
    kind: str  # "PIN code" | "city ward" | "sub-district" | "block" | "village or town"
    lat: float
    lng: float
    state: str = ""
    district: str = ""  # Bharatlas's district name, for display only
    dist_lgd: int | None = None  # LGD district code, when the layer has it
    dtcode11: str = ""  # Census 2011 district code, when the layer has it


class BharatlasUnavailable(Exception):
    """Bharatlas did not answer (timeout, rate limit, outage)."""


# (layer, column to match, kind, state column, district column, LGD code column, Census code column)
_NAME_SEARCHES = [
    ("sbm_wards", "wardname", "city ward", "statename", "districtname", None, "districtcode"),
    ("wards_bengaluru_bbmp_2022", "KGISWardName", "city ward", None, None, None, None),
    ("lgd_subdistricts", "sdtname", "sub-district", "stname", "dtname", "dist_lgd", "dtcode11"),
    ("lgd_blocks", "block_name", "block", "state", "district", "dist_lgd", "dtcode11"),
    ("lgd_villages", "vilname11", "village or town", "stname", "dtname", "dist_lgd", "dtcode11"),
]

_cache: dict[str, list[Hit]] = {}
_CACHE_MAX = 5000


async def search(client: httpx.AsyncClient, text: str) -> list[Hit]:
    """Every Bharatlas place matching `text` exactly (any case). Raises BharatlasUnavailable."""
    key = " ".join(text.lower().split())
    if key in _cache:
        return _cache[key]
    if re.fullmatch(r"\d{6}", key):
        hits = await _pincode(client, key)
    else:
        found = await asyncio.gather(*(_layer(client, s, text.strip()) for s in _NAME_SEARCHES), return_exceptions=True)
        if all(isinstance(f, Exception) for f in found):
            raise BharatlasUnavailable(str(found[0]))
        hits = [h for f in found if not isinstance(f, Exception) for h in f]
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[key] = hits
    return hits


async def _query(client: httpx.AsyncClient, layer: str, column: str, value: str, select: list[str]) -> list[dict]:
    # Each filter in its own ?col=value parameter, so names containing commas are safe.
    params = {column: value, "select": ",".join(select), "limit": MAX_ROWS, "include_centroid": "true"}
    try:
        r = await client.get(f"{API}/layers/{layer}/query", params=params, headers=HEADERS, timeout=TIMEOUT)
    except httpx.HTTPError as e:
        raise BharatlasUnavailable(f"{layer}: {type(e).__name__}") from e
    if r.status_code != 200:
        raise BharatlasUnavailable(f"{layer}: HTTP {r.status_code}")
    return [row for row in r.json()["data"]["rows"] if row.get("_lat") is not None]


async def _pincode(client: httpx.AsyncClient, pin: str) -> list[Hit]:
    rows = await _query(client, "datagov_pincodes", "Pincode", pin, ["Pincode", "Office_Name"])
    return [Hit(f"PIN {pin} ({row['Office_Name'].strip()})", "PIN code", row["_lat"], row["_lng"]) for row in rows]


async def _layer(client: httpx.AsyncClient, spec: tuple, text: str) -> list[Hit]:
    layer, col, kind, st_col, dt_col, lgd_col, c11_col = spec
    select = [c for c in (col, st_col, dt_col, lgd_col, c11_col) if c]
    rows = await _query(client, layer, col, text, select)
    return [Hit(str(row[col]).strip(), kind, row["_lat"], row["_lng"],
                state=str(row.get(st_col) or "").strip() if st_col else ("Karnataka" if "bengaluru" in layer else ""),
                district=str(row.get(dt_col) or "").strip() if dt_col else "",
                dist_lgd=row.get(lgd_col) if lgd_col else None,
                dtcode11=str(row.get(c11_col) or "") if c11_col else "")
            for row in rows]
