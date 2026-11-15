# GALAC ONE

*Explore · Observe · Discover.* A tool by the Naylamp Space team (Piura, Peru).

Crowd-calibrated search for moving and changing objects in SPHEREx data. NASA Space Apps 2026, challenge "Planet X and SPHEREx".

Live: https://naylamp-space.spacenaylamp.workers.dev

SPHEREx sees each point of the sky at a different wavelength in every frame, so subtracting two frames leaves the residual of every star. We fit a static spectrum per pixel across all frames (with a per-frame gain), subtract it, and show what is left: movers, variables and artifacts. Volunteers classify the candidates; hidden synthetic objects measure how reliable each volunteer and each search is.

## Layout
| Path | What |
|---|---|
| `pipeline/` | Python: index of the S3 bucket, cutout download, alignment, spectral subtraction, detection, tile export |
| `api/`, `wrangler.toml` | Cloudflare Worker: API, static web and tile files (D1 + R2) |
| `focus-frontend/` | The GALAC ONE site (React + Vite), built to `focus-frontend/dist` and served by the Worker |
| `migrations/` | D1 schema |
| `tests/` | Synthetic validation of the spectral subtraction |
| `docs/` | `frontend.md` (API and data format), `notes.md` (technical notes and findings) |

## Run the pipeline
```bash
py -3.11 -m venv .venv && .venv/Scripts/python -m pip install -r pipeline/requirements.txt
# image index (releases index-dr1 / index-qr3 are published by the build-index workflow)
gh release download index-dr1 -p dr1_index.csv.gz -D cache/merged && gh release download index-qr3 -p qr3_index.csv.gz -D cache/merged
python -m pipeline.fetch_tile --name rdra --ra 248.1788 --dec 66.755 --fov 0.1 --stride 8 --source index --index cache/merged/dr1_index.csv.gz cache/merged/qr3_index.csv.gz
python -m pipeline.align --name rdra
python -m pipeline.make_tile --name rdra --label "R Draconis field"
python tests/test_spectral_sub.py
```
Deploy: `npx wrangler login`, then `npx wrangler deploy`.

## Data and acknowledgement
Images come from the public bucket `s3://nasa-irsa-spherex` (DR1 and QR3) and the IRSA cutout service.

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

License: MIT.
