"""Seamless mosaic of a sky region from overlapping deep cells, cut into HiPS tiles for the sky map."""
import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

BANDS = ("red", "green", "blue")
STRETCH = {"red": (0.0204, 7.19), "green": (0.0443, 17.6), "blue": (0.0512, 19.6)}


def cells(ra: float, dec: float, size: float, step: float) -> list[dict]:
    """Cell centres on a square grid in the tangent plane; neighbouring cells overlap by (cell size - step)."""
    n = max(1, math.ceil(size / step))
    off = (np.arange(n) - (n - 1) / 2) * step
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [1, 1]
    w.wcs.cdelt = [-1, 1]
    out = []
    for j, dy in enumerate(off):
        for i, dx in enumerate(off):
            r, d = w.wcs_pix2world([[dx, dy]], 0)[0]
            out.append({"name": f"c{j}{i}", "ra": round(float(r) % 360, 6), "dec": round(float(d), 6)})
    return out


def taper(shape: tuple[int, int], edge: float = 0.12) -> np.ndarray:
    """Weight that falls smoothly to zero over the outer `edge` fraction of a cell, so overlaps blend."""
    def ramp(n):
        x = np.minimum(np.arange(n), np.arange(n)[::-1]) / max(1, n * edge)
        return np.clip(0.5 - 0.5 * np.cos(np.pi * np.clip(x, 0, 1)), 1e-3, 1)
    return np.outer(ramp(shape[0]), ramp(shape[1]))


def load_cell(d: Path):
    meta = json.loads((d / "deep.json").read_text())
    h, w = meta["shape"]
    wcs = WCS(fits.Header.fromstring(meta["wcs"], sep="\n"))
    bands = {}
    for b in BANDS:
        raw = np.frombuffer((d / f"deep_{b}.f16.bin").read_bytes(), dtype="<f2").astype(np.float32).reshape(h, w)
        bands[b] = raw[::-1]                                   # stored north up; back to FITS row order
    return meta, wcs, bands


def join(cell_dirs: list[Path], ra: float, dec: float, size: float, out: Path) -> None:
    from PIL import Image
    from pyavm import AVM
    from reproject import reproject_interp
    from reproject.hips import reproject_to_hips
    from reproject.mosaicking import reproject_and_coadd
    from pipeline.deep import fill_saturated
    loaded = [load_cell(d) for d in cell_dirs if (d / "deep.json").exists()]
    if not loaded:
        raise SystemExit("no cells with deep.json")
    pix = loaded[0][0]["pix_arcsec"] / 3600
    n = int(math.ceil(size / pix))
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-pix, pix]
    out.mkdir(parents=True, exist_ok=True)
    mosaic, cover = {}, None
    for b in BANDS:
        data = [(bands[b], wcs) for _, wcs, bands in loaded]
        weights = [taper(bands[b].shape) * np.isfinite(bands[b]) for _, _, bands in loaded]
        img, foot = reproject_and_coadd(data, w, shape_out=(n, n), input_weights=weights,
                                        reproject_function=reproject_interp, combine_function="mean",
                                        match_background=True)
        img[foot <= 0] = np.nan
        mosaic[b] = img
        cover = foot if cover is None else np.minimum(cover, foot)
        print(b, "cells", len(data), "pixels", n, flush=True)

    # One fixed stretch for the whole sky (MJy/sr, measured on the Barnard mosaic): regions built on different
    # days then meet without seams. Values are (noise, bright level) per band.
    chans = []
    for b in BANDS:
        d = fill_saturated(mosaic[b].copy())
        noise, top = STRETCH[b]
        x = np.arcsinh(np.clip(d, 0, None) / (3 * noise)) / np.arcsinh(top / (3 * noise))
        chans.append(np.clip(x, 0, 1))
    rgb = np.stack(chans, axis=-1)
    # Alpha fades the outer edge of the region into the all-sky map instead of cutting it.
    # Opaque wherever any cell has data (overlap weights are low where cells meet, so they cannot be the alpha).
    from scipy.ndimage import distance_transform_edt
    covered = (cover > 0) & np.all([np.isfinite(mosaic[b]) for b in BANDS], axis=0)
    covered[[0, -1], :] = covered[:, [0, -1]] = False
    alpha = np.clip(distance_transform_edt(covered) / max(8, 0.04 * n), 0, 1)
    alpha = 0.5 - 0.5 * np.cos(np.pi * alpha)
    rgba = np.dstack([rgb, alpha])[::-1]                      # north up for the PNG
    png = out / "mosaic.png"
    Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(png)
    tagged = out / "mosaic_avm.png"
    AVM.from_wcs(w, shape=(n, n)).embed(str(png), str(tagged))
    hips = out / "hips"
    shutil.rmtree(hips, ignore_errors=True)
    reproject_to_hips(str(tagged), coord_system_out="equatorial", reproject_function=reproject_interp,
                      output_directory=str(hips), threads=True,
                      properties={"obs_title": "Naylamp SPHEREx deep mosaic", "obs_collection": "SPHEREx deep stack"})
    (out / "mosaic.json").write_text(json.dumps({"ra": ra, "dec": dec, "size_deg": size, "pix_arcsec": pix * 3600,
                                                 "cells": len(loaded), "shape": [n, n]}))
    print("hips", sum(1 for _ in hips.rglob("*.png")), "tiles")


def merge(sources: list[Path], dest: Path) -> None:
    """Fold HiPS folders into one layer; where two cover the same tile, the newer one is drawn over the older."""
    from PIL import Image
    dest.mkdir(parents=True, exist_ok=True)
    order, n = 0, 0
    for src in sources:
        for tile in src.rglob("Npix*.png"):
            rel = tile.relative_to(src)
            order = max(order, int(rel.parts[0].replace("Norder", "")))
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            if out.exists():
                base = Image.open(out).convert("RGBA")
                base.alpha_composite(Image.open(tile).convert("RGBA"))
                base.save(out)
            else:
                shutil.copyfile(tile, out)
            n += 1
    (dest / "properties").write_text("\n".join([
        "creator_did          = ivo://naylamp/P/spherex-deep",
        "obs_title            = Naylamp SPHEREx deep sky",
        "dataproduct_type     = image",
        "hips_version         = 1.4",
        "hips_frame           = equatorial",
        f"hips_order           = {order}",
        "hips_order_min       = 0",
        "hips_tile_width      = 512",
        "hips_tile_format     = png",
        "hips_status          = public master unclonable",
    ]) + "\n")
    print("merged", n, "tiles, max order", order)


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cells", help="print the cell grid as JSON")
    j = sub.add_parser("join", help="join cell deep images into a HiPS mosaic")
    m = sub.add_parser("merge", help="fold several HiPS folders into one layer")
    m.add_argument("sources", type=Path, nargs="+")
    m.add_argument("--out", type=Path, required=True)
    for q in (c, j):
        q.add_argument("--ra", type=float, required=True)
        q.add_argument("--dec", type=float, required=True)
        q.add_argument("--size", type=float, default=2.0, help="region width in degrees")
    c.add_argument("--step", type=float, default=0.34, help="distance between cell centres in degrees")
    j.add_argument("--cells", type=Path, required=True, help="folder holding one subfolder per cell, each with deep.json")
    j.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    if a.cmd == "merge":
        merge(a.sources, a.out)
    elif a.cmd == "cells":
        print(json.dumps(cells(a.ra, a.dec, a.size, a.step)))
    else:
        join(sorted(x for x in a.cells.iterdir() if x.is_dir()), a.ra, a.dec, a.size, a.out)


if __name__ == "__main__":
    main()
