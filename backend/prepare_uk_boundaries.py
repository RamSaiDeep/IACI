"""Turn the raw ONS county file into the two boundary layers the UK index
needs: nations and counties.

WHY THIS STEP EXISTS
--------------------
India and Nepal arrived with one shapefile per level, and each child level
already carried a column naming its parent (`STATE_UT`, `PNAME`). The ONS file
for the UK does not. `CTYUA_DEC_2025_UK_BFE.shp` is a single layer of 218
counties and unitary authorities with no column saying which nation each one
belongs to, and there is no nation layer at all.

Two facts make this easy to fix without guessing:

  * Every ONS code starts with a letter that names the nation:
    E = England, S = Scotland, W = Wales, N = Northern Ireland.
  * A nation is exactly the union of its counties, so the nation layer can be
    built by dissolving the county layer. The two can then never disagree at a
    shared border.

WHAT IT WRITES
--------------
    backend/data/boundaries/uk/
        county.shp   one row per county, with NAME, CODE and NATION columns
        nation.shp   one row per nation, built by dissolving county.shp

Both are written in WGS84 (EPSG:4326), the latitude/longitude system the map
uses. The ONS file itself is in British National Grid (EPSG:27700).

Northern Ireland's 11 council areas are in the ONS file (codes starting N),
so Northern Ireland comes through as the fourth nation with no extra input.

Give the SAME two files to the data pipeline (IACI-data_transformation), so its
crosswalks carry the same names and the same NATION column. If the pipeline
and this repo use different boundary files, region names will not match and
the map will show empty regions.

USAGE
-----
    python backend/prepare_uk_boundaries.py path/to/CTYUA_DEC_2025_UK_BFE.shp

For the next country: copy this file, change NATION_BY_PREFIX (or however that
country's parent can be derived), and keep the output contract the same.
"""

import argparse
import os

import geopandas as gpd

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(BACKEND_DIR, "data", "boundaries", "uk")

# First letter of the ONS code -> nation.
NATION_BY_PREFIX = {
    "E": "England",
    "S": "Scotland",
    "W": "Wales",
    "N": "Northern Ireland",
}

UK_CODE_FIELD = "CTYUA25CD"
UK_NAME_FIELD = "CTYUA25NM"


def load_uk(path: str) -> gpd.GeoDataFrame:
    frame = gpd.read_file(path)
    for field in (UK_CODE_FIELD, UK_NAME_FIELD):
        if field not in frame.columns:
            raise SystemExit(
                f"{os.path.basename(path)} has no {field!r}. ONS renames these "
                f"columns every release (CTYUA24NM, CTYUA25NM, ...). Update "
                f"UK_CODE_FIELD / UK_NAME_FIELD at the top of this script. "
                f"Columns found: {[c for c in frame.columns if c != 'geometry']}"
            )
    nation = frame[UK_CODE_FIELD].str[0].map(NATION_BY_PREFIX)
    if nation.isna().any():
        bad = frame.loc[nation.isna(), UK_CODE_FIELD].tolist()
        raise SystemExit(f"codes with an unknown nation prefix: {bad[:5]}")
    out = gpd.GeoDataFrame(
        {
            "NAME": frame[UK_NAME_FIELD].str.strip(),
            "CODE": frame[UK_CODE_FIELD],
            "NATION": nation,
        },
        geometry=frame.geometry,
        crs=frame.crs,
    )
    return out.to_crs(epsg=4326)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("uk", help="ONS counties and unitary authorities shapefile")
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    county = load_uk(args.uk)

    # The frontend keys counties by name, so a name must not repeat anywhere.
    dupes = county["NAME"].str.upper()[county["NAME"].str.upper().duplicated()]
    if len(dupes):
        raise SystemExit(f"county names repeat: {sorted(set(dupes))}")

    county["geometry"] = county.geometry.make_valid()
    nation = county.dissolve(by="NATION", as_index=False)[["NATION", "geometry"]]

    os.makedirs(args.out, exist_ok=True)
    county.to_file(os.path.join(args.out, "county.shp"))
    nation.to_file(os.path.join(args.out, "nation.shp"))

    print(f"county.shp  {len(county)} rows")
    for name, n in county["NATION"].value_counts().sort_index().items():
        print(f"    {name:18s} {n}")
    print(f"nation.shp  {len(nation)} rows")
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
