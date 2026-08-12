"""Find a better decision threshold for the deployed CNN.

The model ranks images well (AUC ~0.95) but its argmax@0.5 boundary
over-predicts pneumonia (test specificity 0.71; real-world normals all
flagged). This sweeps thresholds on the abnormal-class probability over the
validation split and reports accuracy / balanced accuracy / sensitivity /
specificity at each, so we can pick a calibrated operating point.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

SPLIT = sys.argv[1] if len(sys.argv) > 1 else "val"

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.models.data import build_dataset, default_transforms  # noqa: E402
from app.models.metrics import binary_metrics  # noqa: E402


def main() -> None:
    import torch
    from torch.utils.data import DataLoader

    from app.services.model_inference import build_model

    device = torch.device("cpu")
    model, _ = build_model("resnet50", 2)
    state = torch.load("./models/model.pth", map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.eval()
    model.to(device)

    val_ds = build_dataset(
        root=f"data/chest_xray/{SPLIT}",
        transform=default_transforms(224, train=False),
    )
    print(f"[{SPLIT}] samples: {len(val_ds)} classes: {val_ds.class_names}")
    loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)

    probs, labels = [], []
    with torch.no_grad():
        for images, ys in loader:
            out = torch.softmax(model(images), dim=1).numpy()
            probs.append(out)
            labels.extend(ys.numpy().tolist())
    probs = np.concatenate(probs)
    labels = np.asarray(labels)
    p_abnormal = probs[:, 1]  # PNEUMONIA index 1

    print("\nthreshold | acc    | bal_acc | sens   | spec   | f1     | auc")
    for t in [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]:
        y_pred = (p_abnormal >= t).astype(int)
        m = binary_metrics(labels, probs, y_pred=y_pred, positive_index=1)
        print(
            f"{t:9.2f} | {m['accuracy']:.4f} | {m['balanced_accuracy']:.4f} | "
            f"{m['sensitivity']:.4f} | {m['specificity']:.4f} | {m['f1']:.4f} | {m['auc']:.4f}"
        )

    # Best by Youden's J (sens + spec - 1) on validation.
    best_t, best_j = 0.5, -1.0
    for t in np.arange(0.30, 0.96, 0.01):
        y_pred = (p_abnormal >= t).astype(int)
        m = binary_metrics(labels, probs, y_pred=y_pred, positive_index=1)
        j = m["sensitivity"] + m["specificity"] - 1
        if j > best_j:
            best_j, best_t = j, t
    print(f"\nBest Youden threshold: {best_t:.2f} (J={best_j:.4f})")

    # Best by balanced accuracy.
    best_t2, best_ba = 0.5, -1.0
    for t in np.arange(0.30, 0.96, 0.01):
        y_pred = (p_abnormal >= t).astype(int)
        m = binary_metrics(labels, probs, y_pred=y_pred, positive_index=1)
        if m["balanced_accuracy"] > best_ba:
            best_ba, best_t2 = m["balanced_accuracy"], t
    print(f"Best balanced-accuracy threshold: {best_t2:.2f} (bal_acc={best_ba:.4f})")


if __name__ == "__main__":
    main()
