"""Download + extract the original Kaggle "Chest X-Ray Images (Pneumonia)"
dataset without a Kaggle account.

The dataset is mirrored on HuggingFace at ``hf-vision/chest-xray-pneumonia``
(CC-BY-4.0, parquet format, identical split to the original Kaggle upload:
train 5216 / validation 16 / test 624, classes NORMAL and PNEUMONIA).

Usage (from the ``backend/`` directory)::

    .venv/Scripts/python -m app.models.prepare_data --out ./data/chest_xray

Produces the folder layout consumed by ``app.models.train``::

    <out>/train/NORMAL/*.jpg
    <out>/train/PNEUMONIA/*.jpg
    <out>/val/NORMAL/*.jpg
    <out>/val/PNEUMONIA/*.jpg
    <out>/test/NORMAL/*.jpg
    <out>/test/PNEUMONIA/*.jpg

The original validation split has only 16 images — far too small for model
selection. So by default a validation split is carved out of the training
set (``--val-fraction 0.1``, seeded) while the original test split is kept
untouched for final evaluation.
"""

from __future__ import annotations

import argparse
import io
import shutil
import urllib.request
from pathlib import Path
from typing import Dict, List

import pyarrow.parquet as pq

REPO_ID = "hf-vision/chest-xray-pneumonia"
BASE = "https://huggingface.co/datasets/hf-vision/chest-xray-pneumonia/resolve/main/data"

# split -> (parquet pattern, number of shards, label names)
# NOTE: BASE already includes the /data/ directory, so patterns are bare filenames.
SPLITS = {
    "train": ("train-{:05d}-of-00007.parquet", 7, ["NORMAL", "PNEUMONIA"]),
    "validation": ("validation-00000-of-00001.parquet", 1, ["NORMAL", "PNEUMONIA"]),
    "test": ("test-00000-of-00001.parquet", 1, ["NORMAL", "PNEUMONIA"]),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Download + extract the chest X-ray pneumonia dataset")
    p.add_argument("--out", type=str, default="./data/chest_xray",
                   help="Output directory for the extracted folder layout")
    p.add_argument("--val-fraction", type=float, default=0.1,
                   help="Fraction of the training split to hold out for validation")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def download_file(url: str, dest: Path) -> None:
    """Stream-download a parquet shard to disk (avoids holding 400MB in RAM)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  cached: {dest.name}")
        return
    print(f"  downloading {url.split('/')[-1]} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "mediscan/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as f:
        shutil.copyfileobj(resp, f)
    print(f"  done: {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")


def extract_split(split: str, parquet_dir: Path, out_dir: Path) -> List[str]:
    """Extract all images of one split into <out>/<class>/image_*.jpg."""
    pattern, shards, class_names = SPLITS[split]
    class_dirs: Dict[str, Path] = {
        name: out_dir / name for name in class_names
    }
    for d in class_dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    written: List[str] = []
    for shard in range(shards):
        parquet_path = parquet_dir / pattern.format(shard)
        table = pq.read_table(str(parquet_path))
        rows = table.to_pylist()
        for i, row in enumerate(rows):
            label = int(row["label"])
            image_bytes = row["image"]["bytes"]
            cls = class_names[label]
            fname = f"{cls}/image_{shard}_{i:05d}.jpg"
            (out_dir / fname).write_bytes(image_bytes)
            written.append(fname)
    print(f"[prepare] {split}: extracted {len(written)} images -> {out_dir}")
    return written


def carve_validation(train_dir: Path, val_dir: Path, fraction: float, seed: int) -> None:
    """Move a seeded random fraction of train images into the val split."""
    import random

    rng = random.Random(seed)
    for cls in ["NORMAL", "PNEUMONIA"]:
        src = train_dir / cls
        dst = val_dir / cls
        dst.mkdir(parents=True, exist_ok=True)
        images = sorted(src.iterdir())
        n_val = max(1, int(len(images) * fraction))
        chosen = rng.sample(images, n_val)
        for img in chosen:
            shutil.move(str(img), str(dst / img.name))
        print(f"[prepare] val/{cls}: moved {n_val} images (kept {len(images) - n_val} in train)")


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out)
    parquet_dir = out_dir.parent / "_parquet_cache"
    parquet_dir.mkdir(parents=True, exist_ok=True)

    print(f"[prepare] downloading {REPO_ID} (CC-BY-4.0) ...")
    for split in ("train", "validation", "test"):
        pattern, shards, _ = SPLITS[split]
        for shard in range(shards):
            download_file(f"{BASE}/{pattern.format(shard)}", parquet_dir / pattern.format(shard))

    train_dir = out_dir / "train"
    val_dir = out_dir / "val"
    test_dir = out_dir / "test"

    print("[prepare] extracting train split ...")
    extract_split("train", parquet_dir, train_dir)
    print("[prepare] extracting test split ...")
    extract_split("test", parquet_dir, test_dir)
    # The original validation split (16 images) is too small for model
    # selection; carve a proper validation split out of training instead.
    print(f"[prepare] carving validation ({args.val_fraction:.0%} of train, seed={args.seed}) ...")
    carve_validation(train_dir, val_dir, args.val_fraction, args.seed)

    # Count final layout
    for split_dir in (train_dir, val_dir, test_dir):
        total = sum(1 for p in split_dir.rglob("*.jpg"))
        print(f"[prepare] {split_dir}: {total} images")

    # Clean up the parquet cache to reclaim ~1.2 GB
    shutil.rmtree(parquet_dir, ignore_errors=True)
    print("[prepare] done.")


if __name__ == "__main__":
    main()
