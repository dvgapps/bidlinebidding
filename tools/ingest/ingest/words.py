"""Word extraction helpers shared by the PDF parsers (pdfplumber is imported lazily)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True, slots=True)
class Word:
    x0: float
    x1: float
    top: float
    bottom: float
    text: str

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass(frozen=True, slots=True)
class Rect:
    x0: float
    x1: float
    top: float
    bottom: float
    color: tuple | None


@dataclass(slots=True)
class Page:
    width: float
    height: float
    words: list[Word]
    rects: list[Rect]


def load_pages(
    pdf_path: str,
    first: int | None = None,
    last: int | None = None,
    page_filter: Callable[[Any], Any] | None = None,
) -> list[Page]:
    """Read pages. `page_filter(pdfplumber_page) -> pdfplumber_page` can drop characters *before* word
    assembly (the Bidlines PDF carries clipped, off-grid text that otherwise garbles real words)."""
    import pdfplumber

    pages: list[Page] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, pg in enumerate(pdf.pages):
            if first is not None and i < first:
                continue
            if last is not None and i > last:
                break
            rects = [
                Rect(r["x0"], r["x1"], r["top"], r["bottom"], _color(r.get("non_stroking_color")))
                for r in pg.rects
            ]
            if page_filter:
                pg = page_filter(pg)
            words = [
                Word(w["x0"], w["x1"], w["top"], w["bottom"], w["text"])
                for w in pg.extract_words(x_tolerance=1.5)
            ]
            pages.append(Page(float(pg.width), float(pg.height), words, rects))
    return pages


def _color(c):
    if c is None:
        return None
    if isinstance(c, (int, float)):
        return (float(c),)
    return tuple(round(float(v), 2) for v in c)


def group_rows(words: list[Word], tol: float = 2.0) -> list[list[Word]]:
    """Group words into visual rows (by `top`), each row sorted left-to-right."""
    rows: list[list[Word]] = []
    for w in sorted(words, key=lambda w: (w.top, w.x0)):
        if rows and abs(rows[-1][0].top - w.top) <= tol:
            rows[-1].append(w)
        else:
            rows.append([w])
    for r in rows:
        r.sort(key=lambda w: w.x0)
    return rows
