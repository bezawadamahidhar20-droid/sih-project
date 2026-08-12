"""Compare deployed model.pth vs the retrained model_v2.pth.

Runs both state dicts over the held-out test split (batched, fast) and the
Wikimedia Commons online set (per-image, with retries), applying the same
MODEL_DECISION_THRESHOLD decision rule the API uses, then prints a side-by-side
metric comparison so the better model can be promoted to model.pth.

Usage:  python compare_models.py   (from backend/, after model_v2.pth exists)
"""
from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.config import get_settings  # noqa: E402
from app.models.data import build_dataset, default_transforms  # noqa: E402
from app.models.metrics import binary_metrics  # noqa: E402

settings = get_settings()
THRESHOLD = settings.model_decision_threshold

API = "https://commons.wikimedia.org/w/api.php"
ONLINE_CASES = [
    ("PNEUMONIA", "File:Chest X-ray showing neurofibromatosis with bilateral pneumonia.jpg"),
    ("PNEUMONIA", "File:Chest X-ray in influenza and Haemophilus influenzae.jpg"),
    ("PNEUMONIA", "File:Pneumonia x ray.jpg"),
    ("PNEUMONIA", "File:X-ray of cyst in pneumocystis pneumonia 2.jpg"),
    ("PNEUMONIA", "File:X-ray of cyst in pneumocystis pneumonia 1.jpg"),
    ("NORMAL", "File:Normal posteroanterior (PA) chest radiograph (X-ray).jpg"),
    ("NORMAL", "File:Normal lateral chest radiograph (X-ray).jpg"),
    ("NORMAL", "File:Normal lateral chest x-ray.jpg"),
    ("NORMAL", "File:Normal neonatal chest x-ray.jpg"),
    ("NORMAL", "File:Boy chest x-ray pic.jpg"),
    ("NORMAL", "File:Chest X-ray 2346.jpg"),
    ("NORMAL", "File:Normal PA chest x-ray (5414485536).jpg"),
]


def load_model(path: str, device):
    import torch
    from app.services.model_inference import build_model

    model, _ = build_model(settings.model_architecture, settings.model_num_classes)
    state = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def predict_probs(model, tensor, device):
    import torch
    import torch.nn.functional as F

    with torch.no_grad():
        out = model(tensor.to(device))
        return F.softmax(out, dim=1).cpu().numpy()


def threshold_prediction(probs_row: np.ndarray) -> int:
    """Apply the API's decision rule: binary threshold for 2 classes, argmax otherwise."""
    if len(probs_row) == 2:
        return int(probs_row[1] >= THRESHOLD)
    return int(np.argmax(probs_row))


def test_split(model, device):
    import torch
    from torch.utils.data import DataLoader

    ds = build_dataset(root="data/chest_xray/test", transform=default_transforms(224, train=False))
    loader = DataLoader(ds, batch_size=16, shuffle=False, num_workers=0)
    probs_all, labels = [], []
    with torch.no_grad():
        for images, ys in loader:
            probs_all.append(predict_probs(model, images, device))
            labels.extend(ys.numpy().tolist())
    probs = np.concatenate(probs_all)
    labels = np.asarray(labels)
    y_pred = np.array([threshold_prediction(r) for r in probs])
    return binary_metrics(labels, probs, y_pred=y_pred, positive_index=1)


def imageinfo_thumb(title: str) -> str:
    params = urllib.parse.urlencode({
        "action": "query", "titles": title, "prop": "imageinfo",
        "iiprop": "url", "iiurlwidth": "640", "format": "json",
    })
    req = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": "MediScan-dev/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        page = next(iter(json.load(resp)["query"]["pages"].values()))
    return page["imageinfo"][0]["thumburl"]


def download(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "MediScan-dev/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return Image.open(io.BytesIO(resp.read())).convert("RGB")
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                time.sleep(8 * (attempt + 1))
                continue
            raise


def online_set(model, device):
    from app.services.image_processing import preprocess_image

    correct = total = 0
    for label, title in ONLINE_CASES:
        time.sleep(1.5)
        try:
            img = download(imageinfo_thumb(title))
        except Exception as exc:
            print(f"    !! download failed: {title} ({exc})")
            continue
        inp = preprocess_image(img)
        import torch
        probs = predict_probs(model, torch.from_numpy(inp).float(), device)[0]
        pred = threshold_prediction(probs)
        class_name = settings.model_classes[pred] if pred < len(settings.model_classes) else f"Class_{pred}"
        ok = class_name.upper() == label
        correct += ok
        total += 1
        print(f"    [{'OK ' if ok else 'MISS'}] gt={label:9s} pred={class_name:9s} conf={probs.max():.3f}")
    return correct, total


def main() -> None:
    import torch

    device = torch.device("cpu")
    paths = [Path("./models/model.pth"), Path("./models/model_v2.pth")]

    for path in paths:
        if not path.exists():
            print(f"!! {path} missing — skipping")
            continue
        print(f"\n=== {path.name} (threshold={THRESHOLD}) ===")
        model = load_model(str(path), device)

        m = test_split(model, device)
        print(
            f"  [test]   acc={m['accuracy']:.4f} bal_acc={m['balanced_accuracy']:.4f} "
            f"sens={m['sensitivity']:.4f} spec={m['specificity']:.4f} "
            f"f1={m['f1']:.4f} auc={m['auc']:.4f} (n={m['support']})"
        )

        c, t = online_set(model, device)
        print(f"  [online] {c}/{t} correct ({100 * c / max(t, 1):.1f}%)")


if __name__ == "__main__":
    main()
