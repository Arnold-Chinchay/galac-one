"""Light curve of a source from all frames, normalising each frame by the source's own static spectrum.

    python -m pipeline.lightcurve --name rdra --target rdra
"""
from __future__ import annotations

import argparse
import json

import numpy as np
from astropy.io import fits
from astropy.timeseries import LombScargle
from astropy.wcs import WCS

from .irsa import CACHE
from .spectral_sub import bad_frame_mask, fit_with_gain
from .targets import TARGETS, position_at


def target_pixel(z, name):
    w = WCS(fits.Header.fromstring(str(z["wcs"]), sep="\n"))
    ra, dec = position_at(name, float(np.median(z["mjd"])))
    x, y = w.world_to_pixel_values(float(ra), float(dec))
    return float(x), float(y)


def light_curve(image, lam, mjd, det, x, y, r_in=0.0, r_out=1.5, r_ex=None):
    H, W = image.shape[1:]
    yy, xx = np.indices((H, W))
    d2 = (xx - x) ** 2 + (yy - y) ** 2
    exclude = d2 <= (r_ex or r_out + 3) ** 2
    res = fit_with_gain(image, lam, det, exclude=exclude)
    keep = ~bad_frame_mask(res, det)
    ap = (d2 >= r_in ** 2) & (d2 <= r_out ** 2)
    data = image[:, ap] / res.gain[:, None]
    model = res.model[:, ap] / res.gain[:, None]
    ok_pix = np.isfinite(data) & np.isfinite(model)
    flux = np.where(ok_pix, data, 0).sum(1)
    ref = np.where(ok_pix, model, 0).sum(1)
    frac = ok_pix.mean(1)
    rel = np.where((frac > 0.4) & (ref > 0) & keep, flux / np.where(ref > 0, ref, 1), np.nan)
    return rel, frac, res


def period(mjd, rel, pmin=30.0, pmax=700.0):
    ok = np.isfinite(rel)
    if ok.sum() < 20:
        return None
    freq = np.linspace(1 / pmax, 1 / pmin, 20000)
    ls = LombScargle(mjd[ok], rel[ok])
    power = ls.power(freq)
    best = freq[np.argmax(power)]
    return {"period_d": float(1 / best), "power": float(power.max()), "fap": float(ls.false_alarm_probability(power.max()))}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--target", required=True, choices=sorted(TARGETS))
    ap.add_argument("--annulus", type=float, nargs=2, metavar=("R_IN", "R_OUT"), help="use a ring of the PSF (saturated cores)")
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    image, lam, mjd, det = z["image"].astype(np.float64), z["lam"], z["mjd"], z["det"]
    x, y = target_pixel(z, a.target)
    r_in, r_out = a.annulus if a.annulus else (0.0, 1.5)
    rel, frac, res = light_curve(image, lam, mjd, det, x, y, r_in, r_out)
    ok = np.isfinite(rel)
    print(f"{TARGETS[a.target]['label']}: pixel ({x:.1f},{y:.1f}) | usable frames {ok.sum()}/{len(rel)} "
          f"(aperture coverage median {np.median(frac):.2f})")
    if ok.sum():
        q = np.nanpercentile(rel, [5, 50, 95])
        print(f"  relative flux p5/p50/p95 = {q[0]:.2f} / {q[1]:.2f} / {q[2]:.2f}  -> amplitude ~{2.5 * np.log10(q[2] / max(q[0], 1e-3)):.2f} mag")
        for dd in sorted(set(det[ok].tolist())):
            m = ok & (det == dd)
            print(f"  D{dd}: n={m.sum():3d}  median {np.nanmedian(rel[m]):.2f}")
    p = period(mjd, rel)
    if p:
        print(f"  Lomb-Scargle best period {p['period_d']:.1f} d (power {p['power']:.2f}, false-alarm prob {p['fap']:.1e})")
    out = {"target": a.target, "label": TARGETS[a.target]["label"], "x": x, "y": y,
           "points": [[float(m), float(r), int(d)] for m, r, d in zip(mjd[ok], rel[ok], det[ok])], "period": p}
    (tile / "lightcurve.json").write_text(json.dumps(out))


if __name__ == "__main__":
    main()
