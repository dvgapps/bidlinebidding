"""Parser for `Bidlines - Bid NNNN DOM.pdf` (landscape, two lines per page, one calendar grid per PP).

Per line block (top to bottom): `Comment:` row, header row (`SDFZ <num>` + weekday names), the
`a/b/c/` seat counts + date numbers, then for each pay period a label column (`PPn (id)`, CT/BT/DO/DD)
and a 28(+2 overflow)-column day grid. Within the grid, rows relative to the PP label row are:
trip number / overnight airports (on the night boundaries, with a green bar) / report time UTC /
trip credit (and a parenthesised PP-portion credit for trips crossing the PP boundary).
Reserve lines show `RA RB SA SB` tokens as day cells; VTO lines show `VTO`/`VTOR` per day.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from .words import Page, Rect, Word, group_rows

GREEN = (0.6, 0.8, 0.6)
RESERVE_TOKENS = {"RA", "RB", "SA", "SB", "VTO", "VTOR", "VOR", "RMUL", "RSIM"}
# the PDF (like BidPro) prints VTOR days as "VOR"
TOKEN_CODE = {"VOR": "VTOR"}
RE_HDR_COUNTS = re.compile(r"^(\d+)/(\d+)/(\d+)/$")
RE_HHMM = re.compile(r"^\d{4}$")
RE_CREDIT = re.compile(r"^\d{1,3}:\d\d$")
RE_PAREN_CREDIT = re.compile(r"^\((\d{1,3}:\d\d)\)$")
RE_PPLABEL = re.compile(r"^PP([12])$")
RE_PPID = re.compile(r"^\((\d{4})\)$")
RE_STAT = re.compile(r"^(CT|BT|DO|DD):$")
N_DAYS = 28


class LineParseError(ValueError):
    pass


def hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


BAR_PAD = 5.02  # bar x = cell left + 5pt + fraction-of-local-day * pitch


@dataclass
class Instance:
    tripId: str
    startCol: int  # may be > 27 only for hidden overflow copies
    endCol: int  # may extend past the last column (trip crosses into the next PP)
    x0: float
    barX0: float = 0.0
    barX1: float = 0.0
    reportUtc: str | None = None
    credit: int | None = None  # whole-trip credit (minutes), printed on the first day
    ppCredit: int | None = None  # parenthesised portion falling in this PP (trips crossing the PP boundary)


@dataclass
class PPBlock:
    label: str  # PP1 / PP2
    id: str  # 2613 / 2701
    stats: dict[str, str]
    top: float
    bottom: float
    col_x: list[float]  # column left edges (len N+1)
    instances: list["Instance"]  # trips whose number is visible in this PP's grid
    codes: dict[int, str]  # column -> RA/RB/SA/SB/VTO/VTOR
    orphanBars: list[tuple[int, int]]  # bars without a visible trip number (continuations)


@dataclass
class RawLine:
    number: int
    comment: str
    seats: tuple[int, int, int]
    pps: list[PPBlock]
    page: int


def _col_edges(header_words: list[Word]) -> list[float]:
    """Column left edges from the weekday-name header words (28 day cells + overflow)."""
    days = sorted((w for w in header_words if w.text in ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")), key=lambda w: w.x0)
    if len(days) < N_DAYS:
        raise LineParseError(f"only {len(days)} weekday headers")
    centers = [w.xc for w in days[:N_DAYS]]
    pitch = (centers[-1] - centers[0]) / (N_DAYS - 1)
    left = centers[0] - pitch / 2
    return [left + i * pitch for i in range(N_DAYS + 3)]


def _col_of(x: float, edges: list[float]) -> int:
    return int((x - edges[0]) // (edges[1] - edges[0]))


def parse_page(page: Page, page_no: int) -> list[RawLine]:
    words = [w for w in page.words]
    heads = [
        w for w in words if w.text == "SDFZ" and w.x0 < 60 and any(
            v.text.isdigit() and 60 <= v.x0 < 90 and abs(v.top - w.top) < 2 for v in words
        )
    ]
    # domicile code may differ from SDFZ; fall back to generic header detection
    if not heads:
        heads = [
            w for w in words if re.fullmatch(r"[A-Z]{4}", w.text) and w.x0 < 60 and any(
                v.text.isdigit() and 60 <= v.x0 < 90 and abs(v.top - w.top) < 2 for v in words
            )
        ]
    heads.sort(key=lambda w: w.top)
    out: list[RawLine] = []
    for i, h in enumerate(heads):
        start = h.top - 14  # include the `Comment:` row above the header
        end = heads[i + 1].top - 14 if i + 1 < len(heads) else page.height
        bw = [w for w in words if start <= w.top < end]
        br = [r for r in page.rects if start <= r.top < end and r.color == GREEN]
        out.append(_parse_block(bw, br, h, page_no))
    return out


def _parse_block(bw: list[Word], bars: list[Rect], head: Word, page_no: int) -> RawLine:
    num_w = next(w for w in bw if w.text.isdigit() and 60 <= w.x0 < 90 and abs(w.top - head.top) < 2)
    number = int(num_w.text)
    cw = [w for w in bw if w.top < head.top - 3 and w.x0 > 84 and w.text != "Comment:"]
    comment = " ".join(w.text for w in sorted(cw, key=lambda w: (round(w.top), w.x0)))
    seats_w = next((w for w in bw if RE_HDR_COUNTS.match(w.text) and w.x0 < 60), None)
    if seats_w is None:
        raise LineParseError(f"line {number}: no a/b/c/ counts")
    seats = tuple(int(x) for x in RE_HDR_COUNTS.match(seats_w.text).groups())

    rows = group_rows([w for w in bw if w.top >= head.top - 1])
    # PP label rows: words PP1/PP2 at x < 62
    pp_labels = sorted(
        (w for w in bw if RE_PPLABEL.match(w.text) and w.x0 < 62), key=lambda w: w.top
    )
    if not pp_labels:
        raise LineParseError(f"line {number}: no PP labels")
    # weekday header rows: row containing >= 28 weekday names
    hdr_rows = [r for r in rows if sum(1 for w in r if w.text in ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")) >= N_DAYS]
    pps: list[PPBlock] = []
    for k, lab in enumerate(pp_labels):
        hdr = max((r for r in hdr_rows if r[0].top < lab.top - 1), key=lambda r: r[0].top, default=None)
        if hdr is None:
            raise LineParseError(f"line {number}: no weekday header above {lab.text}")
        edges = _col_edges(hdr)
        top = lab.top - 2
        nxt_hdr = next((r[0].top for r in hdr_rows if r[0].top > lab.top + 1), None)
        bottom = (nxt_hdr - 1) if nxt_hdr else max(w.bottom for w in bw) + 1
        pid_w = next((w for w in bw if RE_PPID.match(w.text) and abs(w.top - lab.top) < 3 and w.x0 < 90), None)
        stats: dict[str, str] = {}
        region = [w for w in bw if top <= w.top < bottom]
        for r in group_rows([w for w in region if w.x0 < 84]):
            if r and RE_STAT.match(r[0].text) and len(r) > 1:
                stats[r[0].text[:-1]] = r[1].text
        grid = [w for w in region if w.x0 >= 84]
        # trip bars: x0 = cell left + BAR_PAD + (local report time / 24h) * pitch (same for the end)
        bars_pp = sorted(
            (r for r in bars if r.x1 > 40 and r.x0 < 800 and top <= r.top < bottom), key=lambda r: r.x0
        )
        pitch = edges[1] - edges[0]

        def bar_col(x: float) -> int:
            return math.floor((x - BAR_PAD - edges[0]) / pitch + 0.0005)

        trip_tokens = [w for w in grid if re.fullmatch(r"\d{4}", w.text) and abs(w.top - lab.top) < 5]
        other = [w for w in grid if w not in trip_tokens]
        insts: list[Instance] = []
        used: set[int] = set()
        for tw in trip_tokens:
            cand = [
                (b.x0 - tw.x0, bi) for bi, b in enumerate(bars_pp)
                if bi not in used and -1.5 <= b.x0 - tw.x0 <= 9
            ]
            if not cand:
                raise LineParseError(f"line {number} {lab.text}: no bar for trip token {tw.text} at x={tw.x0:.0f}")
            _, bi = min(cand)
            used.add(bi)
            b = bars_pp[bi]
            inst = Instance(tripId=tw.text, startCol=bar_col(b.x0), endCol=bar_col(b.x1), x0=tw.x0, barX0=b.x0 - edges[0], barX1=b.x1 - edges[0])
            for w in other:
                if abs(w.x0 - tw.x0) > 3.5:
                    continue
                dt = w.top - lab.top
                if RE_HHMM.match(w.text) and 10 < dt < 20:
                    inst.reportUtc = f"{w.text[:2]}:{w.text[2:]}"
                elif RE_CREDIT.match(w.text) and dt >= 20:
                    inst.credit = hm(w.text)
                elif RE_PAREN_CREDIT.match(w.text) and dt >= 20:
                    inst.ppCredit = hm(RE_PAREN_CREDIT.match(w.text)[1])
            insts.append(inst)
        # airport/hot standby (SBA2/SBA4): one single-day activity per cell, shown as code + activity id
        # (id on the row below the code), with no green bar and no credit text
        for w in grid:
            if re.fullmatch(r"\d{4}", w.text) and 5 <= w.top - lab.top < 12:
                c = _col_of(w.xc, edges)
                insts.append(Instance(tripId=w.text, startCol=c, endCol=c, x0=w.x0))
        codes: dict[int, str] = {}
        for w in grid:
            if abs(w.top - lab.top) < 5 and (w.text in RESERVE_TOKENS):
                codes[_col_of(w.xc, edges)] = TOKEN_CODE.get(w.text, w.text)
        unused = [(bar_col(b.x0), bar_col(b.x1)) for bi, b in enumerate(bars_pp) if bi not in used]
        pps.append(
            PPBlock(
                label=lab.text,
                id=RE_PPID.match(pid_w.text)[1] if pid_w else "",
                stats=stats,
                top=top,
                bottom=bottom,
                col_x=edges,
                instances=insts,
                codes=codes,
                orphanBars=unused,
            )
        )
    return RawLine(number, comment, seats, pps, page_no)


# Row offsets (pt, from the weekday-name header row's top) of the label-column rows:
# `PPn (id)`, CT, BT, DO, DD. Hidden clipped text overlapping this column sits on other y values.
LABEL_ROW_OFFSETS = (21.76, 31.30, 40.85, 50.41, 59.96)
GRID_LEFT, GRID_RIGHT = 44.0, 790.0


def bidline_page_filter(pg):
    """Drop characters that are clipped away in the rendered page: anything left of / right of the table
    frame, and anything in the label column that is not on one of its real rows."""
    hdr_tops = sorted(
        {round(c["top"], 2) for c in pg.chars if 86 <= c["x0"] <= 100 and c["text"] == "S" and c["top"] > 120}
    )
    # collapse near-duplicates (same row seen twice)
    heads: list[float] = []
    for t in hdr_tops:
        if not heads or t - heads[-1] > 3:
            heads.append(t)

    def keep(o) -> bool:
        if o["object_type"] != "char":
            return True
        if o["x0"] < GRID_LEFT or o["x1"] > GRID_RIGHT:
            return False
        if o["x0"] < 83:
            above = [h for h in heads if h <= o["top"] + 0.5]
            if above:
                d = o["top"] - above[-1]
                if d >= 15 and not any(abs(d - off) < 0.12 for off in LABEL_ROW_OFFSETS):
                    # only the label rows live here; but the next line's header block restarts at d large
                    return False
        return True

    return pg.filter(keep)


def load_bidline_pages(pdf_path: str, first: int | None = None, last: int | None = None) -> list[Page]:
    from .words import load_pages

    return load_pages(pdf_path, first, last, page_filter=bidline_page_filter)


def parse_lines(pages: list[Page], first_page_no: int = 1) -> list[RawLine]:
    lines: list[RawLine] = []
    for i, p in enumerate(pages):
        lines.extend(parse_page(p, first_page_no + i))
    return lines
