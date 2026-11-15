"""Which sky regions to stack next: HEALPix order-5 pixels, first those with new SPHEREx frames, then new ground next to what is done."""
import argparse
import gzip
import json
from pathlib import Path

import numpy as np
from astropy import units as u
from astropy_healpix import HEALPix
from scipy.spatial import cKDTree

ORDER = 5                      # 12 288 regions of ~1.83°
REGION_DEG = 2.6               # mosaic width per region: covers the corners where four regions meet
FRAME_RADIUS = 2.0             # a frame (3.5° wide) touches a region if its centre is this close
MIN_FRAMES = 20
REFRESH = 1.15                 # restack when a region has 15 % more frames than when it was built
SEEDS = [(269.452, 4.693), (331.096, -56.80), (133.760, -7.242), (76.956, 30.401), (248.167, 66.755)]

hp = HEALPix(nside=2 ** ORDER, order="nested")


def unit(ra, dec):
    ra, dec = np.radians(ra), np.radians(dec)
    return np.column_stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)])


def chord(deg):
    return 2 * np.sin(np.radians(deg) / 2)


def frame_counts(indexes: list[Path]) -> tuple[np.ndarray, np.ndarray]:
    """Frames touching each region and the newest frame date (MJD) among them."""
    ra, dec, mjd = [], [], []
    for p in indexes:
        with gzip.open(p, "rt") as f:
            cols = f.readline().strip().split(",")
            i_ra, i_dec, i_mjd = cols.index("ra_c"), cols.index("dec_c"), cols.index("mjd")
            for line in f:
                v = line.split(",")
                try:
                    ra.append(float(v[i_ra])); dec.append(float(v[i_dec])); mjd.append(float(v[i_mjd]))
                except (ValueError, IndexError):
                    continue
    tree = cKDTree(unit(np.array(ra), np.array(dec)))
    lon, lat = hp.healpix_to_lonlat(np.arange(hp.npix))
    centres = unit(lon.to_value(u.deg), lat.to_value(u.deg))
    hits = tree.query_ball_point(centres, chord(FRAME_RADIUS))
    mjd = np.array(mjd)
    counts = np.array([len(h) for h in hits])
    newest = np.array([mjd[h].max() if h else 0 for h in hits])
    return counts, newest


def plan(counts: np.ndarray, state: dict, k: int) -> list[dict]:
    lon, lat = hp.healpix_to_lonlat(np.arange(hp.npix))
    ra, dec = lon.to_value(u.deg), lat.to_value(u.deg)
    built = {int(p): v for p, v in state.get("regions", {}).items()}
    refresh = sorted((p for p, v in built.items() if counts[p] >= max(MIN_FRAMES, v["frames"] * REFRESH)),
                     key=lambda p: -(counts[p] / max(1, built[p]["frames"])))
    todo = np.array([p for p in range(hp.npix) if p not in built and counts[p] >= MIN_FRAMES])
    anchors = [(ra[p], dec[p]) for p in built] or SEEDS
    if len(todo):
        d, _ = cKDTree(unit(*np.array(anchors).T)).query(unit(ra[todo], dec[todo]))
        todo = todo[np.lexsort((-counts[todo], np.round(d, 3)))]       # nearest to what is done, then richest
    picks = [int(p) for p in refresh[:k]] + [int(p) for p in todo[: max(0, k - len(refresh))]]
    return [{"region": f"r{p}", "pix": p, "ra": round(float(ra[p]), 5), "dec": round(float(dec[p]), 5),
             "frames": int(counts[p]), "why": "new data" if p in built else "new sky"} for p in picks]


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("cmd", choices=["plan", "record", "seed"])
    a.add_argument("--index", type=Path, nargs="+", required=True)
    a.add_argument("--state", type=Path, required=True)
    a.add_argument("--k", type=int, default=30)
    a.add_argument("--regions", type=Path, help="plan output (record) or list of [ra, dec] built mosaics (seed)")
    a.add_argument("--out", type=Path)
    args = a.parse_args()
    state = json.loads(args.state.read_text()) if args.state.exists() else {"order": ORDER, "regions": {}}
    counts, newest = frame_counts(args.index)
    if args.cmd == "plan":
        picks = plan(counts, state, args.k)
        (args.out or Path("plan.json")).write_text(json.dumps(picks))
        print(json.dumps({"regions": len(picks), "new_data": sum(p["why"] == "new data" for p in picks),
                          "done": len(state["regions"]), "of": int((counts >= MIN_FRAMES).sum())}))
    else:
        regions = json.loads(args.regions.read_text())
        if args.cmd == "seed":                                  # mark regions already covered by hand-made mosaics
            lon, lat = hp.healpix_to_lonlat(np.arange(hp.npix))
            regions = [{"pix": int(p)} for ra, dec in regions
                       for p in hp.cone_search_lonlat(ra * u.deg, dec * u.deg, radius=0.7 * u.deg)]
        for r in regions:
            state["regions"][str(r["pix"])] = {"frames": int(counts[r["pix"]]), "mjd": float(newest[r["pix"]])}
        args.state.write_text(json.dumps(state))
        print("regions done", len(state["regions"]))


if __name__ == "__main__":
    main()
