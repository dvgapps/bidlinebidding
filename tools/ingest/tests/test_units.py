"""Pure unit tests (no PDFs needed)."""
from datetime import date

import pytest

from ingest.build import classify, fmt, hm, local_span
from ingest.lines import BAR_PAD, LineParseError, RE_CREDIT, RE_PAREN_CREDIT
from ingest.trips import (
    RE_GLUE,
    Trip,
    _leg_kind,
    _next_at_or_after,
    dur_minutes,
    expand_report_dates,
    merge_open_trips,
    parse_date,
)


def test_duration_and_date_parsing():
    assert dur_minutes("11h56") == 716
    assert dur_minutes("0h15") == 15
    assert parse_date("02Jan2027") == date(2027, 1, 2)
    with pytest.raises(ValueError):
        dur_minutes("11h56S1")


def test_report_dates_mask_and_single():
    # Saturdays only: 4 in 02-23 Jan 2027
    assert expand_report_dates("02Jan2027-23Jan2027 .....6. (4 trips)", ".....6.", 4) == [
        date(2027, 1, 2), date(2027, 1, 9), date(2027, 1, 16), date(2027, 1, 23),
    ]
    assert expand_report_dates("Only on Tue 22Dec2026", None, None) == [date(2026, 12, 22)]
    # Tue-Fri mask
    got = expand_report_dates("10Dec2026-11Dec2026 ...45..", "...45..", 2)
    assert got == [date(2026, 12, 10), date(2026, 12, 11)]


def test_glued_words_regex():
    assert RE_GLUE[0].match("1h151/1").groups() == ("1h15", "1/1")
    assert RE_GLUE[1].match("11h1074Y").groups() == ("11h10", "74Y")


@pytest.mark.parametrize(
    "tokens,kind",
    [
        (["1346"], "flight"),
        (["DH", "UPS", "072"], "deadhead-company"),
        (["DH", "AA2521"], "deadhead-commercial"),
        (["GT", "N/A", "BUS", "G"], "ground"),
        (["SBG14"], "hot-standby"),
        (["SBA2"], "hot-standby"),
    ],
)
def test_leg_kind(tokens, kind):
    assert _leg_kind(tokens) == kind


def test_clock_helper_rolls_forward():
    # 22:00 then next HH:MM 01:00 => next day
    assert _next_at_or_after(22 * 60, 60) == 25 * 60
    assert _next_at_or_after(22 * 60, 22 * 60) == 22 * 60


def test_credit_regexes():
    assert RE_CREDIT.match("37:22")
    assert RE_PAREN_CREDIT.match("(62:02)")[1] == "62:02"
    assert hm("62:02") == 3722
    assert fmt(3722) == "62:02"
    assert BAR_PAD == pytest.approx(5.02)


@pytest.mark.parametrize(
    "comment,kinds,expected",
    [
        ("", {"off", "trip"}, "flying"),
        ("BASE TRIP LINE", {"off", "trip"}, "base-trip"),
        ("PHL GATEWAY STANDBY", {"GS", "off"}, "gateway-standby"),
        ("SHIFTABLE RESERVE", {"SA", "SB", "off"}, "shiftable-reserve"),
        ("RESERVE RECOVERY LINE", {"RA", "off"}, "reserve-recovery"),
        ("", {"RA", "RB", "off"}, "reserve"),
        ("VTO LINE - THIS LINE FOR BID BY CAPTAIN ONLY", {"VTO", "trip"}, "vto"),
        ("VTOR LINE", {"VTOR"}, "vtor"),
    ],
)
def test_classify(comment, kinds, expected):
    assert classify(comment, kinds) == expected


def _trip(id_, credit=360, tafb=468, block=273, open_only=False, dates=()):
    return Trip(
        id=id_, lines=[], reportUtc="09:22", reportDates=list(dates), reportDatesStated=len(dates),
        duties=[], overnights=[], credit=credit, creditCode="M", block=block, duty=tafb, tafb=tafb,
        premium=0.0, perDiem=0.0, landings=2, crew="1/1", domicile="SDFZ", page=1, openOnly=open_only,
    )


def test_merge_open_trips_adds_dates_and_keeps_open_only():
    main = _trip("5026", dates=["2026-12-22"])
    twin = _trip("5026", open_only=True, dates=["2026-12-23"])
    lone = _trip("6000", open_only=True, dates=["2026-12-24"])
    out = merge_open_trips([main, twin, lone])
    assert [t.id for t in out] == ["5026", "6000"]
    assert out[0].openDates == ["2026-12-23"] and out[0].lines == []
    assert out[1].openOnly


def test_local_span_uses_domicile_timezone():
    t = _trip("x", tafb=1947)
    t.reportUtc = "20:25"
    start, end = local_span(t, date(2026, 11, 30))
    assert (start, end) == (date(2026, 11, 30), date(2026, 12, 1))  # 15:25 EST -> 23:52 EST next day
