"""Checks on the generated bundle (run `python -m ingest ...` first; skipped when data/2701.json is absent)."""
import json
from pathlib import Path

import pytest

BUNDLE = Path(__file__).resolve().parents[3] / "data" / "2701.json"
pytestmark = pytest.mark.skipif(not BUNDLE.exists(), reason="data/2701.json not generated")


@pytest.fixture(scope="module")
def bundle():
    return json.loads(BUNDLE.read_text(encoding="utf8"))


def test_no_cross_check_problems(bundle):
    assert bundle["checks"]["problems"] == 0
    assert bundle["checks"]["ct_bad"] == 0
    assert bundle["checks"]["bt_bad"] == 0


def test_line_set_and_seat_eligibility(bundle):
    nums = [l["number"] for l in bundle["lines"]]
    assert nums == sorted(nums) and nums[0] == 500 and nums[-1] == 831 and len(nums) == 332
    # BRIEFING 8.5: Captain-eligible = first header number > 0 = 274 lines (matches BidPro and IPA)
    assert sum(l["eligible"]["captain"] for l in bundle["lines"]) == 274
    by = {l["number"]: l for l in bundle["lines"]}
    assert by[795]["seats"] == {"captain": 2, "firstOfficer": 2, "other": 0}
    assert by[796]["seats"] == {"captain": 1, "firstOfficer": 2, "other": 0}
    for n in (803, 814, 825, 828):  # FO-only by header although the comment does not say so
        assert not by[n]["eligible"]["captain"]


def test_every_line_has_56_days_and_consistent_instances(bundle):
    trips = {t["id"]: t for t in bundle["trips"]}
    for l in bundle["lines"]:
        assert len(l["days"]) == 56
        assert l["days"][0]["date"] == "2026-11-29" and l["days"][-1]["date"] == "2027-01-23"
        for inst in l["tripInstances"]:
            t = trips[inst["tripId"]]
            assert l["number"] in t["lines"]
            assert inst["reportUtc"] == t["reportUtc"]


def test_trip_reverse_index(bundle):
    used = {}
    for l in bundle["lines"]:
        for inst in l["tripInstances"]:
            used.setdefault(inst["tripId"], set()).add(l["number"])
    for t in bundle["trips"]:
        if not t["openOnly"]:
            assert set(t["lines"]) == used.get(t["id"], set()), t["id"]


def test_known_lines(bundle):
    by = {l["number"]: l for l in bundle["lines"]}
    l500 = by[500]
    assert l500["pp"][0]["ct"] == "80:12" and l500["pp"][0]["dd"] == 13
    assert [i["startDate"] for i in l500["tripInstances"][:2]] == ["2026-12-08", "2026-12-09"]
    assert by[741]["type"] == "gateway-standby"
    assert [d["kind"] for d in by[741]["days"][28:31]] == ["VTO"] * 3  # hybrid line: PP2 is all VTO
    assert by[802]["type"] == "reserve-recovery"
    trip = {t["id"]: t for t in bundle["trips"]}
    assert trip["6072"]["type"] == "gateway-standby" and trip["6072"]["creditCode"] == "T"
    assert trip["6042"]["type"] == "hot-standby"


def test_missing_do_is_28_minus_dd(bundle):
    """Lines that print no DO get DO = 28 - DD per pay period (reserve: DD 14 -> DO 14)."""
    by = {l["number"]: l for l in bundle["lines"]}
    assert [(p["do"], p["dd"]) for p in by[795]["pp"]] == [(14, 14), (14, 14)]
    assert all(p["do"] == 28 - p["dd"] for p in by[808]["pp"] if p["dd"] is not None)


def test_vtor_lines_show_their_days(bundle):
    """The PDF prints VTOR days as VOR; those lines must not come out as 56 blank days."""
    by = {l["number"]: l for l in bundle["lines"]}
    for n in range(780, 795):
        kinds = {d["kind"] for d in by[n]["days"]}
        assert by[n]["type"] == "vtor"
        assert kinds == {"VTOR"}, (n, kinds)
