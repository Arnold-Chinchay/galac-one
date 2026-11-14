"""Stage 3: spectral subtraction (docs/10, innovation 1).

SPHEREx sees every sky position at a different wavelength in every frame, so subtracting two frames
leaves residuals from every star. Instead, for EVERY pixel we fit the static spectrum
    s_p(lambda)
through all frames that cover it (robustly: outliers are clipped out of the fit, so a mover or a
variable cannot hide inside the model), then subtract the model at each frame's own wavelength.
What is left is what changed: movers, variables, artifacts.

Model: piecewise-linear ("hat") basis in log(lambda) with a second-difference smoothness penalty,
solved for all pixels at once with batched normal equations.

  python -m pipeline.spectral_sub --name wise0855
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

import numpy as np

from .irsa import CACHE


@dataclass
class SubResult:
    model: np.ndarray    # (N,H,W) static spectrum evaluated at each frame's wavelength
    resid: np.ndarray    # (N,H,W) image - model
    z: np.ndarray        # (N,H,W) resid / robust per-pixel scatter
    sigma: np.ndarray    # (H,W)   robust per-pixel scatter of the residuals
    used: np.ndarray     # (N,H,W) bool, frames that were kept in the fit (not clipped)


def hat_basis(lam: np.ndarray, nodes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For each lam return (left node index, weight of the right node) for linear interpolation in log-lambda."""
    x = np.log(lam)
    k = np.clip(np.searchsorted(nodes, x) - 1, 0, len(nodes) - 2)
    t = np.clip((x - nodes[k]) / (nodes[k + 1] - nodes[k]), 0.0, 1.0)
    return k, t


def fit_static(image: np.ndarray, lam: np.ndarray, n_nodes: int = 24, smooth: float = 1e-2,
               clip: float = 4.0, n_iter: int = 5) -> SubResult:
    """image, lam: (N,H,W); NaN in image = masked. Returns the robust static-spectrum fit per pixel."""
    N, H, W = image.shape
    valid0 = np.isfinite(image) & np.isfinite(lam) & (lam > 0)
    lam_ok = np.where(valid0, lam, np.nanmedian(lam))
    lo, hi = np.log(np.nanmin(lam[valid0])), np.log(np.nanmax(lam[valid0]))
    nodes = np.linspace(lo, hi, n_nodes)
    k, t = hat_basis(lam_ok, nodes)                       # (N,H,W)

    # second-difference penalty (same for every pixel), scaled per pixel by its weight sum
    D = np.zeros((n_nodes - 2, n_nodes))
    for i in range(n_nodes - 2):
        D[i, i:i + 3] = [1, -2, 1]
    P = D.T @ D

    y = np.where(valid0, image, 0.0).astype(np.float64)
    keep = valid0.copy()
    sigma = np.full((H, W), np.nan)
    model = np.zeros_like(y)

    for it in range(n_iter):
        w = keep.astype(np.float64)
        A = np.zeros((H, W, n_nodes, n_nodes))
        b = np.zeros((H, W, n_nodes))
        for i in range(N):                                 # banded accumulation, 2 nonzeros per frame
            wi, yi, ki, ti = w[i], y[i], k[i], t[i]
            c0, c1 = 1 - ti, ti
            hh, ww = np.indices((H, W))
            for (ja, ca) in ((ki, c0), (ki + 1, c1)):
                b[hh, ww, ja] += wi * ca * yi
                for (jb, cb) in ((ki, c0), (ki + 1, c1)):
                    A[hh, ww, ja, jb] += wi * ca * cb
        scale = np.maximum(w.sum(0), 1.0)[..., None, None] / n_nodes
        A = A + smooth * scale * P + 1e-9 * np.eye(n_nodes)
        coef = np.linalg.solve(A, b[..., None])[..., 0]    # (H,W,K)
        hh, ww = np.indices((H, W))
        model = (coef[hh[None], ww[None], k] * (1 - t) + coef[hh[None], ww[None], k + 1] * t)
        r = np.where(valid0, y - model, np.nan)
        sigma = 1.4826 * np.nanmedian(np.abs(r - np.nanmedian(r, axis=0)), axis=0)
        sigma = np.maximum(sigma, 1e-6)
        keep = valid0 & (np.abs(r) < clip * sigma[None])

    resid = np.where(valid0, y - model, np.nan)
    return SubResult(model=model.astype(np.float32), resid=resid.astype(np.float32),
                     z=(resid / sigma[None]).astype(np.float32), sigma=sigma.astype(np.float32), used=keep)


def diagnostics(res: SubResult, image: np.ndarray) -> dict:
    """How much of the frame-to-frame variation is explained by the static spectra."""
    raw = np.nanstd(image, axis=0)
    after = np.nanstd(res.resid, axis=0)
    bright = raw > np.nanpercentile(raw, 75)
    z = res.z[np.isfinite(res.z)]
    return {
        "rms_before_median": float(np.nanmedian(raw)),
        "rms_after_median": float(np.nanmedian(after)),
        "bright_pixels_rms_reduction_x": float(np.nanmedian(raw[bright] / after[bright])),
        "z_robust_std": float(1.4826 * np.median(np.abs(z - np.median(z)))),
        "frac_z_gt_5": float((np.abs(z) > 5).mean()),
        "frac_clipped": float(1 - res.used.sum() / max(np.isfinite(image).sum(), 1)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--nodes", type=int, default=24)
    ap.add_argument("--clip", type=float, default=4.0)
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    res = fit_static(z["image"], z["lam"], n_nodes=a.nodes, clip=a.clip)
    np.savez_compressed(tile / "residuals.npz", resid=res.resid, z=res.z, sigma=res.sigma, model=res.model,
                        mjd=z["mjd"], det=z["det"], lam=z["lam"].mean(axis=(1, 2)))
    for k, v in diagnostics(res, z["image"]).items():
        print(f"  {k:32s} {v:.4g}")
    print("->", tile / "residuals.npz")


if __name__ == "__main__":
    main()
