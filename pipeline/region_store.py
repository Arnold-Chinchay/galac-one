"""Read every frame that touches a mosaic region from S3 once, so its cells are cut from disk instead of re-read per cell.

    python -m pipeline.region_store --ra 139.21875 --dec 14.47751 --size 2.6 --step 0.34 --cell-fov 0.45 \
        --index cache/merged/*.csv.gz --out /mnt/store
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from .frames_index import frames_at, load_merged
from .mosaic import cells
from .s3cutout import store_frame


def region_keys(ra: float, dec: float, size: float, step: float, cell_fov: float, idx: dict) -> list[str]:
    """Union of the frames each cell would fetch on its own (same query and margin as fetch_tile)."""
    keys: dict[str, float] = {}
    for c in cells(ra, dec, size, step):
        for fr in frames_at(c["ra"], c["dec"], idx, margin_deg=cell_fov / 2):
            keys[fr["key"]] = fr["mjd"]
    return sorted(keys, key=keys.get)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--size", type=float, default=2.6)
    ap.add_argument("--step", type=float, default=0.34)
    ap.add_argument("--cell-fov", type=float, default=0.45)
    ap.add_argument("--index", nargs="+", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--max-frames", type=int, default=0, help="0 = all (testing only)")
    ap.add_argument("--reserve-gb", type=float, default=4.0, help="stop storing frames when free disk falls below this")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    keys = region_keys(a.ra, a.dec, a.size, a.step, a.cell_fov, load_merged(a.index))
    if a.max_frames:
        keys = keys[: a.max_frames]
    t0, failed = time.time(), []

    def fetch(key: str) -> None:
        # Keep room for the cells' own files: once the disk is this full, the remaining frames are read per cell from S3.
        if shutil.disk_usage(a.out).free < a.reserve_gb * 1e9:
            raise OSError("disk reserve reached")
        store_frame(key, a.out)

    with ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(fetch, k): k for k in keys}
        for f in as_completed(futs):
            try:
                f.result()
            except Exception as e:  # noqa: BLE001  cells fall back to S3 for any frame missing here
                failed.append({"key": futs[f], "error": str(e)[:200]})
    (a.out / "store.json").write_text(json.dumps({"frames": len(keys), "failed": failed}))
    print(f"region store: {len(keys) - len(failed)} of {len(keys)} frames in {time.time() - t0:.0f} s -> {a.out}")


if __name__ == "__main__":
    main()
