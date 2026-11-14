"""Find candidates in the z-score cube: static outliers (variables) and linear movers."""
from __future__ import annotations

import numpy as np
from scipy.ndimage import maximum_filter, uniform_filter


def detections(z: np.ndarray, sigma: np.ndarray, thresh: float = 6.0, margin: int = 3) -> np.ndarray:
    """Peaks of the 3x3 matched-filter z map. Returns rows [frame, x, y, snr]."""
    zs = uniform_filter(np.nan_to_num(z), size=(1, 3, 3)) * 3.0
    unreliable = maximum_filter(sigma > 2 * np.nanmedian(sigma), size=3)
    pk = (zs == maximum_filter(zs, size=(1, 3, 3))) & (zs > thresh) & ~unreliable[None]
    pk[:, :margin] = pk[:, -margin:] = False
    pk[:, :, :margin] = pk[:, :, -margin:] = False
    f, y, x = np.nonzero(pk)
    return np.column_stack([f, x, y, zs[pk]])


def static_clusters(det: np.ndarray, radius: float = 1.5, min_frames: int = 4) -> tuple[list[dict], np.ndarray]:
    centers: list[list] = []
    label = np.full(len(det), -1)
    for i, (f, x, y, s) in enumerate(det):
        for c, (cx, cy, _) in enumerate(centers):
            if np.hypot(x - cx, y - cy) <= radius:
                label[i] = c
                break
        else:
            centers.append([x, y, 0])
            label[i] = len(centers) - 1
    out, used = [], np.zeros(len(det), bool)
    for c in range(len(centers)):
        m = label == c
        if len(set(det[m, 0].astype(int))) < min_frames:
            continue
        used |= m
        w = det[m]
        out.append({"x": float(w[:, 1].mean()), "y": float(w[:, 2].mean()), "frame": int(np.median(w[:, 0])),
                    "snr": float(w[:, 3].max()), "kind": "static",
                    "track": [[int(f), round(float(x), 2), round(float(y), 2)] for f, x, y, _ in w]})
    return out, used


def _fit_line(t, xy):
    A = np.column_stack([np.ones_like(t), t - t.mean()])
    coef, *_ = np.linalg.lstsq(A, xy, rcond=None)
    return coef, t.mean()


def linear_tracks(det: np.ndarray, mjd: np.ndarray, vmin: float = 0.3, vmax: float = 30.0, tol: float = 1.4,
                  window: float = 10.0, min_frames: int = 5) -> list[dict]:
    """Straight-line movers. Each pair of detections proposes a line, which is refined by least squares."""
    det = det[np.argsort(mjd[det[:, 0].astype(int)])]
    t = mjd[det[:, 0].astype(int)]
    alive = np.ones(len(det), bool)
    out = []
    while True:
        best = None
        idx = np.nonzero(alive)[0]
        for ai in idx:
            dt = t[idx] - t[ai]
            for bi in idx[(dt >= 1.0) & (dt <= window / 2)]:
                v = (det[bi, 1:3] - det[ai, 1:3]) / (t[bi] - t[ai])
                if not vmin <= np.hypot(*v) <= vmax:
                    continue
                sel = idx[np.abs(t[idx] - t[ai]) <= window]
                pred = det[ai, 1:3][None] + v[None] * (t[sel] - t[ai])[:, None]
                m = np.hypot(*(det[sel, 1:3] - pred).T) <= 3.0
                for _ in range(2):
                    if len(set(det[sel[m], 0].astype(int))) < min_frames:
                        break
                    coef, tm = _fit_line(t[sel[m]], det[sel[m], 1:3])
                    pred = coef[0][None] + coef[1][None] * (t[sel] - tm)[:, None]
                    m = np.hypot(*(det[sel, 1:3] - pred).T) <= tol
                nf = len(set(det[sel[m], 0].astype(int)))
                if nf >= min_frames and np.hypot(*coef[1]) >= vmin and (best is None or nf > best[0]):
                    best = (nf, sel[m])
        if best is None:
            break
        m = best[1]
        alive[m] = False
        w = det[m]
        k = int(np.argmax(w[:, 3]))
        out.append({"x": float(w[k, 1]), "y": float(w[k, 2]), "frame": int(w[k, 0]), "snr": float(w[:, 3].max()),
                    "kind": "moving",
                    "track": [[int(f), round(float(x), 2), round(float(y), 2)] for f, x, y, _ in w[np.argsort(w[:, 0])]]})
    return out, det[alive]


def find_candidates(z: np.ndarray, sigma: np.ndarray, mjd: np.ndarray, max_static: int = 15) -> list[dict]:
    det = detections(z, sigma)
    if len(det) == 0:
        return []
    moving, rest = linear_tracks(det, mjd)
    static, _ = static_clusters(rest) if len(rest) else ([], None)
    static.sort(key=lambda c: -c["snr"] * np.sqrt(len(c["track"])))
    return static[:max_static] + moving
