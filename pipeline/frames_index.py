"""Answer "which SPHEREx images cover (ra, dec)?" from our own S3 header index (pipeline/s3index.py).

Replacement for IRSA TAP when it is down. Exact test: the point is projected onto the tangent
plane centred on itself and checked against the image's 4-corner footprint polygon.
"""
from __future__ import annotations

import csv
import gzip
from pathlib import Path

import numpy as np

INDEX_DIR = Path(__file__).resolve().parent.parent / "cache" / "index"
IBE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/"
_cache: dict[str, np.ndarray] = {}


def load_merged(paths: list[Path]) -> dict[str, np.ndarray]:
    """Load several index files (e.g. DR1 + QR3 release assets) as one index."""
    parts = [load_index(path=Path(p)) for p in paths]
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}


def load_index(release: str = "dr1", path: Path | None = None) -> dict[str, np.ndarray]:
    """Load either a merged index file or every per-week file of a release."""
    files = [path] if path else sorted((INDEX_DIR / release).glob("*.csv.gz"))
    if not files:
        raise FileNotFoundError(f"no index files for {release} in {INDEX_DIR / release} (run pipeline.s3index or download the release asset)")
    rows = []
    for f in files:
        with gzip.open(f, "rt", newline="") as fh:
            r = csv.reader(fh)
            header = next(r)
            rows += list(r)
    cols = {name: [row[i] for row in rows] for i, name in enumerate(header)}
    out = {"key": np.array(cols["key"]), "obsid": np.array(cols["obsid"]), "det": np.array(cols["det"], dtype=int),
           "mjd": np.array(cols["mjd"], dtype=float)}
    for name in header[4:]:
        out[name] = np.array(cols[name], dtype=float)
    return out


def _tangent(ra, dec, ra0, dec0):
    """Gnomonic projection (deg -> plane units) centred on (ra0, dec0)."""
    ra, dec, ra0, dec0 = map(np.radians, (ra, dec, ra0, dec0))
    cosc = np.sin(dec0) * np.sin(dec) + np.cos(dec0) * np.cos(dec) * np.cos(ra - ra0)
    x = np.cos(dec) * np.sin(ra - ra0) / cosc
    y = (np.cos(dec0) * np.sin(dec) - np.sin(dec0) * np.cos(dec) * np.cos(ra - ra0)) / cosc
    return x, y, cosc


def frames_at(ra: float, dec: float, idx: dict[str, np.ndarray], margin_deg: float = 0.0) -> list[dict]:
    """All indexed images whose footprint contains (ra, dec), sorted by time.

    margin_deg > 0 shrinks the footprint so a cutout of that half-size stays inside the image.
    """
    # 1) cheap prefilter: angular distance to image centre < 2.7 deg (detector is ~3.5 deg wide)
    x0, y0, cosc = _tangent(idx["ra_c"], idx["dec_c"], ra, dec)
    near = (cosc > 0) & (np.hypot(x0, y0) < np.radians(2.7))
    sel = np.nonzero(near)[0]
    hits = []
    for i in sel:
        xs, ys, _ = _tangent(np.array([idx[f"ra{k}"][i] for k in range(1, 5)]),
                             np.array([idx[f"dec{k}"][i] for k in range(1, 5)]), ra, dec)
        # point (0,0) inside convex quad <=> same sign of all cross products
        cross = [(xs[(k + 1) % 4] - xs[k]) * (0 - ys[k]) - (ys[(k + 1) % 4] - ys[k]) * (0 - xs[k]) for k in range(4)]
        if not (all(c > 0 for c in cross) or all(c < 0 for c in cross)):
            continue
        if margin_deg > 0:
            # distance from point to each edge (plane units ~ radians near the point)
            d = min(abs(c) / np.hypot(xs[(k + 1) % 4] - xs[k], ys[(k + 1) % 4] - ys[k]) for k, c in enumerate(cross))
            if np.degrees(d) < margin_deg:
                continue
        hits.append({"uri": IBE + idx["key"][i], "key": str(idx["key"][i]), "obsid": str(idx["obsid"][i]),
                     "det": int(idx["det"][i]), "mjd": float(idx["mjd"][i])})
    hits.sort(key=lambda h: h["mjd"])
    return hits
