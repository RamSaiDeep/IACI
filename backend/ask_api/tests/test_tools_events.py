"""Disaster-event tools on a small made-up event table (the real one is built by build_events.py)."""

import pytest

from ask_api.tools import events
from ask_api.tools.context import ToolContext, ToolError

ASSAM, KAMRUP, DHUBRI = "india/state/ASSAM", "india/district/ASSAM/KAMRUP RURAL", "india/district/ASSAM/DHUBRI"
ODISHA, PURI, AP, WB = "india/state/ODISHA", "india/district/ODISHA/PURI", "india/state/ANDHRA PRADESH", "india/state/WEST BENGAL"


def row(eid, typ, name, start, end, country="india", **impacts):
    base = {k: "" for k in events.IMPACTS}
    return {"event_id": eid, "source": "Test", "source_ref": "", "country": country, "type": typ, "name": name,
            "start_date": start, "end_date": end, "summary": "s", "source_url": "u", **base, **impacts}


@pytest.fixture
def ctx(monkeypatch):
    evs = {e["event_id"]: e for e in [
        row("t:assam-flood", "flood", "Floods in Assam (June 2022)", "2022-06-10", "2022-07-05", deaths="30"),
        row("t:fani", "cyclone_storm", "Cyclone Fani (2019)", "2019-05-01", "2019-05-04"),
        row("t:old", "drought", "Drought before the data", "1985-06-01", "1985-08-01"),
    ]}
    places = {"t:assam-flood": [(KAMRUP, "district"), (DHUBRI, "district"), (ASSAM, "state")],
              "t:fani": [(PURI, "district"), (ODISHA, "state"), (AP, "state"), (WB, "state")],
              "t:old": [(ASSAM, "state")]}
    monkeypatch.setattr(events, "load", lambda: (evs, places))
    return ToolContext("india")


def test_find_by_place_type_year_and_name(ctx):
    assert [e["event_id"] for e in events.find_events(ctx, place_id=ASSAM, type="flood")["events"]] == ["t:assam-flood"]
    assert events.find_events(ctx, place_id=KAMRUP)["matching"] == 2  # its own flood + the state-wide drought
    assert events.find_events(ctx, name="Cyclone Fani")["events"][0]["event_id"] == "t:fani"
    assert events.find_events(ctx, from_year=2020)["matching"] == 1
    assert events.find_events(ctx, name="nothing like this")["matching"] == 0
    with pytest.raises(ToolError):
        events.find_events(ctx)


def test_districts_named_only_for_one_or_two_states(ctx):
    one = events.get_event(ctx, "t:assam-flood")
    assert one["states_affected"] == 1 and len(one["where"][0]["districts"]) == 2 and "Dhubri" in one["where"][0]["districts"]
    assert one["impacts"]["deaths"] == 30 and one["index_hazards_for_this_type"] == ["Heavy rainfall"]
    three = events.get_event(ctx, "t:fani")
    assert three["states_affected"] == 3 and all(w["districts"] == [] for w in three["where"])


def test_signal_reads_matching_hazards_in_the_event_months(ctx):
    flood = events.event_signal(ctx, "t:assam-flood")
    assert flood["months"] == "June 2022, July 2022" and {r["place"] for r in flood["readings"]} >= {"Dhubri"}
    assert {r["hazard"] for r in flood["readings"]} <= {"Heavy rainfall", "Overall index (IACI)"}
    assert all(r["compared_with_same_months"].endswith("years") for r in flood["readings"])
    fani = events.event_signal(ctx, "t:fani")  # three states -> read the states, wind/rain/sea level
    assert {r["place"] for r in fani["readings"]} == {"Odisha", "Andhra Pradesh", "West Bengal"}
    assert "Strong wind" in {r["hazard"] for r in fani["readings"]}
    with pytest.raises(ToolError, match="no data"):
        events.event_signal(ctx, "t:old")
    with pytest.raises(ToolError, match="Unknown event"):
        events.event_signal(ctx, "nope")
