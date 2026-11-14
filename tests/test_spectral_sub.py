"""Spectral subtraction on a synthetic sky with a known moving object.

    python tests/test_spectral_sub.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.spectral_sub import diagnostics, fit_static  # noqa: E402


def make_sky(seed=0, N=300, H=32, W=32):
    rng = np.random.default_rng(seed)
    # frames: 6 "detectors" each covering its own band, like SPHEREx
    bands = [(0.75, 1.1), (1.1, 1.63), (1.63, 2.42), (2.42, 3.82), (3.82, 4.42), (4.42, 5.0)]
    lam_f = np.array([rng.uniform(*bands[i % 6]) for i in range(N)])
    lam = lam_f[:, None, None] * (1 + 0.004 * (np.arange(W)[None, None, :] - W / 2) / W) * np.ones((N, H, W))
    yy, xx = np.indices((H, W))
    sky = np.zeros((N, H, W))
    for _ in range(25):                       # static sources, each with its own colour
        y0, x0 = rng.uniform(2, H - 2), rng.uniform(2, W - 2)
        amp, idx = rng.uniform(5, 60), rng.uniform(-3, 1)
        prof = np.exp(-((yy - y0) ** 2 + (xx - x0) ** 2) / (2 * 1.1 ** 2))
        sky += amp * (lam / 2.0) ** idx * prof[None]
    sky += 0.5 * (lam / 1.0) ** -1.5          # smooth background
    noise = 0.3
    img = sky + rng.normal(0, noise, sky.shape)
    # moving object: crosses the field, 1.2 px per frame-step, flux ~ 8 sigma, flat spectrum
    truth = []
    ys = np.linspace(4, H - 5, N)
    xs = np.linspace(3, W - 4, N)
    order = rng.permutation(N)                # observation order is unrelated to wavelength
    for j, i in enumerate(order[:60]):        # visible in 60 frames
        y0, x0 = ys[j], xs[j]
        prof = np.exp(-((yy - y0) ** 2 + (xx - x0) ** 2) / (2 * 1.1 ** 2))
        img[i] += 8 * noise * 2.5 * prof
        truth.append((i, int(round(y0)), int(round(x0))))
    # random masked pixels
    img[rng.random(img.shape) < 0.03] = np.nan
    return img, lam, truth


def main() -> int:
    img, lam, truth = make_sky()
    res = fit_static(img, lam)
    d = diagnostics(res, img)
    print({k: round(v, 3) for k, v in d.items()})

    ok = True
    def check(name, cond):
        nonlocal ok
        print(("PASS " if cond else "FAIL ") + name)
        ok &= bool(cond)

    check("static structure removed (bright-pixel rms drops > 5x)", d["bright_pixels_rms_reduction_x"] > 5)
    check("residual noise is ~unit variance (0.8 < robust std of z < 1.3)", 0.8 < d["z_robust_std"] < 1.3)

    # mover recovered: z at its true position in its frames
    zs = np.array([res.z[i, y, x] for i, y, x in truth])
    zs = zs[np.isfinite(zs)]                      # ~3% of positions land on masked pixels
    check(f"mover recovered (median z at true position = {np.median(zs):.1f} > 5)", np.median(zs) > 5)
    check(f"mover recovered in most frames ({(zs > 4).mean():.0%} > 85%)", (zs > 4).mean() > 0.85)

    # no residual at static sources: look only at pixels never visited by the mover
    visited = np.zeros(img.shape[1:], bool)
    for _, y, x in truth:
        visited[max(0, y - 3):y + 4, max(0, x - 3):x + 4] = True
    zq = res.z[:, ~visited]
    zq = zq[np.isfinite(zq)]
    check(f"no false detections away from the mover (frac |z|>5 = {(np.abs(zq) > 5).mean():.2e} < 1e-3)", (np.abs(zq) > 5).mean() < 1e-3)

    # the mover must not have been absorbed into the model: model near it stays smooth/static
    i, y, x = truth[len(truth) // 2]
    check("mover not absorbed by the fit (clipped out of the model)", not res.used[i, y, x])
    print("ALL PASS" if ok else "SOME FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
