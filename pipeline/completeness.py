"""Injection-recovery: fraction of synthetic movers the pipeline finds, by signal-to-noise.

    python -m pipeline.completeness --name rdra --trials 6 --per-trial 8
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from .detect import find_candidates
from .irsa import CACHE
from .make_tile import inject_movers, make_injections
from .spectral_sub import bad_frame_mask, fit_with_gain


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--trials", type=int, default=6)
    ap.add_argument("--per-trial", type=int, default=8)
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    image0, lam, mjd, det = z["image"].astype(np.float64), z["lam"], z["mjd"], z["det"]
    res = fit_with_gain(image0, lam, det)
    keep = ~bad_frame_mask(res, det)
    image0, lam, mjd, det = image0[keep], lam[keep], mjd[keep], det[keep]
    sigma, fscale = res.sigma, res.frame_scale[keep]
    base = find_candidates(fit_with_gain(image0, lam, det).z, sigma, mjd)

    rows, false_pos = [], []
    for trial in range(a.trials):
        rng = np.random.default_rng(100 + trial)
        inj = make_injections(rng, a.per_trial, mjd, image0.shape, sigma, snr_range=(3.0, 14.0))
        img = image0.copy()
        inject_movers(img, inj, sigma, fscale)
        r = fit_with_gain(img, lam, det)
        found = find_candidates(r.z, r.sigma, mjd)
        matched = set()
        for c in found:
            for k, s in enumerate(inj):
                fr = set(s["frames"].tolist())
                hits = [np.hypot(x - s["x"][f], y - s["y"][f]) <= 1.5 for f, x, y in c["track"] if f in fr]
                if hits and sum(hits) / len(c["track"]) > 0.5:
                    matched.add(k)
        for k, s in enumerate(inj):
            rows.append((s["snr"], k in matched, np.hypot(s["vx"], s["vy"])))
        false_pos.append(sum(1 for c in found if c["kind"] == "moving") - len(matched))
        print(f"trial {trial}: recovered {len(matched)}/{len(inj)}")
    rows = np.array(rows, dtype=float)
    print(f"\nbaseline candidates without injections: {len(base)} ({sum(c['kind'] == 'moving' for c in base)} moving)")
    print("signal-to-noise per frame | injected | recovered | completeness")
    table = []
    for lo, hi in [(3, 5), (5, 7), (7, 9), (9, 11), (11, 14)]:
        m = (rows[:, 0] >= lo) & (rows[:, 0] < hi)
        if m.sum():
            c = rows[m, 1].mean()
            table.append({"snr": [lo, hi], "n": int(m.sum()), "completeness": float(c)})
            print(f"  {lo:2d}-{hi:<2d}                    | {int(m.sum()):8d} | {int(rows[m, 1].sum()):9d} | {c:6.0%}")
    print(f"extra moving candidates per trial (not injected): median {np.median(false_pos):.0f}")
    (tile / "completeness.json").write_text(json.dumps({"bins": table, "trials": a.trials, "extra_moving_per_trial": false_pos}))


if __name__ == "__main__":
    main()
