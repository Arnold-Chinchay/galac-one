"""Reduce a SPHEREx cutout FITS to the arrays we use (drops the large EPSF table)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scipy.interpolate import RegularGridInterpolator


def pixel_wavelength(hdr: fits.Header, wave_tab) -> tuple[np.ndarray, np.ndarray]:
    """Wavelength and bandwidth (um) per pixel, interpolated from the 9x9 WCS-WAVE grid."""
    ny, nx = hdr["NAXIS2"], hdr["NAXIS1"]
    xs = np.arange(nx) + 1.0
    ys = np.arange(ny) + 1.0
    xa = (xs - hdr["CRPIX1A"]) * hdr["CDELT1A"] + hdr["CRVAL1A"]
    ya = (ys - hdr["CRPIX2A"]) * hdr["CDELT2A"] + hdr["CRVAL2A"]

    gx = np.asarray(wave_tab["X"][0], dtype=float)
    gy = np.asarray(wave_tab["Y"][0], dtype=float)
    vals = np.asarray(wave_tab["VALUES"][0], dtype=float)
    if vals.shape[-1] != 2:
        vals = np.moveaxis(vals, 0, -1)
    lam = RegularGridInterpolator((gy, gx), vals[..., 0], bounds_error=False, fill_value=None)
    bw = RegularGridInterpolator((gy, gx), vals[..., 1], bounds_error=False, fill_value=None)
    yy, xx = np.meshgrid(ya, xa, indexing="ij")
    pts = np.stack([yy.ravel(), xx.ravel()], axis=-1)
    return lam(pts).reshape(ny, nx).astype(np.float32), bw(pts).reshape(ny, nx).astype(np.float32)


def reduce_cutout(path: Path) -> dict:
    with fits.open(path) as h:
        hdr = h["IMAGE"].header
        wcs_hdr = WCS(hdr).to_header(relax=True)
        lam, bw = pixel_wavelength(hdr, h["WCS-WAVE"].data)
        out = {
            "image": np.asarray(h["IMAGE"].data, dtype=np.float32),
            "variance": np.asarray(h["VARIANCE"].data, dtype=np.float32),
            "zodi": np.asarray(h["ZODI"].data, dtype=np.float32),
            "flags": np.asarray(h["FLAGS"].data).astype(np.uint32),
            "lam": lam,
            "bw": bw,
            "meta": {
                "obsid": hdr.get("OBSID"),
                "detector": int(hdr.get("DETECTOR", 0)),
                "mjd": float(hdr["MJD-AVG"]),
                "bunit": hdr.get("BUNIT"),
                "lam_center": float(np.nanmean(lam)),
                "lam_span": float(np.nanmax(lam) - np.nanmin(lam)),
                "shape": list(h["IMAGE"].data.shape),
                "wcs": wcs_hdr.tostring(sep="\n"),
            },
        }
    return out
