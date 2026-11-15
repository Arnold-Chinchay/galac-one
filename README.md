# GALAC ONE

**Explore · Observe · Discover.** Citizen science on NASA SPHEREx data: an automatic search of the whole infrared
sky for objects that move or change, and a game where anyone helps decide which ones are real.

By **Naylamp Space** (Piura, Peru) for NASA Space Apps 2026, challenge *"Planet X and SPHEREx"*.

**Live:** https://naylamspace.earth · Data layer: [huggingface.co/datasets/naylamp-space/spherex-deep-sky](https://huggingface.co/datasets/naylamp-space/spherex-deep-sky)

---

## The problem and our idea

SPHEREx photographs every patch of sky many times, each time at a different wavelength. Comparing two photos
therefore shows every star changing colour, which hides the few things that really move or blink. A distant
Planet X, or a cold brown dwarf, would be faint, red and slow.

GALAC ONE does three things:

1. **Removes what does not change.** For every pixel we fit the star's own spectrum across all photos and subtract
   it; what is left are movers, variables and glitches.
2. **Searches the sky by itself.** A crawler on GitHub Actions stacks the sky region by region, starting along the
   ecliptic (where Planet X would orbit), and looks for sources far redder than stars (cold-dwarf colours).
3. **Lets people decide.** Candidates go to a one-screen game. Hidden test objects measure how reliable each person
   is, and the community's weighted answers decide what becomes a lead and what is ruled out.

## What is built (all live)

| Part | What it does |
|---|---|
| **Sky** page | The whole SPHEREx sky (IRSA all-sky map) with our deep stacks drawn on top, a thin outline of what has been stacked so far, the five challenge fields, cold candidates, the automatic search's progress and the **Community leads** list |
| **Classify · Spot check** | A flagged glowing dot plays as a loop; answer *moves / blinks / glitch / not sure* (keys 1–4). Points, streaks, ranks, badges, leaderboard |
| **Classify · Follow a star** | Click any star and follow it through months of photos; the site measures its motion with errors |
| **Classify · Sky hunt** | Very red sources found by the crawler, shown in the deep image: *is there a red dot in the ring?* |
| **Field picker** | Challenge fields plus new fields the crawler publishes on its own around its most promising red sources; searchable, grouped, "cold only" filter |
| **Community consensus** | Every answer weighted by the person's accuracy on hidden tests; ≥3 people and a 60 % majority decide. Ruled-out sources leave the Sky hunt queue, confirmed ones go first |
| **Sky crawler** | Every 2 h, 38 regions on 19 machines: read each SPHEREx frame once from S3, stack, search for red sources, cut playable fields, publish to Hugging Face |

## Results measured with SPHEREx data alone

| Target | Our result | Reference |
|---|---|---|
| Barnard's Star | proper motion **10.10 ± 0.12 ″/yr** | Gaia 10.39 (−2.9 %, direction within 0.3°) |
| Epsilon Indi B | **4.70 ± 0.06 ″/yr** | Gaia 4.68 (+0.4 %) |
| R Draconis | period **238 d**, ~1.1 mag (false-alarm probability ~1e-12) | catalogue ~245 d *(not re-checked)* |
| RW Aurigae | ~1 mag irregular variability | T Tauri star, irregular |
| WISE 0855 | **found blind**: the only one of 19 red sources with a Y-dwarf spectrum, and the only one that moves | literature motion not re-checked; parallax not corrected |

- Spectral subtraction removes static structure ×55 on a synthetic sky and ×4.5 on real stars (R Draconis field).
- Detection completeness (48 injected movers): 43 % at S/N 5–7 per frame, 82–90 % above 7; 27 of 30 injections
  recovered across the five fields.
- Reliability grading tested live: a person answering "moves" to everything scores 0.58, a careful one 0.92.
- Deep stacks: noise ×6–28 below a single exposure; drizzled 2× images make stars 32–36 % sharper.

What is **not** verified yet is marked in [`docs/notes.md`](docs/notes.md). The cold candidates of the automatic search
are leads, not discoveries: they have not been cross-matched with other catalogues.

## How it works

```
 S3 (public SPHEREx images) ──► GitHub Actions ──────────────────────────► Hugging Face dataset
   own spatial index             fetch · align · subtract · detect           deep-sky HiPS layer
   (build-index, weekly)         stack (drizzle) · red search · fields       analysis/ · fields/ · state/
                                         │                                          │
                                         ▼                                          ▼
                       Cloudflare Worker (api/) ── D1 votes, users, consensus ── React site (focus-frontend/)
                       R2: challenge field files                                  Aladin Lite sky map
```

- **No account and no keys in the browser.** Votes are anonymous (random id in the browser).
- **Everything runs on free tiers:** Cloudflare Workers + D1 + R2, GitHub Actions, Hugging Face datasets.
- **Honest scoring:** hidden injections and empty-sky controls are never revealed by the API; the file that holds
  their truth is git-ignored and never published.

## Repository map

| Path | What is inside |
|---|---|
| [`focus-frontend/`](focus-frontend) | The site: React 19 + Vite + TypeScript. Pages in `src/pages`, game modes in `src/components` (`SkyHunt`, `FollowStar`, `FieldPicker`, `CommunityLeads`, `SkyMap`), data adapters in `src/data`, rendering and tracking in `src/lib` |
| [`api/`](api) | Cloudflare Worker: API, consensus (`src/consensus.js`), static site and field files |
| [`migrations/`](migrations) | D1 database schema |
| [`pipeline/`](pipeline) | Python science pipeline (see table below) |
| [`.github/workflows/`](.github/workflows) | `sky-crawler` (automatic sky), `build-index`, `build-tile`, `build-deep`, `build-mosaic` |
| [`tests/`](tests), `focus-frontend/tests/`, `api/tests/` | Synthetic validation of the subtraction; front-end and consensus tests |
| [`docs/`](docs) | [`api.md`](docs/api.md) (API and data formats), [`notes.md`](docs/notes.md) (technical notes and findings, in Spanish) |

### Pipeline modules

| Step | Modules |
|---|---|
| Find images | `s3index.py` (index from FITS headers in S3), `frames_index.py`, `s3cutout.py`, `irsa.py` |
| Prepare a field | `fetch_tile.py`, `reduce.py`, `align.py`, `region_store.py` |
| Find what changes | `spectral_sub.py`, `detect.py`, `make_tile.py` (with hidden injections), `completeness.py` |
| Measure | `propermotion.py`, `lightcurve.py`, `targets.py` (Gaia astrometry) |
| Deep sky | `deep.py` (drizzle stacks), `mosaic.py` (seamless regions → HiPS) |
| Automatic search | `sky_queue.py`, `redsearch.py`, `region_analysis.py`, `sky_field.py`, `sky_publish.py` |

## Run it

```bash
# site
cd focus-frontend && npm install && npm run dev        # uses the live API if .env.development.local sets VITE_API_BASE_URL
npm test                                               # front-end tests
node --test ../api/tests/consensus.test.js             # consensus tests

# pipeline (Python 3.11)
py -3.11 -m venv .venv && .venv/Scripts/python -m pip install -r pipeline/requirements.txt
gh release download index-dr1 -p dr1_index.csv.gz -D cache/merged
gh release download index-qr3 -p qr3_index.csv.gz -D cache/merged
python -m pipeline.fetch_tile --name rdra --ra 248.1788 --dec 66.755 --fov 0.1 --source index --index cache/merged/*.csv.gz
python -m pipeline.align --name rdra
python -m pipeline.make_tile --name rdra --label "R Draconis field"
python tests/test_spectral_sub.py

# deploy (from the repository root)
cd focus-frontend && npm run build && cd .. && npx wrangler deploy
```

The sky crawler needs no laptop: `gh workflow run sky-crawler.yml` (it also runs every two hours).

## Data and acknowledgement

Images come from the public bucket `s3://nasa-irsa-spherex` (DR1 and QR3) and the IRSA services; the all-sky map is
IRSA's SPHEREx HiPS; the sky viewer is Aladin Lite (CDS); astrometry of the challenge targets is from Gaia DR3.

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of
> Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the
> California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

License: MIT.
