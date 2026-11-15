"""Add freshly built regions to the deep-sky HiPS layer on Hugging Face, touching only the tiles they cover,
and add their cold-object search to analysis/ (one file per region plus an index the site reads)."""
import argparse
import json
import os
import shutil
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import EntryNotFoundError

from pipeline.mosaic import merge
from pipeline.region_analysis import rises_to_4_5um

LAYER = "hips/deep-sky"
INDEX = "analysis/index.json"


def update_index(api: HfApi, repo: str, token: str, files: list[Path]) -> None:
    """Upload each region's analysis and fold it into the index the site reads.

    The index keeps only cold-dwarf-like sources (every red source stays in the per-region files): with three
    sources per cell it would otherwise grow by ~190 per region. Motion is reported only for those cold sources,
    because over thousands of red sources a p < 0.05 motion test passes by chance alone about one time in twenty.
    """
    try:
        index = json.loads(Path(hf_hub_download(repo, INDEX, repo_type="dataset", token=token)).read_text())
    except EntryNotFoundError:
        index = {"regions": {}, "sources": []}
    stage = Path("publish/analysis")
    shutil.rmtree(stage, ignore_errors=True)
    (stage / "regions").mkdir(parents=True)
    for f in files:
        r = json.loads(f.read_text())
        key = str(r["pix"])
        shutil.copyfile(f, stage / "regions" / f"r{key}.json")
        index["regions"][key] = {"ra": r["ra"], "dec": r["dec"], "cells_searched": r["cells_searched"], "n_sources": len(r["sources"])}
        index["sources"] = [x for x in index["sources"] if str(x.get("region")) != key] + [{**x, "region": key} for x in r["sources"]]
    index["sources"] = [x for x in index["sources"] if x.get("y_dwarf_like") and rises_to_4_5um(x.get("spectrum", []))]
    index.pop("n_moving", None)
    index["n_regions"] = len(index["regions"])
    index["n_red"] = sum(r.get("n_sources", 0) for r in index["regions"].values())
    index["n_cold"] = len(index["sources"])
    index["n_cold_moving"] = sum(1 for x in index["sources"] if x.get("moving"))
    index["n_sources"] = index["n_cold"]
    (stage / "index.json").write_text(json.dumps(index))
    api.upload_folder(repo_id=repo, repo_type="dataset", folder_path=str(stage), path_in_repo="analysis",
                      commit_message=f"Cold-object search: {len(files)} regions")
    print(f"analysis index: {index['n_regions']} regions, {index['n_red']} red sources, {index['n_cold']} cold-dwarf-like, {index['n_cold_moving']} of them with a motion hint")


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--repo", required=True)
    a.add_argument("--hips", type=Path, nargs="*", default=[], help="HiPS folders of the new regions")
    a.add_argument("--analysis", type=Path, nargs="*", default=[], help="analysis.json of the new regions")
    a.add_argument("--state", type=Path, help="updated state/regions.json to upload with the tiles")
    a.add_argument("--message", default="Add regions")
    args = a.parse_args()
    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)
    api.create_repo(args.repo, repo_type="dataset", exist_ok=True)

    if args.analysis:
        update_index(api, args.repo, token, args.analysis)
    if not args.hips:
        return
    work = Path("publish")
    shutil.rmtree(work, ignore_errors=True)
    old, out = work / "old", work / "out"
    paths = sorted({t.relative_to(h).as_posix() for h in args.hips for t in h.rglob("Npix*.png")})
    found = 0
    for p in paths:
        try:
            got = hf_hub_download(args.repo, f"{LAYER}/{p}", repo_type="dataset", token=token)
        except EntryNotFoundError:
            continue
        (old / p).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(got, old / p)
        found += 1
    print(f"{len(paths)} tiles touched, {found} already on the Hub")
    merge([old, *args.hips] if found else list(args.hips), out)
    api.upload_folder(repo_id=args.repo, repo_type="dataset", folder_path=str(out), path_in_repo=LAYER,
                      commit_message=args.message)
    if args.state:
        api.upload_file(repo_id=args.repo, repo_type="dataset", path_or_fileobj=str(args.state),
                        path_in_repo="state/regions.json", commit_message="Update region state")


if __name__ == "__main__":
    main()
