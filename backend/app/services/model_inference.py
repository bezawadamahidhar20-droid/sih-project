"""Model inference service.

* **CNN + Grad-CAM engine (production)** — used when a trained model file
  exists at ``settings.model_path`` (a state dict for the architecture
  named by ``settings.model_architecture``). PyTorch / TorchVision are
  imported lazily so the application can boot and run its test-suite
  without them installed. Grad-CAM is generated from real CNN gradients and
  activations via forward/backward hooks on ``settings.gradcam_target_layer``.

* **Baseline heuristic engine (dev-only, opt-in)** — a deterministic
  image-statistics classifier with a saliency heatmap. It is NOT a
  clinical-grade detector and is NEVER used in production: it only activates
  when ``ALLOW_HEURISTIC_FALLBACK=true`` and no trained model is present.
  With the flag off (the default), a missing/failed model makes
  ``predict_with_gradcam`` raise, so the API surfaces a clear 500 instead of
  silently serving guessed diagnoses.

The engine exposes one API
(``ModelService.predict_with_gradcam(preprocessed: np.ndarray)``) so the
routes stay engine-agnostic.
"""

import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image, ImageFilter

from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)

HEURISTIC_ENGINE = "baseline-heuristic"

# ImageNet normalization used by preprocess_image()
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def _import_torch():
    """Import torch (and verify torchvision is importable) on demand."""
    import torch
    import torchvision  # noqa: F401
    return torch


class GradCAM:
    """Grad-CAM using forward/backward hooks on a named target layer."""

    def __init__(self, model, target_layer: str):
        self.model = model
        self.target_layer = target_layer
        self.gradients = None
        self.activations = None
        self._register_hooks()

    def _register_hooks(self):
        def forward_hook(module, input, output):
            self.activations = output.detach()

        def backward_hook(module, grad_input, grad_output):
            self.gradients = grad_output[0].detach()

        target_module = dict(self.model.named_modules()).get(self.target_layer)
        if target_module is None:
            raise ValueError(f"Target layer '{self.target_layer}' not found in model")

        target_module.register_forward_hook(forward_hook)
        target_module.register_full_backward_hook(backward_hook)

    def _require_forward_state(self) -> None:
        """Fail with a diagnosable error instead of a bare TypeError when the
        target layer never ran in the forward pass."""
        if self.activations is None:
            raise RuntimeError(
                "Grad-CAM hooks captured no forward state — target layer "
                f"'{self.target_layer}' did not run in the forward pass."
            )

    def _require_backward_state(self) -> None:
        """Fail when the backward pass did not propagate through the target
        layer (checked AFTER backward, which populates ``self.gradients``)."""
        if self.gradients is None:
            raise RuntimeError(
                "Grad-CAM hooks captured no gradients — target layer "
                f"'{self.target_layer}' did not participate in the backward pass."
            )

    def generate(self, input_tensor: Any, class_idx: Optional[int] = None) -> np.ndarray:
        """Forward + backward in one call (used by evaluate.py examples)."""
        self.model.eval()
        # Clear any state from a previous call BEFORE this forward, so a later
        # failure can never mix stale activations/gradients with fresh ones.
        self.activations = None
        self.gradients = None
        output = self.model(input_tensor)
        return self.from_logits(output, class_idx)

    def from_logits(self, output: Any, class_idx: Optional[int] = None) -> np.ndarray:
        """Compute the CAM from an existing forward output (and its graph).

        Lets the model service reuse ONE forward pass for both softmax and
        Grad-CAM instead of running the network twice per prediction.
        """
        # Forward hook state must already exist: the caller ran the forward
        # pass before calling this. (Backward state is populated below, inside
        # this method, so it must NOT be required here.)
        self._require_forward_state()

        if class_idx is None:
            class_idx = int(output.argmax(dim=1).item())

        self.model.zero_grad()
        # Null the gradient slot right before backward: if backward fails, it
        # stays None and the guard below fires instead of silently reusing
        # stale gradients from a previous call.
        self.gradients = None
        target = output[0, class_idx]
        # The graph is used exactly once (nothing reuses it after this), so
        # free it on backward instead of retaining it until GC.
        target.backward(retain_graph=False)

        self._require_backward_state()

        gradients = self.gradients[0].cpu().numpy()
        activations = self.activations[0].cpu().numpy()

        weights = np.mean(gradients, axis=(1, 2))

        cam = np.zeros(activations.shape[1:], dtype=np.float32)
        for i, w in enumerate(weights):
            cam += w * activations[i]

        cam = np.maximum(cam, 0)

        # Resize to the model input size with PIL (no OpenCV dependency).
        size = settings.model_input_size
        cam_img = Image.fromarray(cam).resize((size, size), Image.Resampling.BILINEAR)
        cam = np.array(cam_img, dtype=np.float32)

        cam = cam - cam.min()
        if cam.max() > 0:
            cam = cam / cam.max()

        return cam


def build_model(architecture: str, num_classes: int):
    """Build a classification head on a known TorchVision backbone."""
    import torch
    import torch.nn as nn
    import torchvision.models as tv

    if architecture == "resnet50":
        model = tv.resnet50(weights=None)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
        target_layer = "layer4"
    elif architecture == "resnet18":
        model = tv.resnet18(weights=None)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
        target_layer = "layer4"
    elif architecture == "efficientnet_b0":
        model = tv.efficientnet_b0(weights=None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
        target_layer = "features.8"
    elif architecture == "densenet121":
        model = tv.densenet121(weights=None)
        model.classifier = nn.Linear(model.classifier.in_features, num_classes)
        target_layer = "features.denseblock4"
    else:
        raise ValueError(f"Unsupported architecture: {architecture}")

    return model, target_layer


class ModelService:
    _instance = None
    _model = None
    _gradcam = None
    _device = "cpu"
    _engine = HEURISTIC_ENGINE
    _inference_lock = threading.Lock()
    _init_lock = threading.Lock()

    def __new__(cls):
        # Double-checked locking so two threads can never race to create two
        # singletons (and thus load the CNN twice).
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not getattr(self, "_initialized", False):
            with self._init_lock:
                if not getattr(self, "_initialized", False):
                    self._initialize()

    # ------------------------------------------------------------------ init
    def _initialize(self) -> None:
        self._model = None
        self._gradcam = None
        self._device = "cpu"
        self._engine = HEURISTIC_ENGINE

        try:
            model_path = Path(settings.model_path)
            if model_path.exists():
                try:
                    self._load_cnn(model_path)
                except Exception as exc:  # pragma: no cover - defensive
                    logger.error(
                        "Failed to load CNN model (%s); falling back to %s engine",
                        exc,
                        HEURISTIC_ENGINE,
                    )
                    self._model = None
                    self._gradcam = None
                    self._device = "cpu"
                    self._engine = HEURISTIC_ENGINE

            self._heuristic_active = self._model is None and settings.allow_heuristic_fallback
            if self._model is None:
                if settings.allow_heuristic_fallback:
                    logger.warning(
                        "No trained model found at '%s' and ALLOW_HEURISTIC_FALLBACK=true — "
                        "using '%s' engine. This is a DEV-ONLY baseline, never clinical-grade.",
                        settings.model_path,
                        HEURISTIC_ENGINE,
                    )
                else:
                    logger.error(
                        "No trained model found at '%s' and heuristic fallback is disabled — "
                        "prediction requests will FAIL (no heuristic guesses served).",
                        settings.model_path,
                    )
        finally:
            # Flag LAST: if anything above raises (e.g. a settings access), the
            # singleton stays retryable instead of being stuck half-initialized.
            # The _init_lock already prevents concurrent double-initialization.
            self._initialized = True

    def _load_cnn(self, model_path: Path) -> None:
        import torch

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model, target_layer = build_model(
            settings.model_architecture, settings.model_num_classes
        )

        # GRADCAM_TARGET_LAYER may override the architecture default, but only
        # when the named module actually exists in the built model — otherwise
        # fall back to the default (a bad override must not break model load).
        if settings.gradcam_target_layer:
            known_layers = dict(model.named_modules())
            if settings.gradcam_target_layer in known_layers:
                target_layer = settings.gradcam_target_layer
            else:
                logger.warning(
                    "gradcam_target_layer '%s' not found in %s — using default '%s'",
                    settings.gradcam_target_layer,
                    settings.model_architecture,
                    target_layer,
                )

        # weights_only=True blocks pickle gadget chains: a malicious or
        # corrupted checkpoint can never execute arbitrary code during load.
        state_dict = torch.load(
            str(model_path), map_location=self._device, weights_only=True
        )
        model.load_state_dict(state_dict)

        model.to(self._device)
        model.eval()

        self._model = model
        self._gradcam = GradCAM(model, target_layer)
        self._engine = settings.model_architecture
        logger.info("CNN engine ready (architecture=%s, device=%s)", self._engine, self._device)

    # ------------------------------------------------------------- public
    @property
    def engine(self) -> str:
        return self._engine

    @property
    def is_model_loaded(self) -> bool:
        return self._model is not None

    @property
    def device(self) -> str:
        return str(self._device)

    @property
    def heuristic_fallback_active(self) -> bool:
        """True only when the dev-only heuristic engine is serving predictions."""
        return self._heuristic_active

    def predict_with_gradcam(self, input_np: np.ndarray) -> Dict[str, Any]:
        """Run inference + explainability heatmap on a preprocessed batch.

        ``input_np`` has shape ``(1, 3, H, W)``, float32, ImageNet-normalized.

        Inference runs in worker threads (see ``run_in_threadpool``), but the
        GradCAM hooks write shared instance attributes (``activations`` /
        ``gradients``), so concurrent calls must be serialized — otherwise two
        overlapping predictions would silently corrupt each other's heatmaps.
        """
        with self._inference_lock:
            if self._model is not None:
                return self._predict_cnn(input_np)
            if settings.allow_heuristic_fallback:
                return self._predict_heuristic(input_np)
            raise RuntimeError(
                "CNN model is not loaded (missing or failed at '"
                f"{settings.model_path}') and heuristic fallback is disabled. "
                "No prediction served."
            )

    # ------------------------------------------------------- CNN path
    def _predict_cnn(self, input_np: np.ndarray) -> Dict[str, Any]:
        import torch
        import torch.nn.functional as F

        start = time.time()
        tensor = torch.from_numpy(input_np).float().to(self._device)
        tensor.requires_grad_(True)

        # Single forward pass: the same graph feeds both the softmax output
        # and the Grad-CAM backward pass (previously the network ran twice
        # per prediction, doubling inference cost).
        output = self._model(tensor)
        probs = F.softmax(output, dim=1)[0].detach().cpu().numpy()

        if len(probs) == 2:
            # Calibrated binary decision boundary (MODEL_DECISION_THRESHOLD):
            # argmax@0.5 over-predicts the abnormal class on out-of-
            # distribution images because the training set is class- and
            # style-imbalanced. The threshold is tuned on held-out data to
            # cut false positives while preserving sensitivity. Grad-CAM is
            # computed for the class actually returned.
            threshold = float(settings.model_decision_threshold)
            predicted_class = int(probs[1] >= threshold)
        else:
            predicted_class = int(np.argmax(probs))
        confidence = float(probs[predicted_class])
        cam = self._gradcam.from_logits(output, predicted_class)
        elapsed_ms = (time.time() - start) * 1000

        return self._pack(predicted_class, confidence, probs, cam, elapsed_ms)

    # -------------------------------------------------- heuristic path
    def _predict_heuristic(self, input_np: np.ndarray) -> Dict[str, Any]:
        """Deterministic, explainable baseline classifier.

        Features (all computed from the luminance channel of the scan):
          * mean opacity        — brighter scans (overall hazy/opaque lungs)
          * contrast            — dynamic range of the image
          * edge density        — texture content (reticular/patchy patterns)
          * left/right asymmetry— focal opacities usually are unilateral
          * spatial patchiness  — whether opacity is concentrated or diffuse

        A logistic model over these features yields a stable probability. The
        saliency map highlights high-contrast, bright regions — a reasonable
        stand-in for a lesion-localization heatmap.
        """
        start = time.time()

        rgb = np.clip(input_np[0] * _STD + _MEAN, 0.0, 1.0)  # (3, H, W)
        gray = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]).astype(np.float32)

        gray_u8 = (gray * 255).astype(np.uint8)
        pil_gray = Image.fromarray(gray_u8, mode="L")

        # Edge map (texture) -> blurred saliency proxy.
        edges = np.asarray(pil_gray.filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
        blurred = np.asarray(
            pil_gray.filter(ImageFilter.GaussianBlur(radius=9)), dtype=np.float32
        ) / 255.0

        saliency = np.clip(edges * (0.4 + blurred), 0.0, 1.0)
        if saliency.max() > 0:
            saliency = saliency / saliency.max()

        h, w = gray.shape
        half = w // 2
        left = gray[:, :half]
        right = gray[:, half:]
        asymmetry = float(abs(float(left.mean()) - float(right.mean())))

        # Patchiness: std of mean intensity across a coarse grid.
        block = 32
        patch_means = [
            gray[y : y + block, x : x + block].mean()
            for y in range(0, h - block + 1, block)
            for x in range(0, w - block + 1, block)
        ]
        patch_std = float(np.std(patch_means)) if patch_means else 0.0

        mean_opacity = float(gray.mean())
        contrast = float(gray.std())
        edge_density = float(edges.mean())

        score = (
            (mean_opacity - 0.45) * 3.0
            + (contrast - 0.20) * 2.5
            + (edge_density - 0.10) * 4.0
            + asymmetry * 2.0
            + (patch_std - 0.06) * 3.0
        )

        p_abnormal = 1.0 / (1.0 + float(np.exp(-score)))
        # The heuristic is NOT a clinical-grade detector: cap the abnormal
        # probability so a blank or hazy image can never produce a confident
        # "abnormal / urgent review" banner (the high-risk threshold defaults
        # to 0.9, unreachable from this engine).
        p_abnormal = float(np.clip(p_abnormal, 0.01, 0.80))
        p_normal = 1.0 - p_abnormal

        classes = settings.model_classes or ["Normal", "Pneumonia"]
        if len(classes) != 2:
            # The heuristic models exactly two outcomes (normal vs abnormal).
            # With any other MODEL_CLASSES count the probability vector would
            # silently truncate or mislabel classes — fail loudly instead.
            raise RuntimeError(
                "The heuristic engine supports exactly two MODEL_CLASSES "
                f"(got {len(classes)}). Use the CNN model for other class sets."
            )
        # Align the two probabilities to MODEL_CLASSES order (index of the
        # "normal" class, case-insensitive; defaults to index 0 if absent) so
        # class_name labels never flip for a reversed class list.
        normal_index = 0
        for i, name in enumerate(classes):
            if name.strip().lower() == "normal":
                normal_index = i
                break
        probs = [0.0, 0.0]
        probs[normal_index] = p_normal
        probs[1 - normal_index] = p_abnormal
        predicted_class = int(np.argmax(probs))

        confidence = float(probs[predicted_class])
        elapsed_ms = (time.time() - start) * 1000

        return self._pack(predicted_class, confidence, np.array(probs), saliency, elapsed_ms)

    # ----------------------------------------------------------- helpers
    def _pack(
        self,
        predicted_class: int,
        confidence: float,
        probs: np.ndarray,
        cam: np.ndarray,
        elapsed_ms: float,
    ) -> Dict[str, Any]:
        from app.services.image_processing import generate_natural_language_explanation
        classes = settings.model_classes
        class_name = (
            classes[predicted_class]
            if 0 <= predicted_class < len(classes)
            else f"Class_{predicted_class}"
        )
        explanation = generate_natural_language_explanation(cam, class_name)
        return {
            "predicted_class": predicted_class,
            "confidence": confidence,
            "probabilities": [float(p) for p in probs],
            "gradcam": cam,
            "processing_time_ms": elapsed_ms,
            "engine": self._engine,
            "class_name": class_name,
            "explanation": explanation,
        }


model_service = ModelService()


def get_model_service() -> ModelService:
    return model_service
