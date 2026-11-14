"""Stage 1: download + reduce every frame covering a sky position.

  python -m pipeline.fetch_tile --name wise0855 --ra 133.79513 --dec -7.24515 --fov 0.1
  python -m pipeline.fetch_tile --name test --ra .. --dec .. --fov 0.1 --frames-json my_frames.json   # TAP down

Output (cache/tiles/<name>/): frames.json (sorted by time) + one reduced .npz per frame.
Alignment, spectral subtraction and export come in later stages.
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


def process_frame(i: int, fr: dict, ra: float, dec: float, fov: float, tile_dir: Path, keep_raw: bool) -> dict:
    url = cutout_url(fr["uri"], ra, dec, fov)
    raw = CACHE / "raw" / (tile_dir.name + f"_{i:04d}.fits")
    download_cutout(url, raw)
    red = reduce_cutout(raw)
    npz = tile_dir / f"frame_{i:04d}.npz"
    np.savez_compressed(npz, **{k: v for k, v in red.items() if k != "meta"})
    if not keep_raw:
        raw.unlink(missing_ok=True)
    meta = red["meta"] | {"file": npz.name, "uri": fr["uri"], "index": i}
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--fov", type=float, default=0.1, help="cutout size in degrees")
    ap.add_argument("--workers", type=int, default=4, help="parallel downloads (be polite to IRSA: <= 8)")
    ap.add_argument("--max-frames", type=int, default=0, help="0 = all")
    ap.add_argument("--frames-json", help='fallback list: [{"uri": "...", "mjd": 0}] when TAP is down')
    ap.add_argument("--keep-raw", action="store_true")
    a = ap.parse_args()

    if a.frames_json:
        frames = json.loads(Path(a.frames_json).read_text())
        print(f"frames from {a.frames_json}: {len(frames)}")
    else:
        print("TAP up:", tap_is_up())
        frames = query_frames(a.ra, a.dec)
        print(f"frames from TAP: {len(frames)}")
    if a.max_frames:
        frames = frames[: a.max_frames]

    tile_dir = CACHE / "tiles" / a.name
    tile_dir.mkdir(parents=True, exist_ok=True)

    metas, failed = [], []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(process_frame, i, fr, a.ra, a.dec, a.fov, tile_dir, a.keep_raw): i for i, fr in enumerate(frames)}
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
