"""Step 0 tools: find_place (Bharatlas faked, no network), resolve_hazard, resolve_period, data_coverage."""

import asyncio

import pytest

from ask_api import bharatlas
from ask_api.bharatlas import Hit
from ask_api.geo import district_at
from ask_api.tools import places
from ask_api.tools.places import find_place
from ask_api.tools.resolve import data_coverage, resolve_hazard, resolve_period


def find(name, **kw):
    return asyncio.run(find_place(None, name, country=kw.pop("country", "india"), **kw))


@pytest.fixture
def fake_bharatlas(monkeypatch):
    """Replace the network call with a dict of canned answers; records what was asked."""
    answers, asked = {}, []

    async def search(client, text):
        asked.append(text)
        a = answers.get(text.lower(), [])
        if isinstance(a, Exception):
            raise a
        return a

    monkeypatch.setattr(bharatlas, "search", search)
    return answers, asked


# ---------------------------------------------------------------- geo + LGD table

def test_district_at_known_points():
    assert district_at(13.08, 80.27).endswith("/CHENNAI")
    assert "/KARNATAKA/BENGAL" in district_at(12.97, 77.75)  # stored key is "BENGAL#RU (URBAN)" (pipeline glitch)
    assert district_at(10.0, 70.0) is None  # Arabian Sea


def test_lgd_table_maps_codes_to_our_districts():
    by_lgd, by_c11 = places._lgd_codes()
    assert len(by_lgd) == 783 and 0 not in by_lgd  # 785 rows, two share the placeholder code 0
    assert by_lgd[507].endswith("/HYDERABAD")  # LGD code for Hyderabad
    assert by_c11["536"].endswith("/HYDERABAD")  # Census 2011 code, used by the city-ward layer


# ---------------------------------------------------------------- find_place: our own names

def test_district_state_and_country_are_told_apart(fake_bharatlas):
    assert find("Mumbai")["place"]["level"] == "District"
    assert find("Delhi")["place"]["level"] == "State"
    assert find("India")["place"]["level"] in ("Country", "country")
    assert fake_bharatlas[1] == []  # Bharatlas never asked when our own names are enough


def test_old_name_is_mapped_and_explained(fake_bharatlas):
    r = find("Bombay")
    assert r["status"] == "found" and r["place"]["name"] == "Mumbai" and r["how"] == "alias" and "Bombay" in r["note"]


def test_ambiguous_name_offers_buttons(fake_bharatlas):
    r = find("Aurangabad")
    assert r["status"] == "choose" and len(r["options"]) == 2 and all("id" in o for o in r["options"])


def test_territory_preferred_over_its_own_district_unless_asked(fake_bharatlas):
    assert find("Puducherry")["place"]["level"] == "State"
    assert find("Puducherry", level_hint="district")["place"]["level"] == "District"


def test_other_countries_never_go_to_bharatlas(fake_bharatlas):
    assert find("Kent", country="uk")["status"] == "found"
    find("Nowhereshire", country="uk")
    assert fake_bharatlas[1] == []


# ---------------------------------------------------------------- find_place: Bharatlas

def test_locality_is_placed_by_our_own_boundaries(fake_bharatlas):
    answers, _ = fake_bharatlas
    answers["whitefield"] = [Hit("Whitefield", "city ward", 12.965, 77.730, state="Karnataka")]
    r = find("Whitefield")
    assert r["status"] == "found" and r["how"] == "bharatlas" and "Bengaluru" in r["place"]["name"]
    assert "Whitefield (city ward) is in" in r["note"] and "Bharatlas" in r["note"]


def test_same_locality_in_many_districts_asks_which(fake_bharatlas):
    answers, _ = fake_bharatlas
    answers["rampur"] = [Hit("Rampur", "village or town", 13.08, 80.27), Hit("Rampur", "village or town", 17.39, 78.46)]
    r = places._districts_for(answers["rampur"], None)
    assert len(r) == 2


def test_state_filter_narrows_bharatlas_hits(fake_bharatlas):
    answers, _ = fake_bharatlas
    answers["sampleville"] = [Hit("Sampleville", "village or town", 13.08, 80.27),   # Chennai, Tamil Nadu
                              Hit("Sampleville", "village or town", 17.39, 78.46)]   # Hyderabad, Telangana
    assert find("Sampleville")["status"] == "choose"
    r = find("Sampleville", within="Telangana")
    assert r["status"] == "found" and r["place"]["parent"] == "Telangana"


def test_nothing_found_says_so_plainly(fake_bharatlas):
    r = find("Xyzabadpur")
    assert r["status"] == "not_found" and "couldn't find" in r["message"] and "Bharatlas" in r["message"]


def test_bharatlas_down_is_reported_not_guessed(fake_bharatlas):
    answers, _ = fake_bharatlas
    answers["koramangala"] = bharatlas.BharatlasUnavailable("timeout")
    r = find("Koramangala")
    assert r["status"] == "lookup_unavailable" and r["place"] is None


# ---------------------------------------------------------------- resolve_hazard

@pytest.mark.parametrize("word,status,codes", [
    (None, "ok", ["COMPOSITE"]), ("heat", "ok", ["T90S"]), ("Heat-wave", "approximate", ["T90S"]),
    ("flood", "approximate", ["PS"]), ("cyclone", "approximate", ["W", "PS"]),
    ("earthquake", "not_measured", []), ("banana", "unknown", []),
])
def test_resolve_hazard(word, status, codes):
    r = resolve_hazard(word, "india")
    assert r["status"] == status and [h["code"] for h in r["hazards"]] == codes


def test_no_sea_level_in_nepal():
    assert resolve_hazard("sea level", "nepal")["status"] == "not_measured"


# ---------------------------------------------------------------- resolve_period

def test_season_and_range_labels():
    assert resolve_period("india", year=2024, season="monsoon")["label"].endswith("2024")
    r = resolve_period("india", from_year=2025, to_year=2015)  # reversed range is put right
    assert r["period"]["from_year"] == 2015 and r["period"]["to_year"] == 2025


def test_current_year_is_partial_and_future_season_is_refused():
    r = resolve_period("india", relative="this_year")
    assert r["status"] == "ok" and r["partial"] and "so far" in r["label"]
    last = r["period"]["year"]
    assert resolve_period("india", year=last + 1)["status"] == "error"


def test_out_of_range_and_wrong_country_season():
    assert resolve_period("india", year=1985)["status"] == "error"
    assert resolve_period("uk", year=2024, season="monsoon")["status"] == "error"
    assert resolve_period("india", year=2024, month=13)["status"] == "error"


# ---------------------------------------------------------------- data_coverage

def test_coastal_inland_and_no_index():
    chennai = find("Chennai")["place"]["id"]
    assert "Coastal" in data_coverage(chennai)["formula"] and len(data_coverage(chennai)["hazards"]) == 6
    delhi = find("Delhi")["place"]["id"]
    assert "Inland" in data_coverage(delhi)["formula"]
    lak = data_coverage("india/state/LAKSHADWEEP")
    assert lak["has_overall_index"] is False and "No overall index" in lak["formula"]
    assert data_coverage("nope")["status"] == "error"
