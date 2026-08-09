# Model training & clinical validation

This package contains the **model training pipeline** (roadmap steps 2 and 5).
The web app ships with a baseline heuristic engine so the upload → predict →
Grad-CAM loop works out of the box; training a real CNN and dropping the state
dict at `MODEL_PATH` swaps in a genuine transfer-learned model with **no code
changes**.

```
backend/
  app/models/
    metrics.py    # numpy-only metrics: accuracy, sensitivity, specificity, F1, AUC
    data.py       # folder + CSV dataset loaders, transforms matching the API
    train.py      # fine-tune ResNet/EfficientNet/DenseNet (CLI)
    evaluate.py   # held-out evaluation + Grad-CAM examples (CLI)
    README.md
```

## Requirements

* Python with `torch` + `torchvision` installed (they are in
  `requirements.txt`, but the rest of the app deliberately imports them
  lazily, so the API and its tests run fine without them).
* A chest X-ray dataset in one of two layouts:

**Folder layout** (e.g. the Kaggle `chest_xray` dataset):

```
data/chest_xray/
  train/Normal/*.jpg
  train/Pneumonia/*.jpg
  val/Normal/*.jpg
  val/Pneumonia/*.jpg
  test/Normal/*.jpg
  test/Pneumonia/*.jpg
```

**CSV layout** (e.g. NIH ChestX-ray14 style) — a CSV with `image,label`
columns plus an images directory:

```
data/train.csv        data/images/
  image,label           00000001_000.png
  00000001_000.png,...  00000002_000.png
```

> Class ordering matters: the API maps index `0 → "Normal"`, `1 → "Pneumonia"`
> (from `MODEL_CLASSES` in the backend config). Folder names are sorted
> alphabetically, so `Normal`/`Pneumonia` already yield the right order. If
> your folders use other names, keep them in the order `[Normal, Pneumonia]`.

## Training

```bash
cd backend
.venv/Scripts/activate        # Windows; or `source .venv/bin/activate` on Linux/macOS

# Folder layout, ResNet-50 backbone, all layers trainable
python -m app.models.train --data-dir ./data/chest_xray \
    --arch resnet50 --epochs 12 --batch-size 16 \
    --lr 1e-4 --output ./models/model.pth

# CSV layout — a separate validation CSV is REQUIRED (validation on the
# training split would leak training data into model selection)
python -m app.models.train --csv ./data/train.csv --val-csv ./data/val.csv \
    --images-dir ./data/images --arch efficientnet_b0 --epochs 15 \
    --output ./models/model.pth

# Faster / safer first pass: freeze the backbone, tune only the head
python -m app.models.train --data-dir ./data/chest_xray \
    --arch resnet18 --freeze-backbone --epochs 8 --output ./models/model.pth
```

Key flags:

| Flag | Default | Purpose |
| --- | --- | --- |
| `--arch` | `resnet50` | `resnet18`, `resnet50`, `efficientnet_b0`, `densenet121` |
| `--epochs` | 15 | max training epochs |
| `--batch-size` | 16 | batch size |
| `--lr` | `1e-4` | SGD learning rate |
| `--freeze-backbone` | off | train only the classification head |
| `--patience` | 5 | early stopping epochs |
| `--output` | `./models/model.pth` | where the state dict is saved |
| `--input-size` | 224 | must match `MODEL_INPUT_SIZE` |
| `--positive-class` | `Pneumonia` | the class treated as "abnormal" for sensitivity-based selection |

> Only JPEG/PNG/BMP images can be trained on (PIL loader). Convert DICOM
> series to PNG before training; the API itself still accepts DICOM uploads.

The script **selects the best epoch by validation sensitivity** (recall of
the abnormal class) — not accuracy — because missing a disease is the
critical error in clinical AI (roadmap step 5). The best state dict is saved
to `--output`, and a `model.summary.json` next to it records the full
training history and per-class metrics.

## Evaluation

```bash
python -m app.models.evaluate --model ./models/model.pth \
    --data-dir ./data/chest_xray

python -m app.models.evaluate --model ./models/model.pth \
    --csv ./data/test.csv --images-dir ./data/images --examples 8

# Custom abnormal class (e.g. when your dataset labels differ)
python -m app.models.evaluate --model ./models/model.pth \
    --data-dir ./data/chest_xray --positive-class "Lung Opacity"
```

Outputs:

* a human-readable report: sensitivity, specificity, precision, F1, ROC-AUC,
  confusion matrix and per-class metrics;
* `<model>.evaluation.json` for records/audit;
* Grad-CAM example overlays in `evaluation_examples/` for the XAI showcase.

You can also benchmark the *baseline heuristic engine* (no `--model` flag)
to compare, though its saliency map is not a clinical-grade heatmap.

## Enabling the trained model in the API

1. Copy `model.pth` to the path set in `MODEL_PATH` (e.g. `backend/models/model.pth`
   locally, `/app/models/model.pth` in Docker).
2. Restart the backend. The `/api/v1/health` endpoint reports
   `"model_loaded": true` and the engine name; the Settings page shows the
   same. The API will then use CNN + real Grad-CAM instead of the baseline
   heuristic.

## Tests

`backend/tests/test_metrics.py` unit-tests the metrics module (numpy only):

```bash
cd backend
.venv/Scripts/python -m pytest tests/test_metrics.py -q
```
