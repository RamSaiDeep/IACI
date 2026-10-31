"""Check that the pipeline's output for a country matches what the website expects.

    python backend/check_pipeline_output.py uk "C:\\path\\to\\IACI-data_transformation\\projects\\uk\\derived"

It reads the country's entry in countries.py and checks, one line at a time:

  * every store file exists           (ukaci_country.zarr, ukaci_nation.zarr, ...)
  * every store has every field       (UKACI, DS, PS, SS, T10S, T90S, W)
  * every crosswalk file exists       (country_crosswalk.parquet, ...)
  * each child crosswalk has its parent column   (NATION in county_crosswalk)

It changes nothing. Each line starts with OK or MISSING.
"""

import os
import sys

import pandas as pd
import zarr

from countries import COUNTRIES


def arrays_in(path):
    group = zarr.open(path, mode="r")
    try:
        return sorted(group.array_keys())
    except AttributeError:
        return sorted(group.keys())


def main(slug, derived):
    country = COUNTRIES[slug]
    regional = os.path.join(derived, "composite", "regional")
    crosswalks = os.path.join(derived, "spatial", "crosswalks")
    problems = 0

    def report(ok, text):
        nonlocal problems
        problems += not ok
        print(f"  {'OK     ' if ok else 'MISSING'}  {text}")

    print(f"\nChecking {country['name']} in {derived}\n")

    print("Stores (the index values)")
    for level in country["levels"]:
        name = f"{country['store_prefix']}_{level['id']}.zarr"
        if level.get("derive_from"):
            print(f"  (skip)   {name}  not needed: {level['id']} is built from {level['derive_from']}")
            continue
        path = os.path.join(regional, name)
        if not os.path.isdir(path):
            report(False, f"{name}  (not found in composite/regional)")
            if os.path.isdir(regional):
                found = sorted(f for f in os.listdir(regional) if f.endswith(".zarr"))
                print(f"           stores that ARE there: {found}")
            continue
        report(True, name)
        have = arrays_in(path)
        for field in country["fields"]:
            report(field in have, f"    {field} array in {name}")
        if any(f not in have for f in country["fields"]):
            print(f"           arrays that ARE there: {have}")

    print("\nCrosswalks (the region names)")
    for level in country["levels"]:
        name = f"{level['id']}_crosswalk.parquet"
        if level.get("derive_from"):
            print(f"  (skip)   {name}  not needed: {level['id']} is built from {level['derive_from']}")
            continue
        path = os.path.join(crosswalks, name)
        if not os.path.isfile(path):
            report(False, f"{name}  (not found in spatial/crosswalks)")
            if os.path.isdir(crosswalks):
                found = sorted(f for f in os.listdir(crosswalks) if f.endswith(".parquet"))
                print(f"           crosswalks that ARE there: {found}")
            continue
        report(True, name)
        columns = list(pd.read_parquet(path).columns)
        for col in ("region_id", "region_name"):
            report(col in columns, f"    {col} column in {name}")
        parent = level.get("parent_field")
        if parent and level.get("parent_from_geojson") and parent not in columns:
            print(f"  (skip)   {parent} column: read from the boundary files instead")
            parent = None
        if parent:
            report(parent in columns, f"    {parent} column in {name}  (which {level['parent']} each row belongs to)")
        if parent and parent not in columns:
            print(f"           columns that ARE there: {columns}")

    print()
    if problems:
        print(f"{problems} problem(s). Fix the pipeline output, or change the '{slug}' entry")
        print("in backend/countries.py to match what IS there. See docs/ADD_A_COUNTRY.md, step B8.")
    else:
        print(f"All good. Next: python backend/process_country_data.py {slug}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in COUNTRIES:
        raise SystemExit(
            "usage: python backend/check_pipeline_output.py <country> <path to projects/<country>/derived>"
        )
    main(sys.argv[1], sys.argv[2])
