"""IRSA access: frame discovery (TAP, with retries + cache) and cutout download.

Lessons verified 14-nov-2026 (see docs/12):
- TAP can return 502 for long stretches -> always cache, always retry, and allow a
  hand-made frames JSON as fallback (see fetch_tile.py --frames-json).
- Cutouts work on a different backend (/ibe/), ~4 MB each (the EPSF table dominates),
  ~12 s each, no CORS -> must be downloaded server-side (GitHub Actions), never from the browser.
- No extension selection is possible in the cutout URL.
"""
from __future__ import annotations

import hashlib
import json
import random
import time
from pathlib import Path

import requests

UA = {"User-Agent": "naylamp-space-hackathon/0.1 (educational; contact via github.com/spacenaylamp-blip)"}
IRSA = "https://irsa.ipac.caltech.edu/"
CACHE = Path(__file__).resolve().parent.parent / "cache"


def _retry(fn, tries: int = 5, base: float = 3.0, what: str = "request"):
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - network layer, retry anything
            last = e
            wait = base * (2 ** i) + random.random()
            print(f"  [retry {i + 1}/{tries}] {what}: {type(e).__name__}: {str(e)[:90]} -> wait {wait:.0f}s")
            time.sleep(wait)
    raise RuntimeError(f"{what} failed after {tries} tries: {last}")


def tap_is_up(timeout: float = 30) -> bool:
    try:
        return requests.get(IRSA + "TAP/availability", headers=UA, timeout=timeout).status_code == 200
    except requests.RequestException:
        return False


def query_frames(ra: float, dec: float, bandpasses=("SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"),
                 use_cache: bool = True, tries: int = 4) -> list[dict]:
    """All Level-2 images that cover (ra, dec), ordered by time. Returns [{uri, mjd, band}, ...]."""
    key = hashlib.md5(f"{ra:.5f},{dec:.5f},{','.join(bandpasses)}".encode()).hexdigest()[:12]
    cache_file = CACHE / "frames" / f"{key}.json"
    if use_cache and cache_file.exists():
        return json.loads(cache_file.read_text())

    from astroquery.ipac.irsa import Irsa  # imported lazily: heavy

    bands = ",".join(f"'{b}'" for b in bandpasses)
    adql = f"""
    SELECT a.uri AS uri, p.time_bounds_lower AS mjd, p.energy_bandpassname AS band
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {ra}, {dec}), p.poly)
      AND p.energy_bandpassname IN ({bands})
    ORDER BY p.time_bounds_lower
    """
    tbl = _retry(lambda: Irsa.query_tap(adql).to_table(), tries=tries, what="TAP query")
    rows = [{"uri": str(r["uri"]), "mjd": float(r["mjd"]), "band": str(r["band"])} for r in tbl]
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(rows))
    return rows


def cutout_url(uri: str, ra: float, dec: float, size_deg: float) -> str:
    base = uri if uri.startswith("http") else IRSA + uri.lstrip("/")
    return f"{base}?center={ra},{dec}deg&size={size_deg}deg"


def download_cutout(url: str, dest: Path, tries: int = 5) -> Path:
    """Download one cutout with retries. Skips if already cached."""
    if dest.exists() and dest.stat().st_size > 10_000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)

    def _get():
        r = requests.get(url, headers=UA, timeout=180)
        r.raise_for_status()
        if len(r.content) < 10_000:
            raise ValueError(f"suspiciously small cutout ({len(r.content)} B)")
        return r.content

    data = _retry(_get, tries=tries, what=dest.name)
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest
