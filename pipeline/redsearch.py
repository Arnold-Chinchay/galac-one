"""Search a tile for very red sources (cold brown dwarfs) and test whether they move.

Long-wavelength stack (4.2-5.0 um) minus the short-wavelength stack (< 2.5 um) scaled by the typical
star colour leaves only sources much redder than stars. A candidate's motion is the centroid shift of
that red excess between the early and late halves of the frames, compared with random splits.

    python -m pipeline.redsearch --name wise0855wide
"""
from __future__ import annotations

import argparse
import json

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scipy.ndimage import maximum_filter, uniform_filter
from scipy.optimize import curve_fit

from .irsa import CACHE

PIX = 6.15
LONG, SHORT = (4.2, 5.0), 2.5
BANDS = [(0.7, 2.5), (2.5, 3.5), (3.5, 4.0), (4.0, 4.4), (4.4, 4.7), (4.7, 5.0)]


def mad(v):
    return 1.4826 * np.nanmedian(np.abs(v - np.nanmedian(v)))


def stack(img, m):
    s = np.nanmedian(img[m], axis=0)
    return s - np.nanmedian(s)


def _g2(xy, a, x0, y0, s, b):
    x, y = xy
    return a * np.exp(-((x - x0) ** 2 + (y - y0) ** 2) / (2 * s * s)) + b


def centroid(im, x0, y0, r=3):
    yy, xx = np.mgrid[y0 - r:y0 + r + 1, x0 - r:x0 + r + 1]
    box = im[y0 - r:y0 + r + 1, x0 - r:x0 + r + 1]
    ok = np.isfinite(box)
    p, cov = curve_fit(_g2, (xx[ok], yy[ok]), box[ok], p0=[np.nanmax(box), x0, y0, 1.0, 0.0], maxfev=5000)
    return p[1], p[2], float(np.hypot(*np.sqrt(np.abs(np.diag(cov)))[1:3])), p[0]


def motion(img, lam, mjd, SS, c, x, y, w, n_null=40, seed=1):
    L = (lam >= LONG[0]) & (lam <= LONG[1])
    split = np.median(mjd[L])
    early, late = L & (mjd < split), L & (mjd >= split)
    dt = (np.median(mjd[late]) - np.median(mjd[early])) / 365.25
    xe, ye, ee, _ = centroid(stack(img, early) - c * SS, x, y)
    xl, yl, el, _ = centroid(stack(img, late) - c * SS, x, y)
    rng = np.random.default_rng(seed)
    idx = np.nonzero(L)[0]
    null = []
    for _ in range(n_null):
        p = rng.permutation(idx)
        a, b = np.zeros(len(L), bool), np.zeros(len(L), bool)
        a[p[:len(p) // 2]] = True
        b[p[len(p) // 2:]] = True
        try:
            x1, y1, *_ = centroid(stack(img, a) - c * SS, x, y)
            x2, y2, *_ = centroid(stack(img, b) - c * SS, x, y)
            null.append(np.hypot(x2 - x1, y2 - y1))
        except Exception:
            pass
    shift = float(np.hypot(xl - xe, yl - ye))
    (ra1, dec1), (ra2, dec2) = w.pixel_to_world_values(xe, ye), w.pixel_to_world_values(xl, yl)
    pmra = (ra2 - ra1) * np.cos(np.radians(dec1)) * 3600 / dt
    pmdec = (dec2 - dec1) * 3600 / dt
    err = float(np.hypot(ee, el) * PIX / dt)
    null = np.array(null)
    return {"shift_px": shift, "years": float(dt), "pm_ra_arcsec_yr": float(pmra), "pm_dec_arcsec_yr": float(pmdec),
            "err_arcsec_yr": err, "null_median_px": float(np.median(null)), "null_max_px": float(null.max()),
            "p_null": float((np.sum(null >= shift) + 1) / (len(null) + 1))}


def excess_spectrum(img, lam, SS, x, y):
    out = []
    for lo, hi in BANDS:
        m = (lam >= lo) & (lam < hi)
        if m.sum() < 3:
            continue
        s = stack(img, m)
        ref = np.nanmedian((s / SS)[SS > 20 * mad(SS)])
        ex = s - ref * SS
        v = float(np.nanmax(ex[y - 2:y + 3, x - 2:x + 3]))
        out.append({"lam_um": [lo, hi], "n": int(m.sum()), "excess_mjy_sr": v, "snr": float(v / mad(ex))})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--min-excess-frac", type=float, default=0.5, help="share of the long-wavelength signal that is red excess")
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    img, mjd = z["image"], z["mjd"]
    lam = np.nanmean(z["lam"], axis=(1, 2))
    w = WCS(fits.Header.fromstring(str(z["wcs"]), sep="\n"))

    L, S = (lam >= LONG[0]) & (lam <= LONG[1]), lam < SHORT
    SL, SS = stack(img, L), stack(img, S)
    nL, nS = mad(SL), mad(SS)
    c = float(np.nanmedian((SL / SS)[SS > 20 * nS]))
    R = SL - c * SS
    Rs = uniform_filter(np.nan_to_num(R), 3) * 3 / mad(R)
    SLs = uniform_filter(np.nan_to_num(SL), 3) * 3 / nL
    SSs = uniform_filter(np.nan_to_num(SS), 3) * 3 / nS
    pk = (Rs == maximum_filter(Rs, 5)) & (Rs > 6)
    pk[:5] = pk[-5:] = False
    pk[:, :5] = pk[:, -5:] = False
    ys, xs = np.nonzero(pk)
    colour = np.where(SSs[ys, xs] > 3, SLs[ys, xs] / np.maximum(SSs[ys, xs], 1e-3) * nL / nS / c, np.inf)
    keep = Rs[ys, xs] / np.maximum(SLs[ys, xs], 1e-3) >= a.min_excess_frac
    ys, xs = ys[keep], xs[keep]
    order = np.argsort(-Rs[ys, xs])[:a.top]
    print(f"{a.name}: {len(img)} frames, typical star colour {c:.3f}, {keep.sum()} sources whose long-wavelength light is mostly red excess")
    found = []
    for i in order:
        x, y = int(xs[i]), int(ys[i])
        ra, dec = w.pixel_to_world_values(x, y)
        try:
            mo = motion(img, lam, mjd, SS, c, x, y, w)
        except Exception:
            mo = None
        spec = excess_spectrum(img, lam, SS, x, y)
        snr = {tuple(b["lam_um"]): b["snr"] for b in spec}
        y_like = snr.get((2.5, 3.5), 0) < 3 and min(snr.get((4.0, 4.4), 0), snr.get((4.4, 4.7), 0)) > 5
        found.append({"x": x, "y": y, "ra": float(ra), "dec": float(dec), "excess_snr": float(Rs[y, x]),
                      "colour_vs_stars": float(colour[keep][i]), "y_dwarf_like": bool(y_like), "motion": mo, "spectrum": spec})
        m = (f"moves {mo['shift_px']:.2f} px in {mo['years']:.2f} yr -> ({mo['pm_ra_arcsec_yr']:+.1f}, {mo['pm_dec_arcsec_yr']:+.1f}) +- {mo['err_arcsec_yr']:.1f}\"/yr, "
             f"random splits median {mo['null_median_px']:.2f} max {mo['null_max_px']:.2f} px, p = {mo['p_null']:.3f}") if mo else "motion fit failed"
        print(f"  ({x},{y}) RA {float(ra):.5f} Dec {float(dec):+.5f} | excess {Rs[y, x]:.1f} sigma | {'Y-DWARF-LIKE SPECTRUM | ' if y_like else ''}{m}")
        print("      excess sigma by band: " + ", ".join(f"{s['lam_um'][0]}-{s['lam_um'][1]}: {s['snr']:.1f}" for s in spec))
    (tile / "redsearch.json").write_text(json.dumps({"tile": a.name, "star_colour": c, "sources": found}, indent=1))


if __name__ == "__main__":
    main()
