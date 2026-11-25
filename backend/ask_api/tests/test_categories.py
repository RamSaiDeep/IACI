"""Category functions checked against the raw JSON (no network, no model)."""

import json

import pytest

from ask_api.categories import CATEGORIES
from ask_api.categories.common import Clarify, Ctx, UserError
from ask_api.config import DATA_ROOT
from ask_api.data import load_country, resolve


def ctx(country="india", **kw):
    return Ctx(country=country, **kw)


def raw_district(state_slug, key):
    d = json.loads((DATA_ROOT / "india" / "district" / f"{state_slug}.json").read_text(encoding="utf-8"))
    return d["fields"], d["regions"][key]


# ------------------------------------------------------------------ names

@pytest.mark.parametrize("q,expect", [
    ("Nellore", "Sri Potti Sriramulu Nellore"), ("Coorg", "Kodagu"), ("Cochin", "Ernakulam"), ("Baroda", "Vadodara"),
    ("Faizabad", "Ayodhya"), ("Kadapa", "Y.S.R."), ("Darjeeling", "Darjiling"), ("Belgaum", "Belagavi"),
    ("Gurgaon", "Gurugram"), ("Pokhara", "Kaski"), ("Birbhum", "Birbhum"), ("Dehradun", "Dehradun"),
])
def test_names_resolve(q, expect):
    r = resolve(q, "india")
    assert r["status"] == "exact", r
    assert r["matches"][0].place.name == expect


def test_glitch_characters_are_repaired():
    names = [p.name for c in ("india", "uk", "nepal") for p in load_country(c).places.values()]
    assert not [n for n in names if any(ch in n for ch in "<>#@|\\_")]


def test_every_district_finds_itself():
    for c in ("india", "uk", "nepal"):
        for p in load_country(c).places.values():
            if p.level == "country":
                continue
            ms = [m.place.id for m in resolve(p.name, c)["matches"]]
            assert p.id in ms, (c, p.name, ms[:3])


def test_misspelling_is_only_a_suggestion():
    assert resolve("Guntoor", "india")["status"] == "suggestions"


def test_same_name_in_two_states_is_ambiguous():
    r = resolve("Aurangabad", "india")
    assert r["status"] == "ambiguous" and len(r["matches"]) >= 2


# ------------------------------------------------------------------ snapshot

def test_snapshot_year_matches_raw_mean():
    pl = CATEGORIES["snapshot"].run({"place": "Guntur", "year": 2024}, ctx())
    fields, rows = raw_district("andhra_pradesh", "GUNTUR")
    i = fields.index("IACI") + 1
    vals = [r[i] for r in rows if r[0] // 100 == 2024]
    assert pl.facts["overall"]["value"] == round(sum(vals) / len(vals), 2) == 0.55
    assert pl.facts["overall"]["rank"] == 1 and pl.facts["overall"]["n_years"] == 35
    assert "Sea level" in pl.facts["not_measured"]
    assert {r["place"] for r in pl.facts["regional"]} >= {"Bapatla", "Krishna"}


def test_snapshot_season_and_month():
    s = CATEGORIES["snapshot"].run({"place": "Nellore", "year": 2024, "season": "monsoon"}, ctx())
    assert "Monsoon" in s.title
    m = CATEGORIES["snapshot"].run({"place": "Wayanad", "year": 2024, "month": 7}, ctx())
    assert m.facts["overall"]["rank"] == 1


def test_snapshot_ambiguous_place_asks():
    with pytest.raises(Clarify) as e:
        CATEGORIES["snapshot"].run({"place": "Aurangabad", "year": 2024}, ctx())
    assert len(e.value.options) >= 2 and e.value.query == "Aurangabad"


def test_snapshot_resolved_choice_is_used():
    pid = resolve("Aurangabad", "india")["matches"][0].place.id
    pl = CATEGORIES["snapshot"].run({"place": "Aurangabad", "year": 2024}, ctx(resolved={"aurangabad": pid}))
    assert pl.facts["place"]["id"] == pid


def test_year_out_of_range():
    with pytest.raises(UserError):
        CATEGORIES["snapshot"].run({"place": "Guntur", "year": 1970}, ctx())


# ------------------------------------------------------------------ compare / rank / trend / event / help

def test_compare_two_places():
    pl = CATEGORIES["compare"].run({"places": ["Chennai", "Hyderabad"], "from_year": 2015, "to_year": 2025}, ctx())
    assert pl.facts["period"] == "2015–2025"
    assert pl.facts["convergence"]["pattern"] in ("converging", "diverging", "roughly parallel")
    secs = CATEGORIES["compare"].assemble(pl, {"headline": "h", "sections": {}, "followups": []})
    assert secs[1]["columns"][-1] == "Difference"


def test_compare_cross_country_marks_missing_sea_level():
    pl = CATEGORIES["compare"].run({"places": ["Chennai", "Kathmandu"]}, ctx())
    assert "Sea level" in pl.facts["not_measured"]["Kathmandu"]
    assert any("different countries" in n for n in pl.notes)


def test_rank_odisha_monsoon_rainfall():
    pl = CATEGORIES["rank"].run({"region": "Odisha", "hazard": "rainfall", "year": 2024, "season": "monsoon", "rank_by": "value"}, ctx())
    assert pl.facts["n_ranked"] == 30 and len(pl.facts["rows"]) == 10
    assert [r["place"] for r in pl.facts["rows"][:3]] == ["Sundargarh", "Deogarh", "Mayurbhanj"]
    vals = [r["value"] for r in pl.facts["rows"]]
    assert vals == sorted(vals, reverse=True)


def test_rank_worsening_uses_trend():
    pl = CATEGORIES["rank"].run({"hazard": "drought", "rank_by": "worsening", "limit": 5}, ctx())
    assert len(pl.facts["rows"]) == 5 and "direction" in pl.facts["rows"][0]


def test_trend_matches_known_result():
    pl = CATEGORIES["trend"].run({"place": "Guntur"}, ctx())
    assert pl.facts["direction"] == "increasing" and pl.facts["slope_per_decade"] == 0.08 and pl.facts["p"] == 0.044


def test_trend_sea_level_inland_is_an_error():
    with pytest.raises(UserError):
        CATEGORIES["trend"].run({"place": "Kathmandu", "hazard": "sea level"}, ctx("nepal"))


def test_event_wayanad_july_2024():
    pl = CATEGORIES["event"].run({"place": "Wayanad", "month": 7, "year": 2024}, ctx())
    assert pl.facts["is_record_high"] and pl.facts["top5_same_month"][0]["year"] == 2024
    assert pl.facts["main_driver"] in {h["hazard"] for h in pl.facts["hazards"]}


def test_event_needs_month():
    with pytest.raises(Clarify):
        CATEGORIES["event"].run({"place": "Wayanad", "month": None, "year": 2024}, ctx())


def test_help_topic():
    pl = CATEGORIES["help"].run("drought", ctx())
    assert "dry days" in pl.data["body"]
