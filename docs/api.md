# API and data formats

One Cloudflare Worker (`api/src/index.js`) serves the site, the API and the challenge field files. CORS is open.
Base: `https://naylamspace.earth/api`.

## Endpoints

| Route | Returns |
|---|---|
| `GET /api/tiles` | `{tiles:[{id, ra, dec, fov_deg, release, n_frames, label, files_url}]}`: the five challenge fields plus the newest fields published by the sky crawler (`sky…` ids, files on Hugging Face) |
| `GET /api/tiles/:id/candidates` | Spots of a field with vote counts: `{id, x, y, t_ref, kind_hint, score, track, n_votes, n_moving, …}` |
| `GET /api/next?tile=&user=&n=` | Spots this person has not answered yet, random order (max 20) |
| `POST /api/votes` | `{user_id, alias?, votes:[{candidate_id, label, ms?}]}` (max 50), `label` ∈ `moving, variable, artifact, unsure` → `{ok, accepted, ignored, n_votes, reliability}`. The first vote on a crawler field registers it |
| `POST /api/reports` | A measurement from *Follow a star*: position, label, measured motion, note |
| `POST /api/sky-votes` | `{user_id, alias?, votes:[{source_key, ra, dec, label}]}`, `label` ∈ `red, star, glare, nothing` |
| `GET /api/sky-votes?region=r1234` | `{counts:{source_key:{red, star, glare, nothing}}, status:{source_key: lead / rejected / open}}` |
| `GET /api/consensus` | What the community has decided: `{spots:{leads, n_lead, n_rejected, n_open}, sky:{…}}` |
| `GET /api/me?user=` | `{alias, n_votes, reliability}` |
| `GET /api/stats` | Totals and the top-10 leaderboard |
| `GET /api/health` | D1 and R2 status |

## Reliability and consensus

- **Reliability** of a person = accuracy on hidden injected movers (should be answered *moves*) and on empty-sky
  controls (should not), smoothed: `(correct + 1) / (graded + 2)`; 0.5 before any graded answer.
- **The API never reveals which spots are tests**, per answer or in any list. Their truth lives only in
  `tools/real_*_seed.sql`, which is git-ignored.
- **Consensus** (`api/src/consensus.js`): each answer weighs its author's reliability. A decision needs ≥ 3 people,
  total weight ≥ 1.2 and a 60 % majority. Spots: *moves* / *blinks* → lead, *glitch* → ruled out. Sky hunt: *red dot*
  against every kind of *no*. Test objects are never listed as leads.

## Field files (`files_url`)

| File | Content |
|---|---|
| `manifest.json` | `shape:{n_frames, height, width}`, `ra`, `dec`, `fov_deg`, `pix_arcsec`, time and wavelength ranges |
| `frames.json` | Per frame, sorted by time: `{i, mjd, det, lam_um, bad_frac}` |
| `science.f16.bin` | float16 little-endian `(N, H, W)`: image in MJy/sr, zodiacal light removed. `NaN` = masked |
| `residuals.f16.bin` | Same shape: residual after the spectral subtraction, in σ |
| `candidates.json` | Spots to classify (`id, x, y, frame, track`) |

Index `arr[(frame*H + y)*W + x]`; `y = 0` is south (flip for north up), `x = 0` is east.

## Sky data on Hugging Face (`naylamp-space/spherex-deep-sky`)

| Path | Content |
|---|---|
| `hips/deep-sky/` | HiPS layer of everything stacked (order 7, 512 px PNG, ~3.2″/px) |
| `state/regions.json` | Regions stacked so far (HEALPix order 5) with their frame count; the sky map outlines them |
| `analysis/index.json`, `analysis/regions/r<pix>.json` | Red-source search per region; the index keeps the cold-dwarf-like ones |
| `fields/index.json`, `fields/<id>/` | Playable fields cut around the most promising red sources (same format as above) |
