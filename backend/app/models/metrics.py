"""Model evaluation metrics (numpy-only, no torch dependency).

These helpers back both the training loop (``train.py``) and the clinical
validation script (``evaluate.py``). They are deliberately dependency-free
so they can be unit-tested and reused anywhere in the backend.

Clinical note (roadmap step 5): in diagnostic AI, missing a disease (a False
Negative) is the critical failure mode. Every binary report therefore exposes
**sensitivity/recall of the positive class** and **specificity** explicitly,
and the training script uses sensitivity as the default model-selection
metric rather than raw accuracy.
"""

from typing import Dict, List, Optional, Sequence

import numpy as np


def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, num_classes: int) -> np.ndarray:
    """Return an NxN confusion matrix. Row = true class, column = predicted."""
    y_true = np.asarray(y_true, dtype=np.int64)
    y_pred = np.asarray(y_pred, dtype=np.int64)
    cm = np.zeros((num_classes, num_classes), dtype=np.int64)
    np.add.at(cm, (y_true, y_pred), 1)
    return cm


def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    return float(numerator / denominator) if denominator > 0 else default


def binary_metrics(
    y_true: Sequence[int],
    y_score: Sequence[float],
    y_pred: Optional[Sequence[int]] = None,
    positive_index: int = 1,
) -> Dict[str, float]:
    """Binary classification metrics focused on the *positive* class.

    ``positive_index`` identifies the abnormal class in the probability
    vector (default 1 — matching ``["Normal", "Pneumonia"]``). Sensitivity
    (recall) is the recall of the positive class.
    """
    y_true = np.asarray(y_true, dtype=np.int64)
    y_score = np.asarray(y_score, dtype=np.float64)

    # Default hard prediction = argmax of the two-class score vector.
    if y_pred is None:
        y_pred = (y_score[:, positive_index] > 0.5).astype(np.int64)

    pos = positive_index
    cm = confusion_matrix(y_true, y_pred, 2)
    tn, fp, fn, tp = cm[0, 0], cm[0, 1], cm[1, 0], cm[1, 1]

    sensitivity = _safe_div(tp, tp + fn)  # recall of the positive class
    specificity = _safe_div(tn, tn + fp)
    precision = _safe_div(tp, tp + fp)
    f1 = _safe_div(2 * precision * sensitivity, precision + sensitivity)
    accuracy = _safe_div(tp + tn, tp + tn + fp + fn)
    balanced_accuracy = (sensitivity + specificity) / 2.0

    return {
        "accuracy": accuracy,
        "balanced_accuracy": balanced_accuracy,
        "precision": precision,
        "sensitivity": sensitivity,  # recall of abnormal class (roadmap focus)
        "recall": sensitivity,
        "specificity": specificity,
        "f1": f1,
        "auc": roc_auc(y_true, y_score[:, positive_index]),
        "true_positive": int(tp),
        "false_negative": int(fn),  # critical: missed diseases
        "false_positive": int(fp),
        "true_negative": int(tn),
        "support": int(len(y_true)),
    }


def roc_auc(y_true: Sequence[int], y_score: Sequence[float]) -> float:
    """Area under the ROC curve computed with the trapezoid rule.

    Handles tied scores by grouping samples with identical scores so each
    distinct threshold contributes exactly once (standard practice).
    """
    y_true = np.asarray(y_true, dtype=np.float64)
    y_score = np.asarray(y_score, dtype=np.float64)

    if len(y_true) == 0:
        return 0.0

    order = np.argsort(-y_score, kind="mergesort")
    y_true_sorted = y_true[order]
    score_sorted = y_score[order]

    pos_total = float(y_true_sorted.sum())
    neg_total = float(len(y_true_sorted) - pos_total)
    if pos_total == 0 or neg_total == 0:
        return 0.5  # degenerate: no separation possible

    tps, fps = 0.0, 0.0
    auc = 0.0
    prev_tpr, prev_fpr = 0.0, 0.0
    i = 0
    n = len(y_true_sorted)

    while i < n:
        # Gather the whole group of tied scores.
        j = i
        while j < n and score_sorted[j] == score_sorted[i]:
            tps += y_true_sorted[j]
            fps += 1 - y_true_sorted[j]
            j += 1
        tpr = tps / pos_total
        fpr = fps / neg_total
        # Trapezoid over this threshold step.
        auc += (fpr - prev_fpr) * (tpr + prev_tpr) / 2.0
        prev_tpr, prev_fpr = tpr, fpr
        i = j

    return float(auc)


def multiclass_report(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    class_names: Sequence[str],
) -> Dict[str, Dict[str, float]]:
    """Per-class precision / recall / F1 plus macro averages.

    Returned as ``{class_name: {...}, "macro_avg": {...}}``.
    """
    y_true = np.asarray(y_true, dtype=np.int64)
    y_pred = np.asarray(y_pred, dtype=np.int64)
    num_classes = len(class_names)

    cm = confusion_matrix(y_true, y_pred, num_classes)
    report: Dict[str, Dict[str, float]] = {}

    precision_sum = recall_sum = f1_sum = 0.0
    counted = 0

    for i, name in enumerate(class_names):
        tp = int(cm[i, i])
        fp = int(cm[:, i].sum()) - tp
        fn = int(cm[i, :].sum()) - tp
        precision = _safe_div(tp, tp + fp)
        recall = _safe_div(tp, tp + fn)
        f1 = _safe_div(2 * precision * recall, precision + recall)

        report[name] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": int(cm[i, :].sum()),
        }
        precision_sum += precision
        recall_sum += recall
        f1_sum += f1
        counted += 1

    report["macro_avg"] = {
        "precision": precision_sum / max(counted, 1),
        "recall": recall_sum / max(counted, 1),
        "f1": f1_sum / max(counted, 1),
    }
    return report


def format_report(
    report: Dict[str, Dict[str, float]],
    binary: Optional[Dict[str, float]] = None,
) -> str:
    """Render a human-readable table of the report dicts."""
    lines: List[str] = []
    if binary:
        lines.append("Binary metrics (positive = abnormal class)")
        lines.append("-" * 46)
        rows = [
            ("Accuracy", binary.get("accuracy")),
            ("Balanced accuracy", binary.get("balanced_accuracy")),
            ("Sensitivity / recall (abnormal)", binary.get("sensitivity")),
            ("Specificity", binary.get("specificity")),
            ("Precision", binary.get("precision")),
            ("F1", binary.get("f1")),
            ("ROC-AUC", binary.get("auc")),
            ("True positives", binary.get("true_positive")),
            ("False negatives (missed)", binary.get("false_negative")),
            ("False positives", binary.get("false_positive")),
            ("True negatives", binary.get("true_negative")),
        ]
        for label, value in rows:
            if isinstance(value, float):
                lines.append(f"  {label:<34} {value:.4f}")
            else:
                lines.append(f"  {label:<34} {value}")
        lines.append("")

    lines.append("Per-class metrics")
    lines.append("-" * 46)
    lines.append(f"  {'class':<20} {'precision':>10} {'recall':>10} {'f1':>10} {'support':>9}")
    for name, m in report.items():
        if name == "macro_avg":
            continue
        lines.append(
            f"  {name:<20} {m['precision']:>10.4f} {m['recall']:>10.4f} "
            f"{m['f1']:>10.4f} {m['support']:>9d}"
        )
    ma = report.get("macro_avg", {})
    if ma:
        lines.append(
            f"  {'macro_avg':<20} {ma['precision']:>10.4f} {ma['recall']:>10.4f} "
            f"{ma['f1']:>10.4f}"
        )
    return "\n".join(lines)
