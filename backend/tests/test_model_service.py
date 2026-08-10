"""Production-safety tests for the model service.

Guarantees the scan/predict path NEVER silently serves hand-written heuristic
diagnoses: with the trained CNN missing or failed and ``ALLOW_HEURISTIC_FALLBACK``
off (the production default), ``predict_with_gradcam`` raises so the API
surfaces a clear 500. The dev-only heuristic engine only answers when the
flag is explicitly enabled.

These tests reach into the singleton's internals but always restore it (and
the real CNN) in ``finally`` so the rest of the suite keeps running against
the trained model.
"""

import numpy as np
import pytest

DUMMY_INPUT = np.zeros((1, 3, 224, 224), dtype=np.float32)


def _simulate_no_model(svc, heuristic_active: bool):
    svc._model = None
    svc._gradcam = None
    svc._engine = __import__("app.services.model_inference", fromlist=["HEURISTIC_ENGINE"]).HEURISTIC_ENGINE
    svc._heuristic_active = heuristic_active


def _restore_real_model(svc):
    svc._initialized = False
    __import__("app.services.model_inference", fromlist=["ModelService"]).ModelService()


class TestNoHeuristicInProduction:
    def test_predict_raises_when_cnn_missing_and_fallback_disabled(self):
        from app.core.config import get_settings
        from app.services import model_inference as mi

        settings = get_settings()
        original_fallback = settings.allow_heuristic_fallback
        svc = mi.get_model_service()

        try:
            settings.allow_heuristic_fallback = False
            _simulate_no_model(svc, heuristic_active=False)

            with pytest.raises(RuntimeError, match="heuristic fallback is disabled"):
                svc.predict_with_gradcam(DUMMY_INPUT)
        finally:
            settings.allow_heuristic_fallback = original_fallback
            _restore_real_model(svc)

        assert svc.is_model_loaded, "singleton must be restored to the real CNN"

    def test_heuristic_served_only_when_explicitly_allowed(self):
        from app.core.config import get_settings
        from app.services import model_inference as mi

        settings = get_settings()
        original_fallback = settings.allow_heuristic_fallback
        svc = mi.get_model_service()

        try:
            settings.allow_heuristic_fallback = True
            _simulate_no_model(svc, heuristic_active=True)

            result = svc.predict_with_gradcam(DUMMY_INPUT)
            assert result["engine"] == mi.HEURISTIC_ENGINE
            assert set(result) >= {
                "predicted_class", "confidence", "probabilities", "gradcam",
            }
            assert result["gradcam"].shape == (settings.model_input_size, settings.model_input_size)
        finally:
            settings.allow_heuristic_fallback = original_fallback
            _restore_real_model(svc)

        assert svc.is_model_loaded, "singleton must be restored to the real CNN"
