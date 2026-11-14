"""Deep, super-resolved images per wavelength band: every frame of a field resampled onto a finer grid and stacked.

    python -m pipeline.deep --name rdra --oversample 2
"""
from __future__ import annotations

import argparse
import json
import struct
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS
from reproject import reproject_adaptive, reproject_interp

from .align import BAD_MASK, PIX_ARCSEC, frame_wcs
from .irsa import CACHE

warnings.simplefilter("ignore", AstropyWarning)

BANDS = {"blue": (0.70, 1.60), "green": (1.60, 3.00), "red": (3.00, 5.10)}


def output_wcs(ra: float, dec: float, size_deg: float, oversample: int) -> tuple[WCS, tuple[int, int]]:
    pix = PIX_ARCSEC / oversample
    n = int(round(size_deg * 3600 / pix))
    n += n % 2
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-pix / 3600, pix / 3600]
    return w, (n, n)


def resample(args):
    path, wcs_hdr, out_hdr, shape, method = args
    z = np.load(path)
    img = z["image"].astype(np.float64) - z["zodi"]
    img[(z["flags"].astype(np.uint32) & BAD_MASK) != 0] = np.nan
    img -= np.nanmedian(img)
    win = WCS(fits.Header.fromstring(wcs_hdr, sep="\n"))
    wout = WCS(fits.Header.fromstring(out_hdr, sep="\n"))
    if method == "adaptive":
        out, fp = reproject_adaptive((img, win), wout, shape_out=shape, conserve_flux=False, boundary_mode="ignore")
    else:
        out, fp = reproject_interp((img, win), wout, shape_out=shape, order="bilinear")
    out[fp < 0.5] = np.nan
    return out.astype(np.float32)


def robust_scale(frames: np.ndarray, ref: np.ndarray, snr: float = 20.0) -> np.ndarray:
    """Per-frame multiplicative scale against a reference, from bright pixels (frames drift by tens of %)."""
    noise = 1.4826 * np.nanmedian(np.abs(ref - np.nanmedian(ref)))
    bright = ref > snr * noise
    if bright.sum() < 20:
        return np.ones(len(frames))
    with np.errstate(divide="ignore", invalid="ignore"):
        s = np.nanmedian(frames[:, bright] / ref[bright], axis=1)
    return np.where(np.isfinite(s) & (s > 0.2) & (s < 5), s, np.nan)


def mad(v):
    return 1.4826 * np.nanmedian(np.abs(v - np.nanmedian(v)))


def stack(frames: np.ndarray, clip: float = 3.0) -> tuple[np.ndarray, np.ndarray, dict]:
    ref = np.nanmedian(frames, axis=0)
    s = robust_scale(frames, ref)
    ok = np.isfinite(s)
    f = frames[ok] / s[ok][:, None, None]
    med = np.nanmedian(f, axis=0)
    spread = 1.4826 * np.nanmedian(np.abs(f - med), axis=0)
    f = np.where(np.abs(f - med) <= clip * np.maximum(spread, 1e-6), f, np.nan)
    deep = np.nanmean(f, axis=0)
    half_a, half_b = np.nanmean(f[0::2], axis=0), np.nanmean(f[1::2], axis=0)
    noise = {"single_frame": float(np.nanmedian([mad(x - deep) for x in f])),
             "deep": float(mad(half_a - half_b) / 2)}
    return deep, np.sum(np.isfinite(f), axis=0), noise


def png(path: Path, rgb: np.ndarray) -> None:
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def asinh_rgb(bands: dict[str, np.ndarray]) -> np.ndarray:
    chans = []
    for name in ("red", "green", "blue"):
        d = np.nan_to_num(bands[name], nan=0.0)
        noise = 1.4826 * np.median(np.abs(d - np.median(d)))
        top = np.percentile(d, 99.8)
        x = np.arcsinh(np.clip(d, 0, None) / (3 * noise)) / np.arcsinh(max(top, 1e-6) / (3 * noise))
        chans.append(np.clip(x, 0, 1))
    rgb = np.stack(chans, axis=-1)[::-1]          # north up
    return (rgb * 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--oversample", type=int, default=2)
    ap.add_argument("--size", type=float, help="output size in degrees (default: inscribed square of the cutouts)")
    ap.add_argument("--method", choices=["adaptive", "interp"], default="adaptive")
    ap.add_argument("--procs", type=int, default=8)
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    info = json.loads((tile / "frames.json").read_text())
    size = a.size or info["fov_deg"] / 1.45
    wout, shape = output_wcs(info["ra"], info["dec"], size, a.oversample)
    out_hdr = wout.to_header().tostring(sep="\n")
    frames = sorted(info["frames"], key=lambda m: m["mjd"])
    jobs = [(str(tile / m["file"]), m["wcs"], out_hdr, shape, a.method) for m in frames]
    with ProcessPoolExecutor(a.procs) as ex:
        cube = np.stack(list(ex.map(resample, jobs, chunksize=4)))
    lam = np.array([m["lam_center"] for m in frames])
    out = tile / "deep"
    out.mkdir(exist_ok=True)
    bands, meta = {}, {"name": a.name, "oversample": a.oversample, "pix_arcsec": PIX_ARCSEC / a.oversample,
                       "shape": list(shape), "wcs": out_hdr, "bands": {}}
    for name, (lo, hi) in BANDS.items():
        m = (lam >= lo) & (lam < hi)
        if m.sum() < 3:
            continue
        deep, nused, noise = stack(cube[m])
        bands[name] = deep
        single, dn = noise["single_frame"], noise["deep"]
        meta["bands"][name] = {"lam_um": [lo, hi], "n_frames": int(m.sum()), "median_frames_per_pixel": float(np.median(nused)),
                               "single_frame_noise": single, "deep_noise": dn, "noise_gain": single / dn}
        (out / f"deep_{name}.f16.bin").write_bytes(np.nan_to_num(deep[::-1], nan=0).astype("<f2").tobytes())
        print(f"  {name:5s} {lo:.1f}-{hi:.1f} um: {m.sum():3d} frames ({np.median(nused):.0f} per pixel after clipping), "
              f"noise {single:.4f} -> {dn:.4f} MJy/sr (x{single / dn:.1f} deeper, sqrt(N) = {np.sqrt(np.median(nused)):.1f})")
    if len(bands) == 3:
        png(out / "deep_rgb.png", asinh_rgb(bands))
    (out / "deep.json").write_text(json.dumps(meta))
    print(f"{a.name}: {shape[1]}x{shape[0]} px at {PIX_ARCSEC / a.oversample:.2f}\"/px ({size * 60:.1f}') -> {out}")


if __name__ == "__main__":
    main()
