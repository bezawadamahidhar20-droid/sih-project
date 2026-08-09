"""Unit tests for app.models.metrics (numpy only — no torch required)."""

import numpy as np
import pytest

from app.models.metrics import (
    binary_metrics,
    confusion_matrix,
    multiclass_report,
    roc_auc,
    format_report,
)


class TestConfusionMatrix:
    def test_binary(self):
        y_true = np.array([0, 0, 1, 1, 1])
        y_pred = np.array([0, 1, 1, 1, 0])
        cm = confusion_matrix(y_true, y_pred, 2)
        assert cm.tolist() == [[1, 1], [1, 2]]

    def test_multiclass(self):
        y_true = np.array([0, 1, 2, 2])
        y_pred = np.array([0, 1, 1, 2])
        cm = confusion_matrix(y_true, y_pred, 3)
        assert cm.tolist() == [[1, 0, 0], [0, 1, 0], [0, 1, 1]]


class TestBinaryMetrics:
    def test_perfect_classifier(self):
        y_true = np.array([0, 0, 1, 1])
        y_score = np.array([[0.9, 0.1], [0.95, 0.05], [0.1, 0.9], [0.2, 0.8]])
        m = binary_metrics(y_true, y_score)
        assert m["accuracy"] == 1.0
        assert m["sensitivity"] == 1.0
        assert m["specificity"] == 1.0
        assert m["false_negative"] == 0
        assert m["auc"] == 1.0

    def test_sensitivity_measures_missed_disease(self):
        # 3 abnormal, 1 classified as normal -> sensitivity 2/3
        y_true = np.array([1, 1, 1, 0, 0])
        y_pred = np.array([1, 1, 0, 0, 0])
        m = binary_metrics(y_true, y_score=np.ones((5, 2)), y_pred=y_pred)
        assert m["sensitivity"] == pytest.approx(2 / 3)
        assert m["false_negative"] == 1
        assert m["specificity"] == 1.0
        assert m["precision"] == 1.0

    def test_specificity(self):
        y_true = np.array([0, 0, 0, 1])
        y_pred = np.array([0, 0, 1, 1])
        m = binary_metrics(y_true, y_score=np.ones((4, 2)), y_pred=y_pred)
        assert m["specificity"] == pytest.approx(2 / 3)
        assert m["false_positive"] == 1

    def test_empty_protection(self):
        m = binary_metrics(np.array([], dtype=int), np.empty((0, 2)))
        assert m["support"] == 0


class TestRocAuc:
    def test_perfect_separation(self):
        y_true = np.array([0, 0, 1, 1])
        y_score = np.array([0.1, 0.2, 0.9, 0.8])
        assert roc_auc(y_true, y_score) == pytest.approx(1.0)

    def test_random_scores(self):
        y_true = np.array([0, 1, 0, 1])
        y_score = np.array([0.5, 0.5, 0.5, 0.5])
        assert roc_auc(y_true, y_score) == pytest.approx(0.5)

    def test_reverse_separation(self):
        y_true = np.array([0, 0, 1, 1])
        y_score = np.array([0.9, 0.8, 0.1, 0.2])
        assert roc_auc(y_true, y_score) == pytest.approx(0.0)


class TestMulticlassReport:
    def test_macro_average(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred = np.array([0, 0, 1, 1])
        report = multiclass_report(y_true, y_pred, ["Normal", "Pneumonia"])
        assert report["Normal"]["precision"] == 1.0
        assert report["Pneumonia"]["recall"] == 1.0
        assert report["macro_avg"]["f1"] == pytest.approx(1.0)

    def test_supports_are_correct(self):
        y_true = np.array([0, 0, 0, 1])
        y_pred = np.array([0, 0, 1, 1])
        report = multiclass_report(y_true, y_pred, ["Normal", "Pneumonia"])
        assert report["Normal"]["support"] == 3
        assert report["Pneumonia"]["support"] == 1


class TestFormatReport:
    def test_renders_string(self):
        y_true = np.array([0, 1, 1])
        y_score = np.array([[0.8, 0.2], [0.3, 0.7], [0.4, 0.6]])
        m = binary_metrics(y_true, y_score)
        report = multiclass_report(y_true, y_score.argmax(1), ["Normal", "Pneumonia"])
        text = format_report(report, binary=m)
        assert "Sensitivity / recall" in text
        assert "Pneumonia" in text
