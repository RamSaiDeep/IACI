"""Build backend/ask_api/reference/lgd_districts.csv: Bharatlas LGD district codes -> our India district ids.

Run once, and again when either side's district list changes:

    python backend/build_lgd_crosswalk.py

Each of the 785 LGD districts is matched in this order:
  1. name   - same name (or a name in our alias list) in the same state
  2. inside - our district boundary that contains its centre point (catches spellings like Budgam/Badgam)
  3. manual - the MANUAL table below
  4. nearest - nearest district centre; flagged in the output so it can be checked by hand
Several LGD codes may share one of our districts (e.g. Rajasthan's 2023 districts, since merged back).
The Bharatlas release code is written into the file so the match can be cited.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))
from ask_api.data import load_country, norm, resolve  # noqa: E402
from ask_api.geo import district_at, nearest_district  # noqa: E402

API = "https://bharatlas.com/api/v1"
HEADERS = {"User-Agent": "iaci-ask/1.0"}
OUT = Path(__file__).parent / "ask_api" / "reference" / "lgd_districts.csv"

# Enclaves our data has no separate district for: administratively part of Puducherry,
# even though Yanam sits inside Andhra Pradesh and Mahe inside Kerala.
MANUAL = {"Yanam": "india/district/PUDUCHERRY/PUDUCHERRY", "Mahe": "india/district/PUDUCHERRY/PUDUCHERRY"}


def state_key(name: str) -> str:
    """'DADRA,NAGAR HAVELI,DAMAN & DIU' and 'Dadra & Nagar Haveli & Daman & Diu' -> 'dadranagarhavelidamandiu'."""
    return "".join(w for w in norm(name.replace("&", " ").replace(",", " ")).split() if w != "and")


def same_state(a: str, b: str) -> bool:
    a, b = state_key(a), state_key(b)
    return a in b or b in a


def match(row: dict) -> tuple[str, str]:
    """(our place id, how it was matched) for one LGD district row."""
    if row["dtname"] in MANUAL:
        return MANUAL[row["dtname"]], "manual"
    r = resolve(row["dtname"], "india")
    by_name = [m.place.id for m in r["matches"] if r["status"] in ("exact", "ambiguous")
               and m.place.level == "child" and same_state(row["stname"], m.place.parent_name or "")]
    if len(by_name) == 1:
        return by_name[0], "name"
    if pid := district_at(row["_lat"], row["_lng"]):
        return pid, "inside"
    return nearest_district(row["_lat"], row["_lng"]), "nearest"


def main() -> None:
    with httpx.Client(headers=HEADERS, timeout=60) as c:
        rows = c.get(f"{API}/layers/lgd_districts/query", params={
            "select": "dtname,stname,dist_lgd,dtcode11", "limit": 1000, "include_centroid": "true"}).json()["data"]["rows"]
        release = c.get(f"{API}/releases").json()["data"]["latest"].get("cw", "unknown")

    out = []
    for r in sorted(rows, key=lambda r: r["dist_lgd"]):
        pid, how = match(r)
        out.append({"dist_lgd": r["dist_lgd"], "dtcode11": r.get("dtcode11") or "", "lgd_name": r["dtname"],
                    "lgd_state": r["stname"], "place_id": pid, "match": how})

    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        f.write(f"# Bharatlas LGD districts -> IACI district ids. Source: bharatlas.com lgd_districts "
                f"(CC0-1.0 / CC-BY-4.0), release {release}. Built by backend/build_lgd_crosswalk.py.\n")
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)

    counts = {k: sum(1 for o in out if o["match"] == k) for k in ("name", "inside", "manual", "nearest")}
    ours = {p.id for p in load_country("india").places.values() if p.level == "child"}
    missing = sorted(ours - {o["place_id"] for o in out})
    print(f"{len(rows)} LGD districts -> {OUT.name}: {counts}")
    for o in out:
        if o["match"] == "nearest":
            print(f"  CHECK (nearest centre): {o['lgd_name']}, {o['lgd_state']} -> {o['place_id']}")
    print(f"{len(missing)} of our districts have no LGD code (newer than Bharatlas's list; found by location instead):")
    for pid in missing:
        print(f"  {pid}")


if __name__ == "__main__":
    main()
