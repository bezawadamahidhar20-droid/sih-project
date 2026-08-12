"""Dataset loaders and preprocessing for the training pipeline.

Two common layouts are supported:

* **Folder layout** (e.g. Kaggle chest-xray)::

      <data_dir>/
        train/Normal/*.jpg
        train/Pneumonia/*.jpg
        val/Normal/*.jpg
        val/Pneumonia/*.jpg
        test/Normal/*.jpg
        test/Pneumonia/*.jpg

* **CSV layout** (e.g. NIH ChestX-ray14 style)::

      <csv_path>            <images_dir>/
        image,label          00000001_000.png
        scan_1.png,Normal    00000002_000.png
        scan_2.png,Pneumonia ...

The preprocessing mirrors ``app.services.image_processing.preprocess_image``
so that training-time transforms match inference-time transforms exactly:
resize to ``input_size`` (default 224), convert to RGB, normalize with the
ImageNet mean/std used by the model service.

Datasets are plain ``__len__``/``__getitem__`` objects (no ``torch`` import
at construction time), which lets the heuristic evaluation path in
``evaluate.py`` scan the same directory structure without installing torch.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from PIL import Image

# ImageNet statistics — MUST match app/services/image_processing.py
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def default_transforms(input_size: int = 224, train: bool = True):
    """torchvision transforms matching the inference preprocessing pipeline.

    Resampling is LANCZOS to match ``app.services.image_processing.
    preprocess_image`` exactly (train-time augmentation still differs by
    design, but the base resize must not).
    """
    import torchvision.transforms as T

    if train:
        # Augmentation tuned for chest X-rays: brightness/contrast jitter
        # mimics the huge scanner/exposure variance between institutions (the
        # leading cause of out-of-distribution failures), plus mild geometry
        # (flip, rotation, shear, scale) that keeps anatomy plausible.
        return T.Compose(
            [
                T.Resize((input_size, input_size), interpolation=T.InterpolationMode.LANCZOS),
                T.RandomHorizontalFlip(p=0.5),
                T.RandomAffine(
                    degrees=12, translate=(0.06, 0.06), scale=(0.9, 1.1),
                    shear=6,
                ),
                T.ColorJitter(brightness=0.3, contrast=0.3),
                T.ToTensor(),
                T.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            ]
        )
    return T.Compose(
        [
            T.Resize((input_size, input_size), interpolation=T.InterpolationMode.LANCZOS),
            T.ToTensor(),
            T.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )


def resolve_positive_index(positive_class: str, class_names: Sequence[str]) -> int:
    """Locate the abnormal class in ``class_names`` case-insensitively.

    Dataset classes come from folder/CSV names (e.g. "PNEUMONIA") while the
    CLI default is "Pneumonia" — an exact-match lookup would silently reject
    the documented commands.
    """
    for i, name in enumerate(class_names):
        if name.lower() == positive_class.lower():
            return i
    raise SystemExit(
        f"--positive-class '{positive_class}' not found in dataset classes "
        f"{class_names}. Use --positive-class to select the abnormal class."
    )


def find_class_dirs(root: Path) -> List[str]:
    """Sorted subdirectory names (class labels) under a split directory."""
    if not root.exists():
        raise FileNotFoundError(f"Data directory not found: {root}")
    dirs = sorted(
        p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")
    )
    if not dirs:
        raise ValueError(f"No class subdirectories found under: {root}")
    return dirs


def _to_label_tensor(label: int):
    import torch
    return torch.tensor(label, dtype=torch.long)


class FolderDataset:
    """Loads ``<root>/<class>/*.img`` images. Class order = sorted folder names."""

    def __init__(
        self,
        root: str,
        transform=None,
        class_order: Optional[Sequence[str]] = None,
    ):
        self.root = Path(root)
        self.transform = transform
        self.class_names: List[str] = class_order or find_class_dirs(self.root)
        self.class_to_idx = {name: i for i, name in enumerate(self.class_names)}

        self.samples: List[Tuple[str, int]] = []
        for name in self.class_names:
            class_dir = self.root / name
            if not class_dir.is_dir():
                raise FileNotFoundError(
                    f"Expected class directory: {class_dir} (missing in {self.root})"
                )
            for f in sorted(class_dir.iterdir()):
                # JPEG/PNG/BMP only: the training loader uses PIL, which
                # cannot read DICOM. Convert DICOM series to PNG first
                # (see app/services/image_processing.py for the API-side path).
                if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}:
                    self.samples.append((str(f), self.class_to_idx[name]))

        if not self.samples:
            raise ValueError(f"No images found under {self.root}")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int):
        path, label = self.samples[index]
        image = Image.open(path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, _to_label_tensor(label)


class CsvDataset:
    """Loads images listed in a CSV with columns ``image,label``.

    ``images_dir`` is the base directory the ``image`` column is relative to.
    """

    def __init__(
        self,
        csv_path: str,
        images_dir: str,
        transform=None,
        class_order: Optional[Sequence[str]] = None,
    ):
        self.images_dir = Path(images_dir)
        self.transform = transform

        self.samples: List[Tuple[str, int]] = []
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames is None or "image" not in reader.fieldnames or "label" not in reader.fieldnames:
                raise ValueError("CSV must contain 'image' and 'label' columns")
            for row in reader:
                image_name = row["image"].strip()
                label = row["label"].strip()
                self.samples.append((image_name, label))

        # Class order: given order first, then any new labels sorted.
        known = list(class_order) if class_order else []
        labels_seen: List[str] = []
        for _, label in self.samples:
            if label not in known and label not in labels_seen:
                labels_seen.append(label)
        self.class_names = known + sorted(labels_seen)
        self.class_to_idx = {name: i for i, name in enumerate(self.class_names)}

        resolved = []
        for image_name, label in self.samples:
            path = self.images_dir / image_name
            if not path.exists():
                raise FileNotFoundError(f"Image referenced by CSV not found: {path}")
            resolved.append((str(path), self.class_to_idx[label]))
        self.samples = resolved

        if not self.samples:
            raise ValueError(f"No samples found in {csv_path}")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int):
        path, label = self.samples[index]
        image = Image.open(path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, _to_label_tensor(label)


def build_dataset(
    root: Optional[str] = None,
    csv_path: Optional[str] = None,
    images_dir: Optional[str] = None,
    transform=None,
    class_order: Optional[Sequence[str]] = None,
):
    """Factory: returns a FolderDataset or CsvDataset, preferring ``root``."""
    if root:
        return FolderDataset(root, transform=transform, class_order=class_order)
    if csv_path:
        if not images_dir:
            raise ValueError("--images-dir is required when using --csv")
        return CsvDataset(csv_path, images_dir, transform=transform, class_order=class_order)
    raise ValueError("Provide either --data-dir (folder layout) or --csv + --images-dir")
