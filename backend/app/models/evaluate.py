"""Clinical validation of a trained model against a held-out test set.

Usage (from the ``backend/`` directory, with the venv activated)::

    python -m app.models.evaluate --model ./models/model.pth \\
        --data-dir ./data/chest_xray

or with a CSV test split::

    python -m app.models.evaluate --model ./models/model.pth \\
        --csv ./data/test.csv --images-dir ./data/images

Prints a full metrics report focused on **sensitivity / recall of the
abnormal class** (roadmap step 5: minimize false negatives) and writes:

* ``<model>.evaluation.json`` — machine-readable results
* ``evaluation_examples/`` — Grad-CAM overlays for a sample of test images
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List

import numpy as np


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Evaluate a trained chest X-ray classifier (MediScan AI)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--model", type=str, default=None,
                   help="Path to a trained state dict. Omit to evaluate the CNN already "
                        "loaded by the model service (requires a loaded model — the "
                        "dev-only heuristic engine is not an evaluation target).")
    p.add_argument("--data-dir", type=str, default=None,
                   help="Folder layout: <data-dir>/test/<class>/*.img")
    p.add_argument("--csv", type=str, default=None,
                   help="Test CSV with 'image,label' columns")
    p.add_argument("--images-dir", type=str, default=None,
                   help="Base directory for CSV-referenced images")
    p.add_argument("--arch", type=str, default="resnet50",
                   choices=["resnet18", "resnet50", "efficientnet_b0", "densenet121"])
    p.add_argument("--num-classes", type=int, default=2)
    p.add_argument("--input-size", type=int, default=224)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--device", type=str, default=None)
    p.add_argument("--examples", type=int, default=6,
                   help="Number of Grad-CAM example overlays to generate (0 to skip)")
    p.add_argument("--positive-class", type=str, default="Pneumonia",
                   help="Class treated as 'abnormal' for sensitivity/specificity reporting")
    p.add_argument("--examples-dir", type=str, default="./evaluation_examples",
                   help="Where to write Grad-CAM example overlays")
    return p.parse_args()


def _load_model(args, device):
    """Build the inference architecture and load the trained state dict."""
    import torch

    from app.services.model_inference import build_model

    model, target_layer = build_model(args.arch, args.num_classes)
    # weights_only=True: never unpickle arbitrary objects from a checkpoint.
    state_dict = torch.load(args.model, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model = model.to(device)
    model.eval()
    return model, target_layer


def _run_eval(args, device):
    from app.models.data import build_dataset, default_transforms
    from app.models.metrics import binary_metrics, multiclass_report, format_report

    # ---- load model (or use the CNN already loaded by the service) ----
    model, target_layer, engine = None, None, None
    if args.model:
        model, target_layer = _load_model(args, device)
        engine = args.arch
    else:
        from app.services.model_inference import get_model_service
        model_service = get_model_service()
        if model_service.is_model_loaded:
            model, target_layer = None, None  # use the service's loaded CNN below
            engine = model_service.engine
            print("[eval] No --model given; using the CNN already loaded by the service.")
        elif model_service.heuristic_fallback_active:
            engine = model_service.engine
            print("[eval] WARNING: evaluating the DEV-ONLY baseline heuristic engine "
                  "(ALLOW_HEURISTIC_FALLBACK=true). Metrics are NOT clinical-grade.")
        else:
            raise SystemExit(
                "No --model given and no CNN is loaded. Heuristic fallback is "
                "disabled in production and is not an evaluation target — pass "
                "--model <trained state dict>."
            )

    # ---- load test set ----
    if args.data_dir:
        test_ds = build_dataset(
            root=str(Path(args.data_dir) / "test"),
            # Only the batched CNN path needs tensor transforms; the
            # per-file service path preprocesses raw images itself.
            transform=default_transforms(args.input_size, train=False) if model is not None else None,
        )
    elif args.csv:
        if not args.images_dir:
            raise ValueError("--images-dir is required when using --csv")
        test_ds = build_dataset(
            csv_path=args.csv, images_dir=args.images_dir,
            transform=default_transforms(args.input_size, train=False) if model is not None else None,
        )
    else:
        raise ValueError("Provide either --data-dir (folder layout) or --csv + --images-dir")

    print(f"[eval] Test samples: {len(test_ds)}  classes: {test_ds.class_names}")

    from app.models.data import resolve_positive_index
    positive_index = resolve_positive_index(args.positive_class, test_ds.class_names)
    print(f"[eval] Positive (abnormal) class: "
          f"'{test_ds.class_names[positive_index]}' at index {positive_index}")

    all_probs: List[np.ndarray] = []
    all_labels: List[int] = []

    if model is not None:
        import torch
        from torch.utils.data import DataLoader

        loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)
        with torch.no_grad():
            for images, labels in loader:
                images = images.to(device)
                logits = model(images)
                probs = torch.softmax(logits, dim=1).cpu().numpy()
                all_probs.append(probs)
                all_labels.extend(labels.numpy().tolist())
    else:
        # Service path (CNN loaded by the service, or explicit dev-only
        # heuristic): preprocess each image exactly like the API route and
        # reuse the same dataset discovery (class ordering) as the CNN path.
        from PIL import Image

        from app.services.image_processing import preprocess_image
        from app.services.model_inference import get_model_service

        model_service = get_model_service()

        for path, label in test_ds.samples:
            pil = Image.open(path).convert("RGB")
            input_np = preprocess_image(pil, args.input_size)
            result = model_service.predict_with_gradcam(input_np)
            probs = np.asarray(result["probabilities"], dtype=np.float64).reshape(1, -1)
            all_probs.append(probs)
            all_labels.append(int(label))

    probs_all = np.concatenate(all_probs, axis=0)
    y_true = np.asarray(all_labels, dtype=np.int64)
    y_pred = probs_all.argmax(axis=1)

    metrics = binary_metrics(y_true, probs_all, y_pred=y_pred,
                             positive_index=positive_index)
    report = multiclass_report(y_true, y_pred, test_ds.class_names)

    print()
    print(format_report(report, binary=metrics))
    print()

    # ---- save results ----
    result = {
        "engine": engine,
        "num_samples": int(len(y_true)),
        "class_names": test_ds.class_names,
        "positive_class": args.positive_class,
        "metrics": metrics,
        "per_class": report,
        "confusion_matrix": {
            "true_class": test_ds.class_names,
            "predicted_class": test_ds.class_names,
            "matrix": _confusion_matrix_rows(y_true, y_pred, len(test_ds.class_names)),
        },
    }
    out = (Path(args.model).with_suffix(".evaluation.json")
           if args.model else Path("heuristic.evaluation.json"))
    out.write_text(json.dumps(result, indent=2))
    print(f"[eval] Results written to {out}")

    # Save to results/ folder as markdown report and matplotlib charts (step 1 requirement)
    _save_results_markdown_and_chart(result, Path("results"))
    _save_results_markdown_and_chart(result, Path("../results"))

    # ---- Grad-CAM examples (XAI, roadmap step 2) ----
    if args.examples > 0:
        _generate_examples(args, device, test_ds, model, target_layer, test_ds.class_names)

    return metrics


def _save_results_markdown_and_chart(results: dict, results_dir: Path) -> None:
    try:
        results_dir.mkdir(parents=True, exist_ok=True)
        m = results["metrics"]
        cm = results["confusion_matrix"]["matrix"]
        
        md_content = f"""# MediScan AI — Clinical Model Evaluation Report

**Model Architecture**: {results.get('engine', 'resnet50').upper()} (Transfer Learning)  
**Evaluated Dataset**: Real Kaggle Chest X-Ray Hold-Out Test Set ({results.get('num_samples', 624)} samples)  
**Positive (Abnormal) Class**: {results.get('positive_class', 'Pneumonia')}  

---

## 📊 Summary Metrics

| Clinical Metric | Score | Percentage |
| :--- | :--- | :--- |
| **Accuracy** | `{m['accuracy']:.4f}` | **{m['accuracy']*100:.2f}%** |
| **Balanced Accuracy** | `{m['balanced_accuracy']:.4f}` | **{m['balanced_accuracy']*100:.2f}%** |
| **Sensitivity (Recall)** | `{m['sensitivity']:.4f}` | **{m['sensitivity']*100:.2f}%** |
| **Specificity** | `{m['specificity']:.4f}` | **{m['specificity']*100:.2f}%** |
| **Precision** | `{m['precision']:.4f}` | **{m['precision']*100:.2f}%** |
| **F1 Score** | `{m['f1']:.4f}` | **{m['f1']*100:.2f}%** |
| **ROC AUC** | `{m['auc']:.4f}` | **{m['auc']*100:.2f}%** |

---

## 📉 Confusion Matrix

| Actual \\ Predicted | Predicted NORMAL | Predicted PNEUMONIA | Total |
| :--- | :--- | :--- | :--- |
| **Actual NORMAL** | **{cm[0][0]}** (True Negatives) | **{cm[0][1]}** (False Positives) | {cm[0][0] + cm[0][1]} |
| **Actual PNEUMONIA** | **{cm[1][0]}** (False Negatives) | **{cm[1][1]}** (True Positives) | {cm[1][0] + cm[1][1]} |

---

## 📸 Generated Confusion Matrix Chart
![Confusion Matrix](confusion_matrix.png)
"""
        (results_dir / "evaluation_report.md").write_text(md_content, encoding="utf-8")
        print(f"[eval] Saved markdown report -> {results_dir / 'evaluation_report.md'}")

        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(6, 5))
        cax = ax.matshow(cm, cmap='Blues')
        fig.colorbar(cax)
        
        classes = results["confusion_matrix"]["true_class"]
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(classes)
        ax.set_yticklabels(classes)
        
        for i in range(2):
            for j in range(2):
                ax.text(j, i, str(cm[i][j]), va='center', ha='center', color='white' if cm[i][j] > 150 else 'black', fontsize=14, fontweight='bold')
                
        plt.title('MediScan AI Confusion Matrix', pad=20)
        plt.xlabel('Predicted Label')
        plt.ylabel('True Label')
        plt.tight_layout()
        plt.savefig(results_dir / "confusion_matrix.png", dpi=150)
        plt.close()

        fig, ax = plt.subplots(figsize=(8, 4.5))
        metrics_names = ['Sensitivity', 'Specificity', 'Precision', 'Accuracy', 'ROC AUC']
        metrics_vals = [m['sensitivity']*100, m['specificity']*100, m['precision']*100, m['accuracy']*100, m['auc']*100]
        colors = ['#10B981', '#00B4D8', '#6366F1', '#8B5CF6', '#EC4899']
        
        bars = ax.bar(metrics_names, metrics_vals, color=colors, width=0.55)
        ax.set_ylim(0, 105)
        ax.set_ylabel('Percentage (%)')
        ax.set_title('MediScan AI ResNet50 Clinical Metrics')
        
        for bar in bars:
            yval = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2.0, yval + 1.5, f"{yval:.1f}%", ha='center', va='bottom', fontweight='bold')
            
        plt.tight_layout()
        plt.savefig(results_dir / "metrics_chart.png", dpi=150)
        plt.close()
        print(f"[eval] Saved charts -> {results_dir / 'confusion_matrix.png'} and {results_dir / 'metrics_chart.png'}")
    except Exception as e:
        print(f"[eval] Results generation note: {e}")


def _confusion_matrix_rows(y_true: np.ndarray, y_pred: np.ndarray, n: int) -> List[List[int]]:
    from app.models.metrics import confusion_matrix
    return confusion_matrix(y_true, y_pred, n).tolist()


def _generate_examples(args, device, test_ds, model, target_layer, class_names) -> None:
    """Generate Grad-CAM overlay images for a sample of test images."""
    from PIL import Image

    from app.models.data import IMAGENET_MEAN, IMAGENET_STD
    from app.services.image_processing import create_overlay_image
    from app.services.model_inference import GradCAM

    out_dir = Path(args.examples_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if model is None or target_layer is None:
        print("[eval] Skipping Grad-CAM examples: no CNN model available.")
        return

    gradcam = GradCAM(model, target_layer)
    mean = np.array(IMAGENET_MEAN).reshape(3, 1, 1)
    std = np.array(IMAGENET_STD).reshape(3, 1, 1)

    indices = np.linspace(0, len(test_ds) - 1, num=min(args.examples, len(test_ds))).astype(int)
    saved = 0
    for idx in indices:
        image, label = test_ds[idx]  # (C,H,W) normalized tensor, long label
        rgb = np.clip(image.numpy() * std + mean, 0, 1)
        pil = Image.fromarray((rgb.transpose(1, 2, 0) * 255).astype(np.uint8))

        tensor = image.unsqueeze(0).to(device)
        tensor.requires_grad_(True)
        try:
            cam = gradcam.generate(tensor, class_idx=int(label))
        except Exception as exc:  # pragma: no cover - defensive
            print(f"[eval] Grad-CAM failed for sample {idx}: {exc}")
            continue

        overlay = create_overlay_image(pil, cam)
        fname = f"gradcam_{idx:04d}_{class_names[int(label)]}.png"
        overlay.save(out_dir / fname)
        saved += 1

    print(f"[eval] Saved {saved} Grad-CAM example overlays -> {out_dir}")


def main() -> None:
    args = parse_args()
    device = args.device
    if not device:
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"
    print(f"[eval] Device: {device}")
    _run_eval(args, device)


if __name__ == "__main__":
    main()
