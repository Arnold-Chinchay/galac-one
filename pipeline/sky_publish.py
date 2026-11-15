"""Add freshly built regions to the deep-sky HiPS layer on Hugging Face, touching only the tiles they cover."""
import argparse
import json
import os
import shutil
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import EntryNotFoundError

from pipeline.mosaic import merge

LAYER = "hips/deep-sky"


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--repo", required=True)
    a.add_argument("--hips", type=Path, nargs="+", required=True, help="HiPS folders of the new regions")
    a.add_argument("--state", type=Path, help="updated state/regions.json to upload with the tiles")
    a.add_argument("--message", default="Add regions")
    args = a.parse_args()
    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)
    api.create_repo(args.repo, repo_type="dataset", exist_ok=True)

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
