"""Parse OpSpecs C070 (authorized airports). The PDF text is extracted mirrored, so each line is reversed."""
from __future__ import annotations

import re
from collections import Counter

RE_ENTRY = re.compile(r"^(?P<loc>.+);(?P<icao>[A-Z0-9]{4})$")


def parse_opspecs_text(pages_text: list[str]) -> dict[str, str]:
    """Return {ICAO: location text} from the (mirrored) page texts."""
    out: dict[str, str] = {}
    for txt in pages_text:
        for raw in txt.splitlines():
            line = raw[::-1].strip().replace(";", ";")  # Greek question mark used as the separator
            m = re.match(r"^(?P<loc>.+);(?P<icao>[A-Z0-9]{4})$", line)
            if m:
                out[m["icao"]] = m["loc"]
    return out


def load_opspecs(pdf_path: str) -> dict[str, str]:
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        return parse_opspecs_text([(p.extract_text() or "") for p in pdf.pages])


def country_of(loc: str) -> str:
    return loc.rsplit(",", 1)[-1].strip().upper()


# Not international per the union contract: the US (incl. territories and states listed separately),
# Canada and Mexico.
DOMESTIC_COUNTRIES = {
    "UNITEDSTATES", "ALASKA(U.S.)", "HAWAII(U.S.)", "PUERTORICO(U.S.)", "MARIANAIS.(U.S.)", "GUAM(U.S.)",
    "CANADA", "MEXICO",
}

# IATA codes whose ICAO is not simply K/C/P + IATA (or that OpSpecs does not list): IATA -> ICAO,
# or -> a country name when the airport is not in OpSpecs C070 at all.
MANUAL_ICAO = {
    "ARN": "ESSA", "BCN": "LEBL", "BKK": "VTBS", "BUD": "LHBP", "CDG": "LFPG", "CGN": "EDDK", "CGO": "ZHCC",
    "CRK": "RPLC", "DUB": "EIDW", "EMA": "EGNX", "FCO": "LIRF", "FRA": "EDDF", "HEL": "EFHK", "HKG": "VHHH",
    "ICN": "RKSI", "IST": "LTFM", "KIX": "RJBB", "KKJ": "RJFR", "MAD": "LEMD", "MNL": "RPLL", "MMX": "ESMS",
    "NRT": "RJAA", "OSL": "ENGM", "PEN": "WMKP", "PRG": "LKPR", "PVG": "ZSPD", "SDQ": "MDSD", "SGN": "VVTS",
    "SIN": "WSSS", "SNN": "EINN", "STN": "EGSS", "SYD": "YSSY", "SZX": "ZGSZ", "TPE": "RCTP", "VCE": "LIPZ",
    "VIE": "LOWW", "VLC": "LEVC", "WAW": "EPWA", "GDL": "MMGL", "MTY": "MMMY", "NLU": "MMSM",
    "KOA": "PHKO", "LIH": "PHLI", "OGG": "PHOG", "SJU": "TJSJ",
    "DAL": "US", "DCA": "US", "MDW": "US",
}


def airport_info(iata: str, opspecs: dict[str, str]) -> dict:
    """Resolve an IATA code to {icao, country, intl}. Raises KeyError when it cannot be resolved."""
    ref = MANUAL_ICAO.get(iata)
    candidates = [ref] if ref and len(ref) == 4 else ([] if ref else ["K" + iata, "C" + iata, "P" + iata])
    for icao in candidates:
        if icao in opspecs:
            country = country_of(opspecs[icao])
            return {"icao": icao, "country": country, "intl": country not in DOMESTIC_COUNTRIES}
    if ref == "US":
        return {"icao": None, "country": "UNITEDSTATES", "intl": False}
    raise KeyError(f"cannot place airport {iata} (not in OpSpecs C070 under {candidates or ref})")
