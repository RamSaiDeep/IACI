"""Which countries exist, and how each one's pipeline output is shaped.

This is the single place a new country is declared. Everything that differs
between them lives here as data -- the store filenames, the index variable, the
component list, the level hierarchy and the field each child level uses to name
its parent. `process_country_data.py` reads this and needs no country-specific
branch; the frontend reads the manifest it generates.

WHY A LEVEL NAMES ITS PARENT FIELD
----------------------------------
The pipeline writes one crosswalk per level, and a child level's crosswalk
carries whichever attribute the source shapefile happened to use for its
parent -- `STATE_UT` for India, `PNAME` and `DISTRICT` for Nepal. Nothing in
the pipeline normalises those names, so the mapping is declared rather than
guessed.

SEA LEVEL IS NOT UNIVERSAL
--------------------------
India's stores carry `SS`; Nepal is landlocked and has no such array at all.
The field list is therefore per country, not a constant -- reading a fixed
list would raise a KeyError on Nepal rather than simply yielding nulls.
"""

COUNTRIES = {
    "india": {
        "name": "India",
        "project": "india",           # projects/<project>/derived
        "store_prefix": "iaci",       # iaci_<level>.zarr
        "index_code": "IACI",
        "index_variable": "IACI",     # the array name inside the store
        "index_name": "Indian Actuaries Climate Index",
        "fields": ["IACI", "DS", "PS", "SS", "T10S", "T90S", "W"],
        "levels": [
            {"id": "country", "label": "India", "plural": "Country"},
            {
                "id": "state",
                "label": "State",
                "plural": "States",
                "parent": "country",
                "layer": "STATE_BOUNDARY",
                "layer_name_field": "STATE",
                # Disputed polygons carry no climate data and must not be drawn.
                "layer_exclude_prefix": {"STATE": "DISPUTED"},
            },
            {
                "id": "district",
                "label": "District",
                "plural": "Districts",
                "parent": "state",
                "parent_field": "STATE_UT",
                "layer": "DISTRICT_BOUNDARY",
                "layer_name_field": "DISTRICT",
                "layer_parent_field": "STATE_UT",
                "layer_exclude_prefix": {"REMARKS": "DISPUTED"},
            },
        ],
        "geojson": {"top": "state_boundary.json", "children": "districts"},
    },
    "nepal": {
        "name": "Nepal",
        "project": "nepal",
        "store_prefix": "naci",
        "index_code": "NACI",
        "index_variable": "NACI",
        "index_name": "Nepal Actuaries Climate Index",
        # No SS: every Nepali cell is null in the ORAS5 field, so the composite
        # is the five-component equation of Section 10.3 everywhere.
        "fields": ["NACI", "DS", "PS", "T10S", "T90S", "W"],
        "levels": [
            {"id": "country", "label": "Nepal", "plural": "Country"},
            {
                "id": "province",
                "label": "Province",
                "plural": "Provinces",
                "parent": "country",
                "layer": "province0",
                # Name/NM are Devanagari but arrived as literal "?" characters.
                "layer_name_field": "Name_E",
            },
            {
                "id": "district",
                "label": "District",
                "plural": "Districts",
                "parent": "province",
                "parent_field": "PNAME",
                "layer": "districts0",
                "layer_name_field": "DISTRICT",
                "layer_parent_field": "PNAME",
            },
            {
                "id": "local",
                "label": "Local Level",
                "plural": "Local Levels",
                "parent": "district",
                "parent_field": "DISTRICT",
                # Municipality type rides along so the UI can group or filter by
                # it -- municipality against national park -- without another
                # request. `fid` comes with it so a feature on the map can be
                # traced back to its row in the shapefile.
                "carry": ["Type_GN", "fid"],
                # The layer exactly as it ships: 777 polygons, protected areas
                # included and nothing dissolved. See the `local` level in
                # projects/nepal/config/project.toml for why.
                "layer": "local_unit",
                "layer_name_field": "GaPa_NaPa",
                "layer_parent_field": "DISTRICT",
                # KEYED BY ID, NOT NAME. The other levels get away with names
                # because theirs are unique; these are not. 777 rows carry 734
                # distinct names, and `Bansagadhi` and `Binayee Tribeni` each
                # name two rows of the SAME district -- so even within one
                # district file a name is not a key. `fid` is, and the prefix
                # matches the pipeline's region_id so the two join directly.
                "layer_id_field": "fid",
                "id_prefix": "NP_LU_",
                "key": "id",
            },
        ],
        "geojson": {"top": "province_boundary.json", "children": "districts"},
    },
    # ------------------------------------------------------------------
    # United Kingdom: four nations (England, Scotland, Wales, Northern
    # Ireland) and their 218 counties and unitary authorities, including
    # Northern Ireland's 11 council areas. The boundary layers come from
    # backend/prepare_uk_boundaries.py, which adds the NATION column the ONS
    # file lacks and builds the nation layer by dissolving counties.
    # ------------------------------------------------------------------
    "uk": {
        "name": "United Kingdom",
        "project": "uk",              # projects/uk/derived in the pipeline
        "store_prefix": "ukaci",      # ukaci_<level>.zarr
        "index_code": "UKACI",
        "index_variable": "UKACI",
        "index_name": "UK Actuaries Climate Index",
        # SS (sea level) is present for regions that touch the coast, which is
        # most of them, and null for inland ones. As for India, the composite
        # is the six-component equation of Section 10.3 where SS exists and
        # the five-component one where it does not.
        "fields": ["UKACI", "DS", "PS", "SS", "T10S", "T90S", "W"],
        "levels": [
            {"id": "country", "label": "United Kingdom", "plural": "Country"},
            {
                "id": "nation",
                "label": "Nation",
                "plural": "Nations",
                "parent": "country",
                # The pipeline writes no nation store. Nation values are built
                # from the counties, area-weighted (process_country_data.py).
                # Delete this line if the pipeline ever writes ukaci_nation.zarr.
                "derive_from": "county_ua",
                "layer": "nation",
                "layer_name_field": "NATION",
            },
            {
                # "county_ua" because that is what the pipeline calls this level:
                # its files are ukaci_county_ua.zarr and county_ua_crosswalk.parquet.
                "id": "county_ua",
                "label": "County",
                "plural": "Counties",
                "parent": "nation",
                "parent_field": "NATION",
                # The pipeline's county crosswalk has no NATION column, so each
                # county's nation is read from the boundary files instead.
                "parent_from_geojson": True,
                "layer": "county",
                "layer_name_field": "NAME",
                "layer_parent_field": "NATION",
            },
        ],
        "geojson": {"top": "nation.json", "children": "county_ua"},
    },
}


def level_of(country: dict, level_id: str) -> dict:
    for level in country["levels"]:
        if level["id"] == level_id:
            return level
    raise KeyError(f"{country['name']} has no level {level_id!r}")


def child_levels(country: dict) -> list:
    """Levels that are split into one file per parent region."""
    return [lv for lv in country["levels"] if lv.get("parent_field")]
