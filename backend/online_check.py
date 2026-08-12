"""Ad-hoc real-world check: run the deployed CNN on labeled chest X-rays
downloaded from Wikimedia Commons (a different distribution than the
Kaggle training data). Reports per-image predictions vs. known labels.

Usage:  python online_check.py   (from backend/)
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

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.image_processing import preprocess_image  # noqa: E402
from app.services.model_inference import get_model_service  # noqa: E402

API = "https://commons.wikimedia.org/w/api.php"

# (label, file title) — titles verified to exist via the Commons search API.
CASES = [
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


def imageinfo_url(title: str) -> str:
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": "640",
        "format": "json",
    })
    req = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": "MediScan-dev/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    pages = data["query"]["pages"]
    page = next(iter(pages.values()))
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


def main() -> None:
    service = get_model_service()
    print(f"engine={service.engine} loaded={service.is_model_loaded}")

    rows = []
    correct = 0
    for label, title in CASES:
        time.sleep(1.5)  # be gentle with the Commons API
        try:
            img = download(imageinfo_url(title))
        except Exception as exc:
            print(f"  !! download failed: {title} ({exc})")
            rows.append({"label": label, "title": title, "error": str(exc)})
            continue

        input_np = preprocess_image(img)
        result = service.predict_with_gradcam(input_np)
        pred = result["class_name"]
        conf = result["confidence"]
        probs = [round(p, 4) for p in result["probabilities"]]
        ok = pred.upper() == label
        correct += ok
        print(f"  [{'OK ' if ok else 'MISS'}] gt={label:9s} pred={pred:9s} "
              f"conf={conf:.3f} probs={probs}")
        rows.append({
            "label": label, "title": title, "predicted": pred,
            "confidence": round(conf, 4), "probabilities": probs,
        })

    n = len(rows)
    print(f"\n{correct}/{n} correct online ({(correct / n) * 100:.1f}%)" if n else "no images tested")


if __name__ == "__main__":
    main()
