"""Official challenge targets with their astrometry (Gaia DR3, epoch 2016.0, unless noted)."""
from __future__ import annotations

import numpy as np

TARGETS = {
    "barnard": {"label": "Barnard's Star", "ra": 269.44850252544, "dec": 4.73942005111, "pmra": -801.551, "pmdec": 10362.394,
                "epoch": 2016.0, "kind": "proper motion"},
    "epsindib": {"label": "Epsilon Indi B", "ra": 331.07645259656, "dec": -56.79381206688, "pmra": 3981.977, "pmdec": -2466.832,
                 "epoch": 2016.0, "kind": "proper motion"},
    "rwaur": {"label": "RW Aurigae", "ra": 76.95630, "dec": 30.40126, "pmra": 3.8, "pmdec": -26.0, "epoch": 2016.0, "kind": "variable"},
    "rdra": {"label": "R Draconis", "ra": 248.16737836729, "dec": 66.75500674547, "pmra": -20.643, "pmdec": 6.149,
             "epoch": 2016.0, "kind": "variable"},
    # Not in Gaia. Challenge position (WISE epoch ~2010.5) and approximate literature proper motion: unverified.
    "wise0855": {"label": "WISE 0855-0714", "ra": 133.79513, "dec": -7.24515, "pmra": -8100.0, "pmdec": 700.0,
                 "epoch": 2010.5, "kind": "proper motion"},
}


def mjd_to_year(mjd):
    return 2000.0 + (np.asarray(mjd) - 51544.5) / 365.25


def position_at(name: str, mjd) -> tuple[np.ndarray, np.ndarray]:
    """RA, Dec (deg) at the given MJD(s), linear proper motion (parallax ignored)."""
    t = TARGETS[name]
    dt = mjd_to_year(mjd) - t["epoch"]
    dec = t["dec"] + t["pmdec"] / 3.6e6 * dt
    ra = t["ra"] + t["pmra"] / 3.6e6 * dt / np.cos(np.radians(t["dec"]))
    return ra, dec
