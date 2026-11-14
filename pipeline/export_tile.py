"""Stage 4: write a tile in the public data contract (docs/13) that the web consumes.

Files in <out>/ (all little-endian):
  manifest.json       tile metadata + array shape
  frames.json         per-frame info, sorted by time
  residuals.f16.bin   float16 (N,H,W)  z-score of the spectral-subtraction residual (NaN = masked)
  science.f16.bin     float16 (N,H,W)  ZODI-subtracted image, MJy/sr (NaN = masked)
  candidates.json     public candidate list (NEVER contains injection truth)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

CONTRACT_VERSION = 1


def _f16(a: np.ndarray) -> bytes:
    return np.clip(a, -60000, 60000).astype("<f2").tobytes()


def write_tile(out: Path, tile_id: str, *, ra: float, dec: float, fov_deg: float, pix_arcsec: float,
               image: np.ndarray, z: np.ndarray, mjd: np.ndarray, det: np.ndarray, lam_um: np.ndarray,
               bad_frac: np.ndarray | None = None, obsid: list[str] | None = None,
               candidates: list[dict] | None = None, release: str = "DR1", label: str = "") -> dict:
    N, H, W = image.shape
    assert z.shape == image.shape and len(mjd) == len(det) == len(lam_um) == N
    out.mkdir(parents=True, exist_ok=True)
    order = np.argsort(mjd)
    image, z = image[order], z[order]
    mjd, det, lam_um = np.asarray(mjd)[order], np.asarray(det)[order], np.asarray(lam_um)[order]
    if bad_frac is not None:
        bad_frac = np.asarray(bad_frac)[order]
    if obsid is not None:
        obsid = [obsid[i] for i in order]

    (out / "residuals.f16.bin").write_bytes(_f16(z))
    (out / "science.f16.bin").write_bytes(_f16(image))
    frames = [{"i": int(i), "mjd": float(mjd[i]), "det": int(det[i]), "lam_um": round(float(lam_um[i]), 5),
               "bad_frac": None if bad_frac is None else round(float(bad_frac[i]), 4),
               "obsid": None if obsid is None else obsid[i]} for i in range(N)]
    (out / "frames.json").write_text(json.dumps(frames))
    (out / "candidates.json").write_text(json.dumps(candidates or []))
    manifest = {
        "contract_version": CONTRACT_VERSION, "id": tile_id, "label": label, "release": release,
        "ra": ra, "dec": dec, "fov_deg": fov_deg, "pix_arcsec": pix_arcsec,
        "shape": {"n_frames": N, "height": H, "width": W},
        "dtype": "float16-le",
        "layout": "index = (frame*H + y)*W + x. y=0 is the SOUTH edge (flip vertically to show north up); x=0 is the EAST edge (RA grows toward x=0).",
        "mjd_range": [float(mjd.min()), float(mjd.max())], "lam_range_um": [float(lam_um.min()), float(lam_um.max())],
        "files": ["frames.json", "residuals.f16.bin", "science.f16.bin", "candidates.json"],
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest
