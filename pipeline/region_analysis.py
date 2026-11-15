"""Merge the cold-object search of every cell of a region into one list, dropping duplicates where cells overlap.

    python -m pipeline.region_analysis --cells cells --pix 1077 --ra 139.21875 --dec 14.47751 --out out/analysis.json

Each cell ran pipeline.redsearch: sources much redder than the stars, with their excess by wavelength band and a
motion test against random splits of the frames. A source is a cold-dwarf candidate when it has no excess at
2.5-3.5 um and a strong one at 4.0-4.7 um (the y_dwarf_like flag), and a moving candidate when its shift between
early and late frames beats random splits (p < 0.05) and is at least twice its error.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

SAME_ARCSEC = 15.0         # two cells reporting sources this close describe the same source


def sep_arcsec(a: dict, b: dict) -> float:
    d1, d2 = math.radians(a["dec"]), math.radians(b["dec"])
    dra = math.radians(a["ra"] - b["ra"])
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(dra)
    return math.degrees(math.acos(max(-1.0, min(1.0, c)))) * 3600


def band(spec: list[dict], lo: float, key: str):
    return next((b.get(key) for b in spec if abs(b["lam_um"][0] - lo) < 1e-6), None)


def rises_to_4_5um(spec: list[dict]) -> bool:
    """A cold Y dwarf is faint at 3.5-4.0 um (methane) and peaks near 4.5 um: its excess at 4.4-4.7 must be at least
    twice that at 3.5-4.0 (WISE 0855: 0.13 vs 0.012 MJy/sr). Uses the flux when present, else the signal-to-noise."""
    for key, factor in (("excess_mjy_sr", 2.0), ("snr", 1.0)):
        a, b = band(spec, 3.5, key), band(spec, 4.4, key)
        if a is not None and b is not None and math.isfinite(a) and math.isfinite(b):
            return b >= factor * max(a, 0.0) and b > 0
    return False


def summarise(s: dict) -> dict:
    m = s.get("motion") or None
    # Frames spanning only days cannot give a motion: drop it rather than publish a meaningless number.
    if m and (m.get("years", 0) < 0.1 or not math.isfinite(m.get("err_arcsec_yr", math.inf)) or m["err_arcsec_yr"] > 100):
        m = None
    out = {"ra": round(s["ra"], 6), "dec": round(s["dec"], 6), "excess_snr": round(s["excess_snr"], 1),
           "colour_vs_stars": None if not math.isfinite(s.get("colour_vs_stars", math.inf)) else round(s["colour_vs_stars"], 2),
           "y_dwarf_like": bool(s.get("y_dwarf_like")) and rises_to_4_5um(s.get("spectrum", [])),
           "spectrum": [{"lam_um": b["lam_um"],
                         "snr": None if b.get("snr") is None or not math.isfinite(b["snr"]) else round(b["snr"], 1),
                         "excess_mjy_sr": None if b.get("excess_mjy_sr") is None or not math.isfinite(b["excess_mjy_sr"]) else round(b["excess_mjy_sr"], 4)}
                        for b in s.get("spectrum", [])]}
    if m:
        total = math.hypot(m["pm_ra_arcsec_yr"], m["pm_dec_arcsec_yr"])
        out["motion"] = {"pm_ra": round(m["pm_ra_arcsec_yr"], 2), "pm_dec": round(m["pm_dec_arcsec_yr"], 2), "total": round(total, 2),
                         "err": round(m["err_arcsec_yr"], 2), "p_null": round(m["p_null"], 3), "years": round(m["years"], 2)}
        # A hint only: 40 random splits cannot give p below ~0.025, and thousands of sources are tested.
        out["moving"] = m["p_null"] < 0.05 and total >= 3 * m["err_arcsec_yr"] and m["years"] >= 0.3
    else:
        out["motion"], out["moving"] = None, False
    return out


def merge(cells_dir: Path) -> tuple[list[dict], int, int]:
    found, searched, with_result = [], 0, 0
    for d in sorted(p for p in cells_dir.iterdir() if p.is_dir()):
        searched += 1
        f = d / "redsearch.json"
        if not f.exists():
            continue
        with_result += 1
        # numpy writes bare NaN, which is not JSON
        for s in json.loads(f.read_text().replace("NaN", "null")).get("sources", []):
            s = summarise(s)
            twin = next((t for t in found if sep_arcsec(t, s) < SAME_ARCSEC), None)
            if twin is None:
                found.append(s)
            elif s["excess_snr"] > twin["excess_snr"]:
                found[found.index(twin)] = s
    found.sort(key=lambda s: (-s["y_dwarf_like"], -s["moving"], -s["excess_snr"]))
    return found, searched, with_result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", type=Path, required=True)
    ap.add_argument("--pix", type=int, required=True)
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    sources, searched, with_result = merge(a.cells)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps({"pix": a.pix, "ra": a.ra, "dec": a.dec, "cells": searched, "cells_searched": with_result,
                                 "sources": sources}))
    print(f"region {a.pix}: {with_result}/{searched} cells searched, {len(sources)} red sources, "
          f"{sum(s['y_dwarf_like'] for s in sources)} cold-dwarf-like, {sum(s['moving'] for s in sources)} moving")


if __name__ == "__main__":
    main()
