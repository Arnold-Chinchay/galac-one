"""Stage 2: put every frame of a tile on one common pixel grid, subtract ZODI, mask bad pixels.

  python -m pipeline.align --name wise0855

Reads  cache/tiles/<name>/frames.json + frame_XXXX.npz   (from fetch_tile.py)
Writes cache/tiles/<name>/aligned.npz:
  image  (N,H,W) float32  MJy/sr, ZODI-subtracted, NaN where masked or outside the frame
  var    (N,H,W) float32
  lam    (N,H,W) float32  central wavelength per pixel (um)
  flags  (N,H,W) uint32   original FLAGS (nearest neighbour)
  mjd, det, bad_frac (N,), wcs (str)  -- all sorted by time

FLAGS bits verified 14-nov-2026 against the MSKN/MSKD keywords of a real cutout (docs/12).
SOURCE (21), FULLSAMPLE (12) are NOT masked: SOURCE is information, not an artifact.
"""
from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS
from reproject import reproject_interp

from .irsa import CACHE

warnings.simplefilter("ignore", AstropyWarning)

PIX_ARCSEC = 6.15
BAD_BITS = [0, 1, 2, 6, 7, 9, 10, 11, 14, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28]
BAD_MASK = np.uint32(sum(1 << b for b in BAD_BITS))


def reference_wcs(ra: float, dec: float, grid_fov_deg: float) -> tuple[WCS, tuple[int, int]]:
    n = int(round(grid_fov_deg * 3600 / PIX_ARCSEC))
    n += n % 2  # even size
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-PIX_ARCSEC / 3600, PIX_ARCSEC / 3600]
    return w, (n, n)


def frame_wcs(meta: dict) -> WCS:
    return WCS(fits.Header.fromstring(meta["wcs"], sep="\n"))


def align_frame(npz, wcs_in: WCS, wcs_out: WCS, shape_out: tuple[int, int], bg_sub: bool = True) -> dict:
    def rp(arr, order):
        out, fp = reproject_interp((arr, wcs_in), wcs_out, shape_out=shape_out, order=order)
        return out, fp

    img, fp = rp(npz["image"].astype(np.float64), "bilinear")
    zod, _ = rp(npz["zodi"].astype(np.float64), "bilinear")
    var, _ = rp(npz["variance"].astype(np.float64), "bilinear")
    lam, _ = rp(npz["lam"].astype(np.float64), "bilinear")
    flg, _ = rp(npz["flags"].astype(np.float64), "nearest-neighbor")  # float64 keeps 28 bits exact
    inside = fp > 0.5
    flags = np.where(inside & np.isfinite(flg), flg, 0).astype(np.uint32)
    bad = (~inside) | ((flags & BAD_MASK) != 0) | ~np.isfinite(img)
    # a bilinear neighbour of a bad pixel is also suspect: grow the mask by 1 px
    grown = bad.copy()
    grown[1:, :] |= bad[:-1, :]; grown[:-1, :] |= bad[1:, :]
    grown[:, 1:] |= bad[:, :-1]; grown[:, :-1] |= bad[:, 1:]
    clean = np.where(grown, np.nan, img - zod)
    # per-frame background: the residual zodiacal light changes with time and wavelength and is spatially
    # smooth, so it shows up as a frame-wide offset that a per-pixel spectrum cannot model.
    bg = float(np.nanmedian(clean)) if bg_sub and np.isfinite(clean).any() else 0.0
    clean = (clean - bg).astype(np.float32)
    return {"image": clean, "var": np.where(grown, np.nan, var).astype(np.float32),
            "lam": lam.astype(np.float32), "flags": flags, "bad_frac": float(grown.mean()), "bg": bg}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--grid-fov", type=float, help="output grid size in deg (default: cutout fov / 1.45, always inside a rotated cutout)")
    ap.add_argument("--max-bad", type=float, default=0.5, help="drop frames with more than this fraction of masked pixels")
    ap.add_argument("--no-bg-sub", action="store_true", help="do not subtract each frame's median background")
    a = ap.parse_args()

    tile = CACHE / "tiles" / a.name
    info = json.loads((tile / "frames.json").read_text())
    grid_fov = a.grid_fov or info["fov_deg"] / 1.45
    wcs_out, shape = reference_wcs(info["ra"], info["dec"], grid_fov)
    print(f"{a.name}: {info['n_ok']} frames -> grid {shape[1]}x{shape[0]} px ({grid_fov:.3f} deg)")

    keep, cols = [], {k: [] for k in ("image", "var", "lam", "flags")}
    for m in sorted(info["frames"], key=lambda m: m["mjd"]):
        z = np.load(tile / m["file"])
        r = align_frame(z, frame_wcs(m), wcs_out, shape, bg_sub=not a.no_bg_sub)
        if r["bad_frac"] > a.max_bad:
            continue
        for k in cols:
            cols[k].append(r[k])
        keep.append({**m, "bad_frac": r["bad_frac"], "bg": r["bg"]})

    out = {k: np.stack(v) for k, v in cols.items()}
    np.savez_compressed(tile / "aligned.npz", **out,
                        mjd=np.array([m["mjd"] for m in keep]), det=np.array([m["detector"] for m in keep]),
                        bad_frac=np.array([m["bad_frac"] for m in keep], dtype=np.float32),
                        bg=np.array([m["bg"] for m in keep], dtype=np.float32),
                        wcs=wcs_out.to_header().tostring(sep="\n"))
    print(f"kept {len(keep)}/{info['n_ok']} frames (bad fraction <= {a.max_bad}) -> {tile / 'aligned.npz'}")
    lam = np.array([m["lam_center"] for m in keep])
    print(f"wavelength range of kept frames: {lam.min():.3f} .. {lam.max():.3f} um | detectors: {sorted(set(int(m['detector']) for m in keep))}")


if __name__ == "__main__":
    main()
