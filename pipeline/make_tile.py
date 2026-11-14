"""Build a public tile from an aligned field: inject hidden test objects, fit, detect, export.

    python -m pipeline.make_tile --name rdra --label "R Draconis field"

Writes cache/tiles/<name>/export/ (tile files) and tools/real_<name>_seed.sql (D1 rows, including the
injection truth; the file is git-ignored and must never be published).
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from .detect import detections, find_candidates
from .export_tile import write_tile
from .irsa import CACHE
from .spectral_sub import bad_frame_mask, fit_with_gain

ROOT = Path(__file__).resolve().parent.parent
PIX = 6.15


def make_injections(rng, n, mjd, shape, sigma, snr_range=(7.0, 14.0), margin=5):
    N, H, W = shape
    t = mjd - mjd.min()
    out = []
    tries = 0
    while len(out) < n and tries < 2000:
        tries += 1
        t0 = rng.uniform(0, t.max())
        speed = rng.uniform(0.3, 3.0)
        ang = rng.uniform(0, 2 * np.pi)
        x0, y0 = rng.uniform(margin, W - margin), rng.uniform(margin, H - margin)
        x = x0 + speed * np.cos(ang) * (t - t0)
        y = y0 + speed * np.sin(ang) * (t - t0)
        inside = (x > margin) & (x < W - margin) & (y > margin) & (y < H - margin)
        frames = np.nonzero(inside)[0]
        if len(frames) < 10:
            continue
        quiet = np.nanmean(sigma[np.clip(y[frames].round().astype(int), 0, shape[1] - 1), np.clip(x[frames].round().astype(int), 0, shape[2] - 1)])
        if not quiet < 1.5 * np.nanmedian(sigma):
            continue
        sel = frames[np.argsort(np.abs(t[frames] - t0))][:60]
        out.append({"frames": np.sort(sel), "x": x, "y": y, "snr": rng.uniform(*snr_range),
                    "vx": speed * np.cos(ang), "vy": speed * np.sin(ang), "x0": x0 - speed * np.cos(ang) * t0,
                    "y0": y0 - speed * np.sin(ang) * t0})
    return out


def inject_movers(image, inj, sigma, fscale):
    H, W = image.shape[1:]
    yy, xx = np.indices((H, W))
    for s in inj:
        for f in s["frames"]:
            amp = s["snr"] * sigma[int(round(s["y"][f])), int(round(s["x"][f]))] * fscale[f] / 1.6
            image[f] += amp * np.exp(-((yy - s["y"][f]) ** 2 + (xx - s["x"][f]) ** 2) / (2 * 1.1 ** 2))


def opaque_id(name, seed, k):
    return f"{name}-" + hashlib.sha1(f"{name}:{seed}:{k}".encode()).hexdigest()[:8]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--n-inject", type=int, default=6)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    tile = CACHE / "tiles" / a.name
    z = np.load(tile / "aligned.npz")
    image, lam, mjd, det = z["image"].astype(np.float64), z["lam"], z["mjd"], z["det"]
    info = json.loads((tile / "frames.json").read_text())

    res = fit_with_gain(image, lam, det)
    keep = ~bad_frame_mask(res, det)
    image, lam, mjd, det = image[keep], lam[keep], mjd[keep], det[keep]
    bad_frac = z["bad_frac"][keep]
    N, H, W = image.shape
    floor = float(np.nanmedian(res.sigma))
    fscale = res.frame_scale[keep]

    rng = np.random.default_rng(a.seed)
    inj = make_injections(rng, a.n_inject, mjd, image.shape, res.sigma)
    inject_movers(image, inj, res.sigma, fscale)

    res = fit_with_gain(image, lam, det)
    found = find_candidates(res.z, res.sigma, mjd)
    raw = detections(res.z, res.sigma)
    for k, s in enumerate(inj):
        near = [d for d in raw if int(d[0]) in set(s["frames"].tolist()) and np.hypot(d[1] - s["x"][int(d[0])], d[2] - s["y"][int(d[0])]) <= 1.5]
        zloc = res.z[s["frames"], np.clip(np.round(s["y"][s["frames"]]).astype(int), 0, H - 1), np.clip(np.round(s["x"][s["frames"]]).astype(int), 0, W - 1)]
        s["seen"] = sorted([[int(d[0]), int(d[1]), int(d[2])] for d in near])
        print(f"  injection {k}: snr {s['snr']:.1f}, speed {np.hypot(s['vx'], s['vy']):.2f} px/d, {len(s['frames'])} frames, detected in {len(near)}, median z at true position {np.nanmedian(zloc):.1f}")

    def overlap(track, s):
        hits = [np.hypot(x - s["x"][f], y - s["y"][f]) <= 1.5 for f, x, y in track if f in set(s["frames"].tolist())]
        return sum(hits) / max(len(track), 1)

    recovered = []
    keep_found = []
    for c in found:
        m = [i for i, s in enumerate(inj) if overlap(c["track"], s) > 0.5]
        if m:
            recovered.append(m[0])
        else:
            keep_found.append(c)
    print(f"{N} frames kept | detected {len(found)} candidates ({sum(c['kind']=='static' for c in found)} static, "
          f"{sum(c['kind']=='moving' for c in found)} moving) | injections recovered {len(set(recovered))}/{len(inj)}")

    cands, sql_c, sql_i = [], [], []
    for k, c in enumerate(keep_found):
        cid = opaque_id(a.name, a.seed, f"d{k}")
        mid = c["track"][len(c["track"]) // 2]
        cands.append({"id": cid, "x": mid[1], "y": mid[2], "frame": mid[0], "kind_hint": None, "score": None, "track": c["track"]})
        sql_c.append((cid, {"x": mid[1], "y": mid[2], "frame": mid[0], "snr": c["snr"], "track": c["track"]}, 0))
    for k, s in enumerate(inj):
        cid = opaque_id(a.name, a.seed, f"i{k}")
        track = s["seen"] if len(s["seen"]) >= 3 else [[int(f), int(round(s["x"][f])), int(round(s["y"][f]))] for f in s["frames"]]
        mid = track[len(track) // 2]
        cands.append({"id": cid, "x": mid[1], "y": mid[2], "frame": mid[0], "kind_hint": None, "score": None, "track": track})
        sql_c.append((cid, {"x": mid[1], "y": mid[2], "frame": mid[0], "snr": float(s["snr"]), "track": track}, 1))
        sql_i.append((cid, s))
    rng.shuffle(cands)

    out = tile / "export"
    scale_deg = H * PIX / 3600
    write_tile(out, a.name, ra=info["ra"], dec=info["dec"], fov_deg=scale_deg, pix_arcsec=PIX,
               image=image.astype(np.float32), z=res.z, mjd=mjd, det=det, lam_um=np.nanmean(lam, axis=(1, 2)),
               bad_frac=bad_frac, candidates=cands, release="DR1+QR3", label=a.label or a.name)

    tid = a.name
    sql = [f"DELETE FROM votes WHERE candidate_id LIKE '{tid}-%';", f"DELETE FROM injections WHERE tile_id='{tid}';",
           f"DELETE FROM candidates WHERE tile_id='{tid}';", f"DELETE FROM tiles WHERE id='{tid}';",
           "INSERT INTO tiles (id,ra,dec,fov_deg,release,status,n_frames,label) VALUES "
           f"('{tid}',{info['ra']},{info['dec']},{scale_deg:.5f},'DR1+QR3','ready',{N},'{(a.label or a.name).replace(chr(39), '')}');"]
    for cid, c, is_inj in sql_c:
        sql.append("INSERT INTO candidates (id,tile_id,x,y,t_ref,kind,score,is_injection,track) VALUES "
                   f"('{cid}','{tid}',{c['x']},{c['y']},{c['frame']},NULL,NULL,{is_inj},'{json.dumps(c['track'])}');")
    for cid, s in sql_i:
        sql.append("INSERT INTO injections (id,tile_id,candidate_id,x0,y0,vx,vy,mag) VALUES "
                   f"('inj-{cid}','{tid}','{cid}',{s['x0']:.3f},{s['y0']:.3f},{s['vx']:.4f},{s['vy']:.4f},{s['snr']:.2f});")
    seed = ROOT / "tools" / f"real_{a.name}_seed.sql"
    seed.parent.mkdir(exist_ok=True)
    seed.write_text("\n".join(sql) + "\n")
    print(f"-> {out} | {seed.name} ({len(cands)} candidates, {len(inj)} hidden injections)")


if __name__ == "__main__":
    main()
