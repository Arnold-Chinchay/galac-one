"""Proper motion of a target measured from SPHEREx alone: Gaussian centroid per frame, straight-line fit.

    python -m pipeline.propermotion --name barnard --target barnard --parallax 547
"""
from __future__ import annotations

import argparse
import json
import warnings

import numpy as np
from astropy.coordinates import get_body_barycentric
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from scipy.optimize import curve_fit

from .irsa import CACHE
from .targets import TARGETS, mjd_to_year, position_at

warnings.simplefilter("ignore")


def gauss2d(xy, a, x0, y0, s, b):
    x, y = xy
    return a * np.exp(-((x - x0) ** 2 + (y - y0) ** 2) / (2 * s * s)) + b


def centroid(img, x0, y0, r=3):
    xi, yi = int(round(x0)), int(round(y0))
    box = img[yi - r:yi + r + 1, xi - r:xi + r + 1]
    if box.shape != (2 * r + 1, 2 * r + 1) or np.isnan(box).mean() > 0.2:
        return None
    yy, xx = np.mgrid[yi - r:yi + r + 1, xi - r:xi + r + 1]
    ok = np.isfinite(box)
    b0 = np.nanmedian(box[[0, -1], :])
    try:
        p, cov = curve_fit(gauss2d, (xx[ok], yy[ok]), box[ok], p0=[np.nanmax(box) - b0, x0, y0, 1.0, b0], maxfev=4000)
    except Exception:
        return None
    if not (0.4 < p[3] < 3 and p[0] > 0 and abs(p[1] - x0) < r and abs(p[2] - y0) < r):
        return None
    err = np.sqrt(np.abs(np.diag(cov)))[1:3]
    return p[1], p[2], p[0], float(np.hypot(*err))


def parallax_shift(ra, dec, mjd, plx_mas):
    """Parallax displacement (dRA*cos(dec), dDec) in mas for the given epochs."""
    e = get_body_barycentric("earth", Time(mjd, format="mjd")).xyz.to("au").value
    a, d = np.radians(ra), np.radians(dec)
    dra = plx_mas * (e[0] * np.sin(a) - e[1] * np.cos(a))
    ddec = plx_mas * (e[0] * np.cos(a) * np.sin(d) + e[1] * np.sin(a) * np.sin(d) - e[2] * np.cos(d))
    return dra, ddec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--target", required=True, choices=sorted(TARGETS))
    ap.add_argument("--parallax", type=float, default=0.0, help="mas, removed before the fit")
    ap.add_argument("--min-lam", type=float, default=0.0, help="use only frames with wavelength above this (um)")
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    img, mjd, lam = z["image"], z["mjd"], np.nanmean(z["lam"], axis=(1, 2))
    w = WCS(fits.Header.fromstring(str(z["wcs"]), sep="\n"))
    t = TARGETS[a.target]

    rows = []
    for i in range(len(img)):
        if lam[i] < a.min_lam:
            continue
        ra, dec = position_at(a.target, mjd[i])
        x0, y0 = w.world_to_pixel_values(float(ra), float(dec))
        c = centroid(img[i], float(x0), float(y0))
        if c:
            rows.append((mjd[i], *c))
    if len(rows) < 10:
        print(f"{t['label']}: only {len(rows)} usable centroids")
        return
    r = np.array(rows)
    ra_m, dec_m = w.pixel_to_world_values(r[:, 1], r[:, 2])
    dec0 = float(np.median(dec_m))
    ra0 = float(np.median(ra_m))
    xa = (ra_m - ra0) * np.cos(np.radians(dec0)) * 3.6e6     # mas
    xd = (dec_m - dec0) * 3.6e6
    pa, pd = parallax_shift(ra0, dec0, r[:, 0], a.parallax)
    xa, xd = xa - pa, xd - pd
    yr = mjd_to_year(r[:, 0])
    keep = np.ones(len(r), bool)
    for _ in range(4):
        fa = np.polyfit(yr[keep], xa[keep], 1)
        fd = np.polyfit(yr[keep], xd[keep], 1)
        res = np.hypot(xa - np.polyval(fa, yr), xd - np.polyval(fd, yr))
        keep = res < 3 * 1.4826 * np.median(res[keep]) + 1
    rng = np.random.default_rng(0)
    boot = []
    idx = np.nonzero(keep)[0]
    for _ in range(300):
        b = rng.choice(idx, len(idx))
        boot.append((np.polyfit(yr[b], xa[b], 1)[0], np.polyfit(yr[b], xd[b], 1)[0]))
    boot = np.array(boot)
    pm = np.array([fa[0], fd[0]])
    err = boot.std(axis=0)
    total, total_ref = np.hypot(*pm), np.hypot(t["pmra"], t["pmdec"])
    print(f"{t['label']}: {keep.sum()}/{len(r)} centroids over {yr.max() - yr.min():.2f} yr | "
          f"scatter {1.4826 * np.median(res[keep]):.0f} mas per frame")
    print(f"  measured  pmRA* {pm[0]:8.0f} +- {err[0]:4.0f}  pmDec {pm[1]:8.0f} +- {err[1]:4.0f} mas/yr  (total {total:.0f})")
    print(f"  reference pmRA* {t['pmra']:8.0f}         pmDec {t['pmdec']:8.0f}          mas/yr  (total {total_ref:.0f})")
    print(f"  difference {total - total_ref:+.0f} mas/yr ({(total - total_ref) / total_ref:+.1%}), "
          f"direction off by {np.degrees(np.arctan2(pm[0], pm[1]) - np.arctan2(t['pmra'], t['pmdec'])):+.1f} deg")
    (tile / "propermotion.json").write_text(json.dumps({
        "target": a.target, "label": t["label"], "n": int(keep.sum()), "years": float(yr.max() - yr.min()),
        "pm_mas_yr": pm.tolist(), "err_mas_yr": err.tolist(), "reference_mas_yr": [t["pmra"], t["pmdec"]],
        "points": [[float(m), float(x), float(y)] for m, x, y in zip(r[keep, 0], xa[keep], xd[keep])]}))


if __name__ == "__main__":
    main()
