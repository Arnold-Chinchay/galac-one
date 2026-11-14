"""Build our own spatial index of SPHEREx Level-2 images straight from the public AWS bucket.

Why: IRSA TAP/SIA were down (502) on 14-nov-2026, and TAP is the only official way to know
which images cover a sky position. The AWS Open Data bucket `nasa-irsa-spherex` has every file
but no spatial index. Each FITS starts with the IMAGE header (WCS, time, detector), so a ~29 KB
HTTP range read per file is enough to index it (no 65 MB download).

  python -m pipeline.s3index --release dr1 --weeks 2025W18_1B          # one week
  python -m pipeline.s3index --release dr1 --week-slice 0:10           # weeks 0..9 (for CI matrix)
  python -m pipeline.s3index --release dr1 --list-weeks                # print week prefixes

Output: cache/index/<release>/<week>.csv.gz with one row per image:
  key, obsid, det, mjd, ra_c, dec_c, ra1, dec1, ra2, dec2, ra3, dec3, ra4, dec4
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import threading
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning
from botocore import UNSIGNED
from botocore.config import Config

warnings.simplefilter("ignore", FITSFixedWarning)

BUCKET = "nasa-irsa-spherex"
HEADER_BYTES = 31_000  # primary (2880) + IMAGE header (~292 cards = 9 blocks) with margin
OUT = Path(__file__).resolve().parent.parent / "cache" / "index"
COLS = ["key", "obsid", "det", "mjd", "ra_c", "dec_c", "ra1", "dec1", "ra2", "dec2", "ra3", "dec3", "ra4", "dec4"]

_local = threading.local()


def s3():
    if not hasattr(_local, "c"):
        _local.c = boto3.client("s3", region_name="us-east-1",
                                config=Config(signature_version=UNSIGNED, max_pool_connections=64,
                                              retries={"max_attempts": 6, "mode": "adaptive"}))
    return _local.c


def list_weeks(release: str) -> list[str]:
    pag = s3().get_paginator("list_objects_v2")
    out = []
    for page in pag.paginate(Bucket=BUCKET, Prefix=f"{release}/level2/", Delimiter="/"):
        out += [p["Prefix"].rstrip("/").rsplit("/", 1)[-1] for p in page.get("CommonPrefixes", [])]
    return out


def list_keys(release: str, week: str) -> list[str]:
    pag = s3().get_paginator("list_objects_v2")
    keys = []
    for page in pag.paginate(Bucket=BUCKET, Prefix=f"{release}/level2/{week}/"):
        keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].endswith(".fits")]
    return keys


def index_one(key: str) -> list | None:
    for attempt in range(4):
        try:
            raw = s3().get_object(Bucket=BUCKET, Key=key, Range=f"bytes=0-{HEADER_BYTES - 1}")["Body"].read()
            buf = io.BytesIO(raw)
            fits.Header.fromfile(buf)          # primary
            h = fits.Header.fromfile(buf)      # IMAGE
            w = WCS(h)
            fp = w.calc_footprint()            # 4 corners (deg)
            c = w.pixel_to_world_values(h["NAXIS1"] / 2 - 0.5, h["NAXIS2"] / 2 - 0.5)
            return [key, h.get("OBSID"), int(h.get("DETECTOR", 0)), round(float(h["MJD-AVG"]), 7),
                    round(float(c[0]), 5), round(float(c[1]), 5)] + [round(float(v), 5) for v in fp.ravel()]
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    print(f"  FAILED {key}: {type(last).__name__}: {str(last)[:80]}")
    return None


def _index_chunk(args: tuple[list[str], int]) -> list:
    keys, threads = args
    with ThreadPoolExecutor(max_workers=threads) as ex:
        return [r for r in ex.map(index_one, keys) if r]


def index_week(release: str, week: str, workers: int = 48, procs: int = 1) -> Path:
    """procs > 1 spreads the CPU-bound header parsing over several processes (GIL workaround)."""
    out = OUT / release / f"{week}.csv.gz"
    if out.exists():
        print(f"{week}: already indexed")
        return out
    t = time.time()
    keys = list_keys(release, week)
    if procs <= 1:
        rows = _index_chunk((keys, workers))
    else:
        from concurrent.futures import ProcessPoolExecutor
        step = -(-len(keys) // (procs * 4))  # 4 chunks per process for balance
        chunks = [(keys[i:i + step], max(4, workers // procs)) for i in range(0, len(keys), step)]
        with ProcessPoolExecutor(max_workers=procs) as ex:
            rows = [r for part in ex.map(_index_chunk, chunks) for r in part]
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    with gzip.open(tmp, "wt", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(COLS)
        wr.writerows(rows)
    tmp.replace(out)
    print(f"{week}: {len(rows)}/{len(keys)} indexed in {time.time() - t:.0f}s -> {out.name}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", default="dr1")
    ap.add_argument("--weeks", nargs="*", help="explicit week ids, e.g. 2025W18_1B")
    ap.add_argument("--week-slice", help="python slice over the sorted week list, e.g. 0:10")
    ap.add_argument("--list-weeks", action="store_true")
    ap.add_argument("--workers", type=int, default=48, help="total HTTP threads")
    ap.add_argument("--procs", type=int, default=1, help="processes (use ~CPU cores to beat the GIL)")
    ap.add_argument("--reverse", action="store_true", help="process weeks from the end (so two machines can meet in the middle)")
    a = ap.parse_args()

    weeks = list_weeks(a.release)
    if a.list_weeks:
        print(len(weeks), "weeks")
        print("\n".join(weeks))
        return
    if a.weeks:
        sel = a.weeks
    elif a.week_slice:
        i, j = (int(x) if x else None for x in a.week_slice.split(":"))
        sel = weeks[i:j]
    else:
        sel = weeks
    if a.reverse:
        sel = list(reversed(sel))
    for w in sel:
        index_week(a.release, w, a.workers, a.procs)


if __name__ == "__main__":
    main()
