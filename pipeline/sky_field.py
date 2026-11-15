"""Cut a playable field around the most promising red source of a sky-crawler cell.

The crawler throws each cell's frames away once it is stacked; this keeps a small 40x40 time series around the
best red source so people can check it in Spot check and Follow a star, like the challenge fields.
No test objects are injected here: these fields only collect answers.

    python -m pipeline.sky_field --name r6954-c12 --region 6954 --out fields
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from .detect import find_candidates
from .export_tile import write_tile
from .irsa import CACHE
from .region_analysis import rises_to_4_5um
from .spectral_sub import bad_frame_mask, fit_with_gain

PIX = 6.15
SIZE = 40


def best_source(sources: list[dict]) -> dict | None:
    """Cold-dwarf colours first, then red excess rising toward 4.5 um; huge excesses are bright-star leftovers."""
    def rank(s):
        return (0 if s.get("y_dwarf_like") else 1 if rises_to_4_5um(s.get("spectrum", [])) else 9) + (5 if s["excess_snr"] > 150 else 0)
    good = [s for s in sources if rank(s) <= 1]
    return min(good, key=lambda s: (rank(s), -s["excess_snr"])) if good else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="cell tile name in cache/tiles (aligned.npz + redsearch.json)")
    ap.add_argument("--region", required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    src = best_source(json.loads((tile / "redsearch.json").read_text())["sources"])
    if not src:
        print(f"{a.name}: no promising red source, no field")
        return
    z = np.load(tile / "aligned.npz")
    img, lam, mjd, det = z["image"], z["lam"], z["mjd"], z["det"]
    N, H, W = img.shape
    x0 = int(np.clip(src["x"] - SIZE // 2, 0, W - SIZE))
    y0 = int(np.clip(src["y"] - SIZE // 2, 0, H - SIZE))
    image = img[:, y0:y0 + SIZE, x0:x0 + SIZE].astype(np.float64)
    lam = lam[:, y0:y0 + SIZE, x0:x0 + SIZE]
    bad = z["bad_frac"] if "bad_frac" in z.files else np.zeros(N)

    res = fit_with_gain(image, lam, det)
    keep = ~bad_frame_mask(res, det)
    image, lam, mjd, det, bad = image[keep], lam[keep], mjd[keep], det[keep], bad[keep]
    res = fit_with_gain(image, lam, det)

    w = WCS(fits.Header.fromstring(str(z["wcs"]), sep="\n"))
    ra, dec = (float(v) for v in w.pixel_to_world_values(x0 + (SIZE - 1) / 2, y0 + (SIZE - 1) / 2))
    fid = f"sky{a.region}-" + hashlib.sha1(f"{src['ra']:.4f}:{src['dec']:.4f}".encode()).hexdigest()[:6]
    sx, sy = src["x"] - x0, src["y"] - y0
    cands = [{"id": f"{fid}-c0", "x": sx, "y": sy, "frame": len(mjd) // 2, "kind_hint": None, "score": None, "track": None}]
    for k, c in enumerate(find_candidates(res.z, res.sigma, mjd)[:7]):
        mid = c["track"][len(c["track"]) // 2]
        if np.hypot(mid[1] - sx, mid[2] - sy) < 3:
            continue
        cands.append({"id": f"{fid}-c{k + 1}", "x": mid[1], "y": mid[2], "frame": mid[0], "kind_hint": None, "score": None, "track": c["track"]})

    kind = "cold-dwarf colours" if src.get("y_dwarf_like") else "red source"
    label = f"New {kind} · RA {src['ra']:.2f} Dec {src['dec']:+.2f}"
    out = a.out / fid
    write_tile(out, fid, ra=ra, dec=dec, fov_deg=SIZE * PIX / 3600, pix_arcsec=PIX, image=image.astype(np.float32), z=res.z,
               mjd=mjd, det=det, lam_um=np.nanmean(lam, axis=(1, 2)), bad_frac=bad, candidates=cands, release="DR1+QR3", label=label)
    (out / "row.json").write_text(json.dumps({"id": fid, "ra": ra, "dec": dec, "fov_deg": SIZE * PIX / 3600, "release": "DR1+QR3",
                                              "n_frames": int(len(mjd)), "label": label, "region": str(a.region),
                                              "excess_snr": src["excess_snr"], "cold": bool(src.get("y_dwarf_like"))}))
    print(f"{a.name}: field {fid} around RA {src['ra']:.4f} Dec {src['dec']:+.4f} ({kind}, {src['excess_snr']:.0f} sigma), "
          f"{len(mjd)} frames, {len(cands)} spots")


if __name__ == "__main__":
    main()
