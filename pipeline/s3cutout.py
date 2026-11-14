"""Cut a region out of a SPHEREx Level-2 file in the public S3 bucket using HTTP range reads."""
from __future__ import annotations

import io
import math
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from .reduce import pixel_wavelength
from .s3index import BUCKET, s3

BLOCK = 2880
PIX_ARCSEC = 6.15
_layout: dict[str, list] = {}


def _read(key: str, start: int, length: int, tries: int = 5) -> bytes:
    for i in range(tries):
        try:
            return s3().get_object(Bucket=BUCKET, Key=key, Range=f"bytes={start}-{start + length - 1}")["Body"].read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def _header_at(key: str, offset: int, chunk: int = 48_000):
    raw = _read(key, offset, chunk)
    buf = io.BytesIO(raw)
    h = fits.Header.fromfile(buf)
    return h, offset + buf.tell(), raw[:buf.tell()]


def layout(key: str) -> tuple[bytes, dict]:
    """Primary header bytes and {EXTNAME: (header, data_start, data_bytes, header_bytes)} for one file."""
    h0, off, prim = _header_at(key, 0)
    hdus = {}
    for _ in range(6):
        h, start, hb = _header_at(key, off)
        n = abs(h["BITPIX"]) // 8 * h.get("NAXIS1", 0) * h.get("NAXIS2", 0) + h.get("PCOUNT", 0)
        hdus[h["EXTNAME"]] = (h, start, n, hb)
        off = start + math.ceil(n / BLOCK) * BLOCK
    return prim, hdus


def _compressed_rows(key: str, prim: bytes, h: fits.Header, start: int, y0: int, y1: int) -> np.ndarray:
    """Rows y0..y1 of a tile-compressed image whose tiles are single rows: rebuild a small compressed HDU."""
    if h.get("ZTILE2", 1) != 1 or h["NAXIS1"] != 8:
        raise ValueError("only one-row tiles with 32-bit descriptors are supported")
    desc = np.frombuffer(_read(key, start + y0 * 8, (y1 - y0) * 8), dtype=">i4").reshape(-1, 2)
    heap0 = start + h.get("THEAP", h["NAXIS1"] * h["NAXIS2"])
    lo, hi = int(desc[:, 1].min()), int((desc[:, 0] + desc[:, 1]).max())
    heap = _read(key, heap0 + lo, hi - lo)
    new_desc = np.column_stack([desc[:, 0], desc[:, 1] - lo]).astype(">i4").tobytes()
    hn = h.copy()
    hn["NAXIS2"], hn["ZNAXIS2"], hn["PCOUNT"] = y1 - y0, y1 - y0, len(heap)
    if "THEAP" in hn:
        hn["THEAP"] = len(new_desc)
    body = new_desc + heap
    body += b"\0" * (-len(body) % BLOCK)
    with fits.open(io.BytesIO(prim + hn.tostring().encode() + body)) as hl:
        return np.asarray(hl[1].data)


def s3_cutout(key: str, ra: float, dec: float, size_deg: float) -> dict:
    prim, hdus = layout(key)
    himg = hdus["IMAGE"][0]
    w = WCS(himg)
    nx, ny = himg["NAXIS1"], himg["NAXIS2"]
    x, y = w.world_to_pixel_values(ra, dec)
    r = int(math.ceil(size_deg * 3600 / PIX_ARCSEC / 2))
    x0, x1 = max(0, int(round(float(x))) - r), min(nx, int(round(float(x))) + r + 1)
    y0, y1 = max(0, int(round(float(y))) - r), min(ny, int(round(float(y))) + r + 1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        raise ValueError("position outside the image")

    def rows(name, dtype):
        h, start, _, hb = hdus[name]
        if h.get("ZIMAGE"):
            return _compressed_rows(key, prim, h, start, y0, y1)[:, x0:x1]
        rb = h["NAXIS1"] * abs(h["BITPIX"]) // 8
        raw = _read(key, start + y0 * rb, (y1 - y0) * rb)
        return np.frombuffer(raw, dtype=dtype).reshape(y1 - y0, h["NAXIS1"])[:, x0:x1]

    def wave():
        h, start, n, hb = hdus["WCS-WAVE"]
        data = _read(key, start, n)
        pad = lambda b: b + b"\0" * (-len(b) % BLOCK)
        with fits.open(io.BytesIO(prim + hb + pad(data))) as hl:
            return hl[1].data

    with ThreadPoolExecutor(5) as ex:
        f = {k: ex.submit(rows, k, d) for k, d in (("IMAGE", ">f4"), ("FLAGS", ">i4"), ("VARIANCE", ">f4"), ("ZODI", ">f4"))}
        fw = ex.submit(wave)
        arr = {k: v.result() for k, v in f.items()}
        wtab = fw.result()

    hc = himg.copy()
    hc["NAXIS1"], hc["NAXIS2"] = x1 - x0, y1 - y0
    hc["CRPIX1A"] -= x0
    hc["CRPIX2A"] -= y0
    lam, bw = pixel_wavelength(hc, wtab)
    wc = w.slice((slice(y0, y1), slice(x0, x1)))
    return {
        "image": arr["IMAGE"].astype(np.float32), "variance": arr["VARIANCE"].astype(np.float32),
        "zodi": arr["ZODI"].astype(np.float32), "flags": arr["FLAGS"].astype(np.uint32), "lam": lam, "bw": bw,
        "meta": {"obsid": himg.get("OBSID"), "detector": int(himg.get("DETECTOR", 0)), "mjd": float(himg["MJD-AVG"]),
                 "bunit": himg.get("BUNIT"), "lam_center": float(np.nanmean(lam)),
                 "lam_span": float(np.nanmax(lam) - np.nanmin(lam)), "shape": [y1 - y0, x1 - x0],
                 "wcs": wc.to_header(relax=True).tostring(sep="\n")},
    }
