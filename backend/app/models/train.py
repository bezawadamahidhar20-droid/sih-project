"""Fine-tune a CNN (ResNet / EfficientNet / DenseNet) for chest X-ray
classification and save a state dict compatible with the MediScan inference
service (``app.services.model_inference.build_model``).

Usage (from the ``backend/`` directory, after activating the venv)::

    python -m app.models.train --data-dir ./data/chest_xray \\
        --arch resnet50 --epochs 10 --batch-size 16 --output ./models/model.pth

The produced ``model.pth`` is a plain ``model.state_dict()``. Drop it at the
path configured by ``MODEL_PATH`` and the API will use the trained
CNN + Grad-CAM engine. (With no model file present and
``ALLOW_HEURISTIC_FALLBACK=false`` the API fails loudly — it never silently
serves heuristic guesses in production.)

Class imbalance is handled by default via inverse-frequency class weights in
the loss (``--class-weights auto``); ``--max-train-samples`` enables a
seeded stratified subsample of the training split for CPU feasibility.

Model selection metric: **sensitivity (recall of the abnormal class)** by
default, per the roadmap's "minimize false negatives" requirement.
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path
from typing import List, Optional

import numpy as np

from app.models.metrics import (
    binary_metrics,
    multiclass_report,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fine-tune a CNN for chest X-ray classification (MediScan AI)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--data-dir", type=str, default=None,
                   help="Folder layout: <data-dir>/{train,val,test}/<class>/*.img")
    p.add_argument("--val-dir", type=str, default=None,
                   help="Override validation split directory (folder layout)")
    p.add_argument("--csv", type=str, default=None,
                   help="Training CSV with 'image,label' columns (NIH style)")
    p.add_argument("--val-csv", type=str, default=None,
                   help="Validation CSV (separate from --csv)")
    p.add_argument("--images-dir", type=str, default=None,
                   help="Base directory for CSV-referenced images")
    p.add_argument("--arch", type=str, default="resnet50",
                   choices=["resnet18", "resnet50", "efficientnet_b0", "densenet121"])
    p.add_argument("--num-classes", type=int, default=2)
    p.add_argument("--input-size", type=int, default=224,
                   help="Must match MODEL_INPUT_SIZE in the backend config")
    p.add_argument("--epochs", type=int, default=15)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--momentum", type=float, default=0.9)
    p.add_argument("--freeze-backbone", action="store_true",
                   help="Freeze all layers except the classification head")
    p.add_argument("--class-weights", type=str, default="auto",
                   choices=["auto", "none"],
                   help="'auto' = inverse-frequency class weights in the loss "
                        "(handles class imbalance); 'none' = unweighted")
    p.add_argument("--max-train-samples", type=int, default=None,
                   help="Stratified subsample of the training split (for CPU "
                        "feasibility). Keeps the same class ratio; val/test are "
                        "never subsampled.")
    p.add_argument("--patience", type=int, default=5,
                   help="Early stopping after N epochs without improvement")
    p.add_argument("--positive-class", type=str, default="Pneumonia",
                   help="Class treated as 'abnormal' for sensitivity-based model selection")
    p.add_argument("--device", type=str, default=None,
                   help="torch device (default: cuda if available, else cpu)")
    p.add_argument("--output", type=str, default="./models/model.pth",
                   help="Where to save the trained state dict")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)


def build_pretrained_model(arch: str, num_classes: int, device):
    """Build the exact architecture used by inference, then load ImageNet
    pretrained weights for the backbone (the head is kept random)."""
    import torch

    from app.services.model_inference import build_model

    model, target_layer = build_model(arch, num_classes)

    # Load ImageNet weights into a stock model of the same architecture and
    # copy over every weight whose shape matches (backbone + stem). The
    # classifier head shapes differ, so it stays randomly initialized.
    import torchvision

    weights = "IMAGENET1K_V1"
    try:
        stock = torchvision.models.get_model(arch, weights=weights)
    except Exception:
        stock = torchvision.models.get_model(arch, weights="DEFAULT")

    state = model.state_dict()
    pretrained = stock.state_dict()
    compatible = {
        k: v for k, v in pretrained.items()
        if k in state and v.shape == state[k].shape
    }
    model.load_state_dict(compatible, strict=False)
    print(f"[train] Loaded ImageNet weights ({len(compatible)}/{len(state)} tensors)")
    missing = [k for k in state if k not in compatible]
    if missing:
        print(f"[train] Randomly initialized tensors: {missing}")

    model = model.to(device)
    return model, target_layer


def _save_checkpoint(model, output: Path, summary: dict) -> None:
    import torch

    output.parent.mkdir(parents=True, exist_ok=True)
    # Move to CPU for a portable checkpoint (avoids CUDA-only tensors).
    cpu_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}
    torch.save(cpu_state, str(output))
    summary_path = output.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2, default=str))
    print(f"[train] Saved model state dict -> {output}")
    print(f"[train] Saved training summary -> {summary_path}")


def _class_weights(args, class_names: List[str], class_counts: List[int]):
    """Inverse-frequency weights normalized to mean 1.

    With ``NORMAL: 1207, PNEUMONIA: 3488`` this yields ~[1.66, 0.57], so the
    minority class contributes more per-sample gradient signal without
    inflating the total loss scale.
    """
    if args.class_weights != "auto" or len(class_names) <= 1:
        return None
    total = sum(class_counts) or 1
    freq = [c / total for c in class_counts]
    inv = [1.0 / max(f, 1e-6) for f in freq]
    mean_inv = sum(inv) / len(inv)
    weights = [w / mean_inv for w in inv]
    print(f"[train] Class weights ({args.class_weights}): "
          f"{dict(zip(class_names, [round(w, 4) for w in weights]))}")
    return weights


def _stratified_subset(train_ds, max_samples: int, seed: int):
    """Return a torch Subset with ``max_samples`` rows, stratified by class."""
    import torch

    from torch.utils.data import Subset

    rng = random.Random(seed)
    by_class: dict = {}
    for idx, (_, label) in enumerate(train_ds.samples):
        by_class.setdefault(int(label), []).append(idx)
    n_per_class = max(1, max_samples // len(by_class))
    chosen = []
    for label, idxs in sorted(by_class.items()):
        k = min(n_per_class, len(idxs))
        chosen.extend(rng.sample(idxs, k))
    print(f"[train] Stratified subsample: {len(chosen)}/{len(train_ds)} training "
          f"rows (per class: {sorted((k, len(v)) for k, v in by_class.items())})")
    return Subset(train_ds, sorted(chosen))


def _dataset_splits(args, transform_train, transform_val):
    """Resolve train/val datasets from the CLI args."""
    from app.models.data import build_dataset

    if args.data_dir:
        root = Path(args.data_dir)
        train_ds = build_dataset(
            root=str(root / "train"), transform=transform_train,
            class_order=None,
        )
        val_ds = build_dataset(
            root=str(Path(args.val_dir) if args.val_dir else root / "val"),
            transform=transform_val, class_order=train_ds.class_names,
        )
        return train_ds, val_ds

    if args.csv:
        if not args.images_dir:
            raise ValueError("--images-dir is required when using --csv")
        train_ds = build_dataset(
            csv_path=args.csv, images_dir=args.images_dir,
            transform=transform_train, class_order=None,
        )
        if not args.val_csv:
            raise SystemExit(
                "CSV layout requires an explicit --val-csv: otherwise validation "
                "(and early stopping / model selection) would run on the TRAINING "
                "split, leaking training data into the reported metrics."
            )
        val_ds = build_dataset(
            csv_path=args.val_csv, images_dir=args.images_dir,
            transform=transform_val, class_order=train_ds.class_names,
        )
        return train_ds, val_ds

    raise ValueError("Provide either --data-dir (folder layout) or --csv + --images-dir")


def main() -> None:
    args = parse_args()

    import torch

    _set_seed(args.seed)

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    print(f"[train] Device: {device}")

    from torch.utils.data import DataLoader

    from app.models.data import default_transforms

    train_ds, val_ds = _dataset_splits(
        args,
        default_transforms(args.input_size, train=True),
        default_transforms(args.input_size, train=False),
    )

    # Class distribution of the FULL training split (before any subsampling)
    # — used for imbalance reporting and for inverse-frequency class weights.
    from collections import Counter
    orig_counts = Counter(int(lbl) for _, lbl in train_ds.samples)

    if args.max_train_samples:
        train_ds = _stratified_subset(train_ds, args.max_train_samples, args.seed)
        # torch Subset proxies __getitem__/__len__ but not custom attributes;
        # carry the class metadata across so callers keep working unchanged.
        train_ds.class_names = train_ds.dataset.class_names
        train_ds.class_to_idx = train_ds.dataset.class_to_idx

    print(f"[train] Training samples: {len(train_ds)}  classes: {train_ds.class_names}")
    print(f"[train] Validation samples: {len(val_ds)}")
    print(f"[train] Original train class distribution: "
          f"{dict(zip(train_ds.class_names, [orig_counts.get(i, 0) for i in range(len(train_ds.class_names))]))}")

    # Resolve which class index is the 'abnormal' (positive) class.
    if args.positive_class not in train_ds.class_names:
        raise SystemExit(
            f"--positive-class '{args.positive_class}' not found in dataset classes "
            f"{train_ds.class_names}. Use --positive-class to select the abnormal class."
        )
    positive_index = train_ds.class_names.index(args.positive_class)
    print(f"[train] Positive (abnormal) class: '{args.positive_class}' at index {positive_index}")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=0, drop_last=False)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                            num_workers=0)

    model, _ = build_pretrained_model(args.arch, args.num_classes, device)

    # Inverse-frequency weights from the FULL training split (so the weight
    # ratio reflects the real data even when --max-train-samples is used).
    class_counts = [orig_counts.get(i, 0) for i in range(len(train_ds.class_names))]
    weights = _class_weights(args, train_ds.class_names, class_counts)
    criterion = torch.nn.CrossEntropyLoss(
        weight=torch.tensor(weights, dtype=torch.float32).to(device)
        if weights else None
    )

    if args.freeze_backbone:
        for name, param in model.named_parameters():
            # Freeze everything except the classification head.
            if "fc" not in name and "classifier" not in name:
                param.requires_grad = False
        trainable = [p for p in model.parameters() if p.requires_grad]
        print(f"[train] Backbone frozen; training {sum(p.numel() for p in trainable):,} params")
    else:
        trainable = [p for p in model.parameters() if p.requires_grad]

    optimizer = torch.optim.SGD(trainable, lr=args.lr, momentum=args.momentum,
                                weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    output = Path(args.output)
    best_score = -1.0
    epochs_no_improve = 0
    history: List[dict] = []
    best_summary: Optional[dict] = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss, n_batches = 0.0, 0
        t0 = time.time()

        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
            n_batches += 1

        scheduler.step()

        # ---- validation ----
        model.eval()
        val_loss, correct, total = 0.0, 0, 0
        all_probs: List[np.ndarray] = []
        all_labels: List[int] = []
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                logits = model(images)
                val_loss += criterion(logits, labels).item() * images.size(0)
                probs = torch.softmax(logits, dim=1).cpu().numpy()
                preds = probs.argmax(axis=1)
                correct += int((preds == labels.cpu().numpy()).sum())
                total += labels.size(0)
                all_probs.append(probs)
                all_labels.extend(labels.cpu().numpy().tolist())

        probs_all = np.concatenate(all_probs, axis=0)
        y_true = np.asarray(all_labels, dtype=np.int64)
        y_pred = probs_all.argmax(axis=1)

        metrics = binary_metrics(y_true, probs_all, y_pred=y_pred,
                                 positive_index=positive_index)
        report = multiclass_report(y_true, y_pred, train_ds.class_names)

        # Model selection metric: sensitivity (recall of abnormal class).
        score = metrics["sensitivity"]
        elapsed = time.time() - t0
        print(
            f"[epoch {epoch:02d}/{args.epochs}] train_loss={running_loss / max(n_batches, 1):.4f} "
            f"val_loss={val_loss / max(total, 1):.4f} acc={correct / max(total, 1):.4f} "
            f"sens={metrics['sensitivity']:.4f} spec={metrics['specificity']:.4f} "
            f"auc={metrics['auc']:.4f} ({elapsed:.1f}s)"
        )

        history.append({
            "epoch": epoch,
            "train_loss": running_loss / max(n_batches, 1),
            "val_loss": val_loss / max(total, 1),
            "val_accuracy": correct / max(total, 1),
            "metrics": metrics,
            "per_class": report,
        })

        if score > best_score:
            best_score = score
            epochs_no_improve = 0
            best_summary = {
                "architecture": args.arch,
                "num_classes": args.num_classes,
                "input_size": args.input_size,
                "class_names": train_ds.class_names,
                "positive_class": args.positive_class,
                "device": str(device),
                "best_epoch": epoch,
                "selection_metric": "sensitivity",
                "best_metrics": metrics,
                "per_class": report,
                "history": history,
                "frozen_backbone": args.freeze_backbone,
                "class_weights": "auto" if weights else "none",
                "max_train_samples": args.max_train_samples,
                "train_samples": len(train_ds),
                "val_samples": len(val_ds),
            }
            _save_checkpoint(model, output, best_summary)
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= args.patience:
                print(f"[train] Early stopping after {epochs_no_improve} epochs without improvement")
                break

    print(f"[train] Done. Best validation sensitivity: {best_score:.4f}")


if __name__ == "__main__":
    main()
