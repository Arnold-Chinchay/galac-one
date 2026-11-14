"""Spectral subtraction: fit a static spectrum per pixel across frames and subtract it.

    python -m pipeline.spectral_sub --name wise0855
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

import numpy as np

from .irsa import CACHE


@dataclass
class SubResult:
    model: np.ndarray
    resid: np.ndarray
    z: np.ndarray
    sigma: np.ndarray
    used: np.ndarray
    frame_scale: np.ndarray | None = None


def hat_basis(lam: np.ndarray, nodes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Left node index and right-node weight for linear interpolation in log(lambda)."""
    x = np.log(lam)
    k = np.clip(np.searchsorted(nodes, x) - 1, 0, len(nodes) - 2)
    t = np.clip((x - nodes[k]) / (nodes[k + 1] - nodes[k]), 0.0, 1.0)
    return k, t


def fit_static(image: np.ndarray, lam: np.ndarray, n_nodes: int = 24, smooth: float = 1e-2,
               clip: float = 4.0, n_iter: int = 5) -> SubResult:
    """Robust per-pixel static spectrum. image and lam are (N,H,W); NaN in image means masked."""
    N, H, W = image.shape
    valid0 = np.isfinite(image) & np.isfinite(lam) & (lam > 0)
    lam_ok = np.where(valid0, lam, np.nanmedian(lam))
    lo, hi = np.log(np.nanmin(lam[valid0])), np.log(np.nanmax(lam[valid0]))
    nodes = np.linspace(lo, hi, n_nodes)
    k, t = hat_basis(lam_ok, nodes)

    D = np.zeros((n_nodes - 2, n_nodes))
    for i in range(n_nodes - 2):
        D[i, i:i + 3] = [1, -2, 1]
    P = D.T @ D

    y = np.where(valid0, image, 0.0).astype(np.float64)
    keep = valid0.copy()
    sigma = np.full((H, W), np.nan)
    model = np.zeros_like(y)

    s_f = np.ones(N)
    for it in range(n_iter):
        w = keep / (s_f[:, None, None] ** 2)
        A = np.zeros((H, W, n_nodes, n_nodes))
        b = np.zeros((H, W, n_nodes))
        for i in range(N):
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
        for _ in range(2):
            rn = r / s_f[:, None, None]
            sigma = np.maximum(1.4826 * np.nanmedian(np.abs(rn - np.nanmedian(rn, axis=0)), axis=0), 1e-6)
            s_f = 1.4826 * np.nanmedian(np.abs(r / sigma[None]), axis=(1, 2))
            s_f = np.where(np.isfinite(s_f) & (s_f > 0), s_f, np.nanmedian(s_f))
            s_f = s_f / np.nanmedian(s_f)
        keep = valid0 & (np.abs(r) < clip * sigma[None] * s_f[:, None, None])

    resid = np.where(valid0, y - model, np.nan)
    z = resid / (sigma[None] * s_f[:, None, None])
    return SubResult(model=model.astype(np.float32), resid=resid.astype(np.float32), z=z.astype(np.float32),
                     sigma=sigma.astype(np.float32), used=keep, frame_scale=s_f.astype(np.float32))


def diagnostics(res: SubResult, image: np.ndarray) -> dict:
    """Summary statistics of the fit."""
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


def bad_frame_mask(res: SubResult, det: np.ndarray, thresh: float = 0.15, max_rel_scale: float = 3.0) -> np.ndarray:
    """Frames much noisier than the median of their own detector, or mostly far from the model."""
    frac = np.array([np.nanmean(np.abs(res.z[i]) > 5) if np.isfinite(res.z[i]).any() else 1.0 for i in range(len(res.z))])
    noisy = np.zeros(len(res.z), bool)
    if res.frame_scale is not None:
        for d in np.unique(det):
            m = det == d
            noisy[m] = res.frame_scale[m] > max_rel_scale * np.median(res.frame_scale[m])
    return (frac > thresh) | noisy


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--nodes", type=int, default=24)
    ap.add_argument("--clip", type=float, default=4.0)
    ap.add_argument("--bad-frame-frac", type=float, default=0.15,
                    help="drop frames with more than this fraction of pixels beyond 5 sigma, then refit")
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    image, lam, mjd, det = z["image"], z["lam"], z["mjd"], z["det"]
    n_in = len(image)

    res = fit_static(image, lam, n_nodes=a.nodes, clip=a.clip)
    bad = bad_frame_mask(res, det, a.bad_frame_frac)
    d0 = diagnostics(res, image)
    if bad.any():
        print(f"  pass 1: {int(bad.sum())}/{n_in} broken frames dropped (det {sorted(set(det[bad].tolist()))}, "
              f"lam {np.nanmean(lam[bad], axis=(1, 2)).round(2).tolist()}), refitting")
        keep = ~bad
        image, lam, mjd, det = image[keep], lam[keep], mjd[keep], det[keep]
        res = fit_static(image, lam, n_nodes=a.nodes, clip=a.clip)
    else:
        keep = np.ones(n_in, bool)
    np.savez_compressed(tile / "residuals.npz", resid=res.resid, z=res.z, sigma=res.sigma, model=res.model,
                        mjd=mjd, det=det, lam=np.nanmean(lam, axis=(1, 2)), kept_index=np.where(keep)[0])
    d1 = diagnostics(res, image)
    print(f"  {'metric':32s} {'pass 1':>10s} {'final':>10s}")
    for k in d1:
        print(f"  {k:32s} {d0[k]:10.4g} {d1[k]:10.4g}")
    print("  tail fraction |z|>5 by detector (final):",
          {f"D{d}": round(float((np.abs(res.z[det == d][np.isfinite(res.z[det == d])]) > 5).mean()), 4) for d in sorted(set(det.tolist()))})
    print("->", tile / "residuals.npz", f"({len(image)}/{n_in} frames kept)")


if __name__ == "__main__":
    main()
