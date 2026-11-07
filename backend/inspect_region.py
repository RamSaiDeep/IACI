"""Explain why a region shows no value ("—") on the site.

    python backend/inspect_region.py uk "Shetland"

Looks for the region (by part of its name) in three places and reports what
each one holds:

  1. the WEBSITE data files   frontend/public/data/<country>/...
  2. the PIPELINE crosswalk   <derived>/spatial/crosswalks/<level>_crosswalk.parquet
  3. the PIPELINE store       <derived>/composite/regional/<prefix>_<level>.zarr

For each field it prints how many months have a value, so you can see whether
the whole index is missing, one component is missing, or the name never
matched. Reads only; changes nothing. Set UK_DERIVED_DIR (or the country's
<PROJECT>_DERIVED_DIR) first for parts 2 and 3.
"""

import glob
import json
import os
import sys

import numpy as np

from countries import COUNTRIES

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def website(slug, needle, fields):
    print("1. WEBSITE DATA FILES")
    found = False
    for path in sorted(glob.glob(os.path.join(REPO, "frontend", "public", "data", slug, "**", "*.json"),
                                 recursive=True)):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        for name, rows in (data.get("regions") or {}).items():
            if needle.upper() not in name.upper():
                continue
            found = True
            rel = os.path.relpath(path, REPO)
            print(f"   '{name}' in {rel}: {len(rows)} months")
            for i, field in enumerate(data["fields"]):
                n = sum(1 for r in rows if r[i + 1] is not None)
                print(f"      {field:6s} has a value in {n:4d} of {len(rows)} months")
    if not found:
        print(f"   nothing matching '{needle}' -> the name never reached the website files")


def pipeline(slug, needle, country):
    print("\n2/3. PIPELINE OUTPUT")
    project = country["project"]
    derived = os.environ.get(f"{project.upper()}_DERIVED_DIR")
    if not derived or not os.path.isdir(derived):
        print(f"   skipped: set {project.upper()}_DERIVED_DIR to the pipeline's derived folder first")
        return
    import pandas as pd
    import zarr

    for level in country["levels"]:
        if level.get("derive_from") or level["id"] == "country":
            continue
        cw_path = os.path.join(derived, "spatial", "crosswalks", f"{level['id']}_crosswalk.parquet")
        st_path = os.path.join(derived, "composite", "regional", f"{country['store_prefix']}_{level['id']}.zarr")
        if not os.path.isfile(cw_path):
            continue
        cw = pd.read_parquet(cw_path)[["region_id", "region_name"]].drop_duplicates()
        hits = cw[cw["region_name"].astype(str).str.contains(needle, case=False)]
        print(f"   {level['id']} crosswalk: {len(hits)} match(es) -> "
              f"{hits['region_name'].tolist() if len(hits) else 'none (name differs or region absent)'}")
        if not len(hits) or not os.path.isdir(st_path):
            continue
        store = zarr.open(st_path, mode="r")
        ids = [str(r) for r in store["region_id"][:]]
        for rid, rname in zip(hits["region_id"].astype(str), hits["region_name"]):
            if rid not in ids:
                print(f"      '{rname}' ({rid}) is in the crosswalk but NOT in the store")
                continue
            k = ids.index(rid)
            print(f"      '{rname}' ({rid}) in {os.path.basename(st_path)}:")
            for field in country["fields"]:
                if field not in store:
                    continue
                arr = np.asarray(store[field][:, :, k], dtype=float)
                n, total = int((~np.isnan(arr)).sum()), arr.size
                print(f"         {field:6s} has a value in {n:4d} of {total} months")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in COUNTRIES:
        raise SystemExit('usage: python backend/inspect_region.py <country> "<part of region name>"')
    slug, needle = sys.argv[1], sys.argv[2]
    country = COUNTRIES[slug]
    website(slug, needle, country["fields"])
    pipeline(slug, needle, country)
    print("\nHow to read this:")
    print(" - every field 0 in the pipeline        -> the pipeline has no data there (e.g. outside the download box)")
    print(" - UKACI 0 but some components non-zero -> a land component is missing, so no composite is formed")
    print(" - found in pipeline, missing on website -> the names differ between pipeline and boundary file")


if __name__ == "__main__":
    main()
