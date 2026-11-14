"""Build a SYNTHETIC tile in the real data contract so the front-end team can work today.

  python -m pipeline.make_mock_tile            # writes web/public/mock-tile/ and tools/mock_seed.sql

The sky is fake but the pipeline is real: it runs the actual spectral subtraction. It contains
  - 25 static sources with different colours (must vanish in the residuals)
  - mover-1 (bright) and mover-2 (faint): hidden synthetic objects ("injections", truth only in the SQL seed)
  - a variable star (sinusoidal in time) and a one-frame artifact: NOT injections
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .export_tile import write_tile
from .spectral_sub import diagnostics, fit_static

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "mock-tile"
SEED = ROOT / "tools" / "mock_seed.sql"
N, H, W = 240, 40, 40
NOISE = 0.3


def main() -> None:
    rng = np.random.default_rng(7)
    bands = [(0.75, 1.1), (1.1, 1.63), (1.63, 2.42), (2.42, 3.82), (3.82, 4.42), (4.42, 5.0)]
    det = np.array([i % 6 + 1 for i in range(N)])
    lam_f = np.array([rng.uniform(*bands[d - 1]) for d in det])
    lam = lam_f[:, None, None] * (1 + 0.004 * (np.arange(W)[None, None, :] - W / 2) / W) * np.ones((N, H, W))
    yy, xx = np.indices((H, W))
    sky = np.zeros((N, H, W))
    for _ in range(25):
        y0, x0 = rng.uniform(2, H - 2), rng.uniform(2, W - 2)
        amp, idx = rng.uniform(5, 60), rng.uniform(-3, 1)
        sky += amp * (lam / 2.0) ** idx * np.exp(-((yy - y0) ** 2 + (xx - x0) ** 2) / (2 * 1.1 ** 2))[None]
    sky += 0.5 * (lam / 1.0) ** -1.5
    img = sky + rng.normal(0, NOISE, sky.shape)

    def blob(y0, x0):
        return np.exp(-((yy - y0) ** 2 + (xx - x0) ** 2) / (2 * 1.1 ** 2))

    t = np.arange(N)
    tracks, truth = {}, []
    # mover-1: bright, crosses the whole field smoothly; mover-2: faint and slower
    for cid, (y_a, x_a, y_b, x_b, snr, v0, v1) in {
        "mock-m1": (5, 4, 33, 35, 7.0, 0, N),
        "mock-m2": (30, 6, 12, 26, 4.5, 20, 200),
    }.items():
        tr = []
        for i in range(v0, v1):
            f = (i - v0) / (v1 - v0 - 1)
            y0, x0 = y_a + f * (y_b - y_a), x_a + f * (x_b - x_a)
            img[i] += snr * NOISE * 2.5 * blob(y0, x0)
            tr.append([int(i), round(float(x0), 2), round(float(y0), 2)])
        tracks[cid] = tr
        truth.append((cid, tr[0][1], tr[0][2], (tr[-1][1] - tr[0][1]) / len(tr), (tr[-1][2] - tr[0][2]) / len(tr), snr))
    # variable star (not an injection): fixed position, brightness oscillates in time
    img += (4 * NOISE * 2.5 * (1 + np.sin(2 * np.pi * t / 60.0)) / 2)[:, None, None] * blob(20, 28)[None]
    tracks["mock-v1"] = [[int(i), 28.0, 20.0] for i in range(N)]
    # one-frame artifact (cosmic-ray-like)
    img[97] += 9 * NOISE * 2.5 * blob(11, 9)
    tracks["mock-a1"] = [[97, 9.0, 11.0]]
    img[rng.random(img.shape) < 0.03] = np.nan

    res = fit_static(img, lam)
    print({k: round(v, 3) for k, v in diagnostics(res, img).items()})

    mjd = 61000.0 + t * 0.05
    meta = {
        "mock-m1": ("moving", 0.97), "mock-m2": ("moving", 0.62),
        "mock-v1": ("variable", 0.88), "mock-a1": ("artifact", 0.41),
    }
    cands = []
    for cid, tr in tracks.items():
        mid = tr[len(tr) // 2]
        cands.append({"id": cid, "x": mid[1], "y": mid[2], "frame": mid[0], "kind_hint": meta[cid][0],
                      "score": meta[cid][1], "track": tr})
    write_tile(OUT, "mock", ra=150.0, dec=2.2, fov_deg=H * 6.15 / 3600, pix_arcsec=6.15, image=img.astype(np.float32),
               z=res.z, mjd=mjd, det=det, lam_um=lam.mean(axis=(1, 2)), candidates=cands, release="MOCK",
               label="Synthetic demo tile (fake sky, real pipeline)")

    # D1 seed: tile, candidates, and the SECRET truth of the two injections
    SEED.parent.mkdir(exist_ok=True)
    sql = ["DELETE FROM votes WHERE candidate_id LIKE 'mock-%';", "DELETE FROM injections WHERE tile_id='mock';",
           "DELETE FROM candidates WHERE tile_id='mock';", "DELETE FROM tiles WHERE id='mock';",
           "INSERT INTO tiles (id,ra,dec,fov_deg,release,status,n_frames,label) VALUES "
           f"('mock',150.0,2.2,{H * 6.15 / 3600:.5f},'MOCK','ready',{N},'Synthetic demo tile (fake sky, real pipeline)');"]
    for c in cands:
        inj = 1 if c["id"] in ("mock-m1", "mock-m2") else 0
        sql.append("INSERT INTO candidates (id,tile_id,x,y,t_ref,kind,score,is_injection,track) VALUES "
                   f"('{c['id']}','mock',{c['x']},{c['y']},{c['frame']},'{c['kind_hint']}',{c['score']},{inj},'{json.dumps(c['track'])}');")
    for cid, x0, y0, vx, vy, snr in truth:
        sql.append("INSERT INTO injections (id,tile_id,candidate_id,x0,y0,vx,vy,mag) VALUES "
                   f"('inj-{cid}','mock','{cid}',{x0},{y0},{vx:.4f},{vy:.4f},{snr});")
    SEED.write_text("\n".join(sql) + "\n")
    size = sum(f.stat().st_size for f in OUT.iterdir()) / 1e6
    print(f"mock tile -> {OUT} ({size:.1f} MB) | seed -> {SEED}")


if __name__ == "__main__":
    main()
