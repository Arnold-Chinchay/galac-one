"""Download and reduce every frame that covers a sky position.

    python -m pipeline.fetch_tile --name wise0855 --ra 133.79513 --dec -7.24515 --fov 0.1
"""
from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from tqdm import tqdm

from .irsa import CACHE, cutout_url, download_cutout, query_frames, tap_is_up
from .reduce import reduce_cutout


def process_frame(i: int, fr: dict, ra: float, dec: float, fov: float, tile_dir: Path, keep_raw: bool, via: str = "irsa") -> dict:
    if via == "s3":
        from .s3cutout import s3_cutout
        red = s3_cutout(fr["key"], ra, dec, fov)
        raw = None
    else:
        url = cutout_url(fr["uri"], ra, dec, fov)
        raw = CACHE / "raw" / (tile_dir.name + f"_{i:04d}.fits")
        download_cutout(url, raw)
        red = reduce_cutout(raw)
    npz = tile_dir / f"frame_{i:04d}.npz"
    np.savez_compressed(npz, **{k: v for k, v in red.items() if k != "meta"})
    if raw is not None and not keep_raw:
        raw.unlink(missing_ok=True)
    meta = red["meta"] | {"file": npz.name, "uri": fr["uri"], "index": i}
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name")
    ap.add_argument("--target", help="name in pipeline/targets.py: centre on its position at the epoch of the frames")
    ap.add_argument("--ra", type=float)
    ap.add_argument("--dec", type=float)
    ap.add_argument("--fov", type=float, default=0.1, help="cutout size in degrees")
    ap.add_argument("--workers", type=int, default=4, help="parallel downloads (be polite to IRSA: <= 8)")
    ap.add_argument("--max-frames", type=int, default=0, help="0 = all")
    ap.add_argument("--frames-json", help='fallback list: [{"uri": "...", "mjd": 0}] when TAP is down')
    ap.add_argument("--via", choices=["irsa", "s3"], default="s3", help="s3: range reads from the public bucket (faster, no IRSA load)")
    ap.add_argument("--stride", type=int, default=1, help="take every Nth frame (sorted by time)")
    ap.add_argument("--keep-raw", action="store_true")
    ap.add_argument("--source", choices=["auto", "tap", "index"], default="auto",
                    help="auto = IRSA TAP if it is up, else our S3 index (pipeline/s3index.py)")
    ap.add_argument("--release", default="dr1")
    ap.add_argument("--index", nargs="+", help="index .csv.gz file(s), e.g. cache/merged/dr1_index.csv.gz cache/merged/qr3_index.csv.gz")
    a = ap.parse_args()
    a.name = a.name or a.target
    if a.target:
        from .frames_index import frames_at, load_merged
        from .targets import position_at
        idx = load_merged(a.index)
        ra0, dec0 = position_at(a.target, 61000.0)
        hits = frames_at(float(ra0), float(dec0), idx, margin_deg=a.fov / 2)
        ra, dec = position_at(a.target, float(np.median([h["mjd"] for h in hits])))
        a.ra, a.dec = float(ra), float(dec)
        print(f"{a.target}: centre at the median epoch {a.ra:.6f} {a.dec:+.6f}")

    if a.frames_json:
        frames = json.loads(Path(a.frames_json).read_text())
        print(f"frames from {a.frames_json}: {len(frames)}")
    elif a.source == "tap" or (a.source == "auto" and tap_is_up()):
        frames = query_frames(a.ra, a.dec)
        print(f"frames from IRSA TAP: {len(frames)}")
    else:
        from .frames_index import frames_at, load_index, load_merged
        idx = load_merged(a.index) if a.index else load_index(a.release)
        frames = frames_at(a.ra, a.dec, idx, margin_deg=a.fov / 2)
        print(f"frames from our S3 index ({len(idx['key'])} images indexed): {len(frames)}")
    if a.stride > 1:
        frames = frames[:: a.stride]          # even sampling in time (crowded fields have thousands of frames)
        print(f"stride {a.stride}: using {len(frames)} frames")
    if a.max_frames:
        frames = frames[: a.max_frames]

    tile_dir = CACHE / "tiles" / a.name
    tile_dir.mkdir(parents=True, exist_ok=True)

    metas, failed = [], []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(process_frame, i, fr, a.ra, a.dec, a.fov, tile_dir, a.keep_raw, a.via): i for i, fr in enumerate(frames)}
        for f in tqdm(as_completed(futs), total=len(futs), desc=a.name):
            try:
                metas.append(f.result())
            except Exception as e:  # noqa: BLE001
                failed.append({"index": futs[f], "error": str(e)[:200]})

    metas.sort(key=lambda m: m["mjd"])
    (tile_dir / "frames.json").write_text(json.dumps(
        {"name": a.name, "ra": a.ra, "dec": a.dec, "fov_deg": a.fov, "n_ok": len(metas), "n_failed": len(failed),
         "frames": metas, "failed": failed}, indent=1))
    print(f"done: {len(metas)} ok, {len(failed)} failed -> {tile_dir}")


if __name__ == "__main__":
    main()
