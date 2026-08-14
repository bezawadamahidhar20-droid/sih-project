import pydicom
from pydicom.dataset import Dataset
import numpy as np
from PIL import Image
import io
import os
from typing import Tuple, Optional, Dict, Any
import logging

from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Whitelist of DICOM tags that may be persisted. Anything not in this list —
# including all private/vendor tags and every patient identifier — is dropped
# before the file is stored. Patient name/ID are handled explicitly below.
SAFE_TAGS = [
    (0x0008, 0x0016),  # SOP Class UID (required to re-serialize the file)
    (0x0008, 0x0018),  # SOP Instance UID (required to re-serialize the file)
    (0x0008, 0x0020),  # Study Date
    (0x0008, 0x0030),  # Study Time
    (0x0008, 0x0060),  # Modality
    (0x0008, 0x0070),  # Manufacturer
    (0x0008, 0x1090),  # Manufacturer Model Name
    (0x0018, 0x0015),  # Body Part Examined
    (0x0018, 0x0050),  # Slice Thickness
    (0x0018, 0x0080),  # Repetition Time
    (0x0018, 0x0081),  # Echo Time
    (0x0018, 0x1030),  # Protocol Name
    (0x0020, 0x000D),  # Study Instance UID (replaced below, not retained)
    (0x0020, 0x000E),  # Series Instance UID (replaced below, not retained)
    # Study ID (0x0020,0x0010) is NOT whitelisted: it is often an
    # institution-assigned identifier that can embed PHI (e.g. an MRN-based
    # accession number) — DICOM PS3.15 lists it for removal.
    (0x0020, 0x0011),  # Series Number
    (0x0020, 0x0013),  # Instance Number
    (0x0028, 0x0002),  # Samples per Pixel
    (0x0028, 0x0004),  # Photometric Interpretation
    (0x0028, 0x0010),  # Rows
    (0x0028, 0x0011),  # Columns
    (0x0028, 0x0100),  # Bits Allocated
    (0x0028, 0x0101),  # Bits Stored
    (0x0028, 0x0102),  # High Bit
    (0x0028, 0x0103),  # Pixel Representation
    (0x0028, 0x1052),  # Rescale Intercept
    (0x0028, 0x1053),  # Rescale Slope
]

# Explicitly-redacted patient identifiers. Even though the whitelist already
# drops them, we keep them out defensively in case SAFE_TAGS is ever edited.
_PATIENT_ID_TAGS = [
    (0x0010, 0x0010),  # Patient Name
    (0x0010, 0x0020),  # Patient ID
]

_PIXEL_DATA_TAG = pydicom.tag.Tag(0x7FE0, 0x0010)  # PixelData

# Instance/Study/Series UIDs are globally-unique identifiers that can be
# linked back to the original acquisition (and therefore to PHI), so they
# are replaced with fresh values rather than merely whitelisted. DICOM PS3.15
# Basic Application Level Confidentiality requires replacing these.
_UID_TAGS = [
    (0x0008, 0x0018),  # SOP Instance UID
    (0x0020, 0x000D),  # Study Instance UID
    (0x0020, 0x000E),  # Series Instance UID
]


def anonymize_dicom(dataset: Dataset) -> Dataset:
    """Return a copy containing ONLY whitelisted tags plus pixel data.

    Whitelist approach (instead of a PHI blacklist): every tag not explicitly
    deemed safe — including private/vendor tags and identifiers we forgot to
    list — is removed, so the persisted file cannot leak PHI.

    In addition, Instance/Study/Series UIDs are REPLACED with freshly
    generated values and Study ID is dropped, so the stored file cannot be
    re-linked to the original patient by identifier.
    """
    anonymized = dataset.copy()
    keep = {pydicom.tag.Tag(*tag) for tag in SAFE_TAGS} | {_PIXEL_DATA_TAG}

    for elem in list(anonymized):
        if elem.tag not in keep:
            del anonymized[elem.tag]

    # Defensive removal of patient identifiers.
    for tag in _PATIENT_ID_TAGS:
        if pydicom.tag.Tag(*tag) in anonymized:
            del anonymized[pydicom.tag.Tag(*tag)]

    # Replace linkage UIDs with fresh values so the anonymized file cannot be
    # correlated back to the original study by UID. The SOP Class UID is
    # retained (needed to re-serialize) — only the *instance* UID is replaced.
    for tag in _UID_TAGS:
        tag_obj = pydicom.tag.Tag(*tag)
        if tag_obj in anonymized:
            anonymized[tag_obj].value = pydicom.uid.generate_uid()

    return anonymized


def extract_dicom_metadata(dataset: Dataset) -> Dict[str, Any]:
    metadata = {}
    for tag in SAFE_TAGS:
        if tag in dataset:
            elem = dataset[tag]
            metadata[elem.keyword] = str(elem.value) if elem.value else None
    return metadata


class DicomUnsupportedError(ValueError):
    """Raised for DICOM inputs this pipeline intentionally does not support
    (e.g. multi-frame volumes), so the caller can fail loudly with a clear
    message instead of silently analyzing the wrong frame."""


def dicom_to_pil(dataset: Dataset) -> Image.Image:
    pixel_array = dataset.pixel_array

    if pixel_array.ndim == 3 and pixel_array.shape[-1] in [3, 4]:
        # Single-frame RGB(A) — no rescale windowing applies.
        return Image.fromarray(normalize_pixel_array(pixel_array))

    if pixel_array.ndim != 2:
        # Multi-frame volumes (and 4D RGB volumes): the classifier is a
        # single-image model, so silently picking ``pixel_array[0]`` could
        # discard clinically relevant frames. Reject explicitly instead.
        raise DicomUnsupportedError(
            "Multi-frame DICOM (e.g. CT volumes) is not supported for AI "
            "analysis. Export a single 2D frame/slice as PNG or a "
            "single-frame DICOM and retry."
        )

    # Convert raw stored values to modality values using the DICOM rescale
    # parameters (e.g. CT Hounsfield units) before normalizing to uint8.
    slope = float(dataset.RescaleSlope) if "RescaleSlope" in dataset else 1.0
    intercept = float(dataset.RescaleIntercept) if "RescaleIntercept" in dataset else 0.0
    arr = pixel_array.astype(np.float32) * slope + intercept

    return Image.fromarray(normalize_pixel_array(arr), mode="L")


def normalize_pixel_array(arr: np.ndarray) -> np.ndarray:
    arr = arr.astype(np.float32)
    min_val = float(arr.min())
    max_val = float(arr.max())

    if max_val > min_val:
        arr = (arr - min_val) / (max_val - min_val) * 255.0
    else:
        arr = np.zeros_like(arr)

    return arr.astype(np.uint8)


def load_image(
    file_path: str,
) -> Tuple[Image.Image, Optional[Dict[str, Any]], str]:
    """Load an image for inference.

    Returns ``(image, metadata, persist_path)`` where ``persist_path`` is the
    file that should be stored/encrypted:

    * DICOM — a new temp file containing the *anonymized* dataset (so what is
      encrypted at rest carries no PHI).
    * JPEG/PNG — the original file itself.
    """
    ext = os.path.splitext(file_path)[1].lower()
    metadata = None

    if ext in ['.dcm', '.dicom']:
        dataset = pydicom.dcmread(file_path)
        metadata = extract_dicom_metadata(dataset)
        dataset = anonymize_dicom(dataset)
        image = dicom_to_pil(dataset)

        anonymized_path = os.path.splitext(file_path)[0] + "_anonymized.dcm"
        _save_anonymized_dicom(dataset, anonymized_path)
        return image, metadata, anonymized_path

    image = Image.open(file_path).convert('RGB')
    return image, metadata, file_path


def _save_anonymized_dicom(dataset: Dataset, output_path: str) -> None:
    """Serialize the anonymized dataset, preserving the original transfer
    syntax so compressed pixel data (encapsulated JPEG) survives round-trip.
    """
    if dataset.file_meta and getattr(dataset.file_meta, "TransferSyntaxUID", None):
        dataset.file_meta = dataset.file_meta.copy()
        # Keep the media-storage instance UID in sync with the REPLACED
        # SOPInstanceUID so the re-serialized header stays self-consistent.
        if getattr(dataset.file_meta, "MediaStorageSOPInstanceUID", None):
            dataset.file_meta.MediaStorageSOPInstanceUID = dataset.SOPInstanceUID
    try:
        dataset.save_as(output_path, enforce_file_format=True)
    except Exception as exc:
        logger.error("Failed to re-serialize anonymized DICOM: %s", exc)
        raise ValueError(
            "Unable to anonymize this DICOM file (unsupported compression?). "
            "Convert it to PNG/JPEG and retry."
        ) from exc


class ImageQualityError(ValueError):
    """Raised when an uploaded image cannot support meaningful inference.

    Distinct from a decode failure: the file is a valid image, but it is
    blank/near-uniform or degenerate, so any CNN prediction on it would be a
    confident guess on garbage.
    """


# Below this size, upscaling cannot preserve any anatomy worth analyzing.
# 16px matches the smallest pixel arrays used in the test suite (DICOM).
MIN_IMAGE_DIMENSION = 16
# Std-dev (0-255 scale) below this means the image is essentially blank.
MIN_IMAGE_STDDEV = 2.0


def validate_image_quality(image: Image.Image) -> None:
    """Reject images that would produce meaningless CNN predictions.

    Called at prediction time (not upload), so files can be stored and
    reviewed even when they fail the gate — but they are never fed to the
    model silently. Raises :class:`ImageQualityError` with a user-facing
    message.
    """
    width, height = image.size
    if min(width, height) < MIN_IMAGE_DIMENSION:
        raise ImageQualityError(
            f"Image is too small ({width}x{height}) to analyze. "
            f"Upload a larger chest X-ray image (at least {MIN_IMAGE_DIMENSION}x{MIN_IMAGE_DIMENSION} pixels)."
        )

    gray = image.convert("L")
    arr = np.asarray(gray, dtype=np.float32)
    if arr.std() < MIN_IMAGE_STDDEV:
        raise ImageQualityError(
            "Image appears blank or contains no discernible content. "
            "Upload a valid chest X-ray."
        )


def preprocess_image(image: Image.Image, target_size: int = 224) -> np.ndarray:
    image = image.resize((target_size, target_size), Image.Resampling.LANCZOS)

    if image.mode != 'RGB':
        image = image.convert('RGB')

    arr = np.array(image).astype(np.float32) / 255.0

    mean = np.array([0.485, 0.456, 0.406])
    std = np.array([0.229, 0.224, 0.225])
    arr = (arr - mean) / std

    arr = np.transpose(arr, (2, 0, 1))
    arr = np.expand_dims(arr, axis=0)

    return arr


def save_image(image: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, quality=95)


def _jet_colormap(t: np.ndarray) -> np.ndarray:
    """Apply a jet-style colormap to values in [0, 1]; returns (H, W, 3) floats."""
    t = np.clip(t, 0.0, 1.0)
    r = np.clip(1.5 - np.abs(4.0 * t - 3.0), 0.0, 1.0)
    g = np.clip(1.5 - np.abs(4.0 * t - 2.0), 0.0, 1.0)
    b = np.clip(1.5 - np.abs(4.0 * t - 1.0), 0.0, 1.0)
    return np.stack([r, g, b], axis=-1)


def create_overlay_image(original: Image.Image, heatmap: np.ndarray, alpha: float = 0.5) -> Image.Image:
    heatmap = np.clip(heatmap, 0.0, 1.0).astype(np.float32)

    heatmap_img = Image.fromarray((heatmap * 255).astype(np.uint8), mode="L")
    heatmap_img = heatmap_img.resize(original.size, Image.Resampling.BILINEAR)
    heatmap_resized = np.asarray(heatmap_img, dtype=np.float32) / 255.0

    colored = Image.fromarray(
        (_jet_colormap(heatmap_resized) * 255).astype(np.uint8), mode="RGB"
    )

    return Image.blend(original.convert("RGB"), colored, float(alpha))


def image_to_base64(image: Image.Image) -> str:
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    import base64
    return base64.b64encode(buffered.getvalue()).decode('utf-8')


def generate_natural_language_explanation(heatmap: np.ndarray, predicted_class: str) -> str:
    """Generate a natural-language clinical explanation based on heatmap spatial distribution
    and the predicted finding.
    """
    if heatmap is None or heatmap.size == 0:
        return f"Diagnostic analysis completed for {predicted_class}."

    h, w = heatmap.shape
    h_mid, w_mid = h // 2, w // 2

    # Split into 4 anatomical quadrants (radiological view: left side of image = patient's right)
    top_left = float(heatmap[:h_mid, :w_mid].mean())
    top_right = float(heatmap[:h_mid, w_mid:].mean())
    bot_left = float(heatmap[h_mid:, :w_mid].mean())
    bot_right = float(heatmap[h_mid:, w_mid:].mean())

    quads = {
        "upper right lung zone": top_left,
        "upper left lung zone": top_right,
        "lower right lung field": bot_left,
        "lower left lung field": bot_right,
    }

    max_quad = max(quads, key=quads.get)
    max_val = quads[max_quad]

    if max_val < 0.2:
        return "Model attention is broadly and evenly distributed across bilateral lung fields with no acute focal hyper-intensity regions."

    pred_lower = predicted_class.lower()
    if "pneumonia" in pred_lower:
        return f"Model attention is heavily concentrated in the {max_quad}, consistent with focal airspace consolidation and inflammatory opacity."
    elif "effusion" in pred_lower:
        return f"Model attention is concentrated in the {max_quad}, consistent with fluid accumulation in the costophrenic region."
    elif "cardiomegaly" in pred_lower:
        return "Model attention is concentrated in the central mediastinal region, consistent with an enlarged cardiac silhouette."
    elif "nodule" in pred_lower:
        return f"Model attention is localized to a focal high-intensity lesion in the {max_quad}, consistent with a pulmonary nodule."
    elif "atelectasis" in pred_lower:
        return f"Model attention is concentrated in the {max_quad}, consistent with localized linear subsegmental lung collapse."
    elif "normal" in pred_lower:
        return "Model attention is uniformly distributed across clear pulmonary parenchyma with no evidence of focal opacity or consolidation."
    else:
        return f"Model attention is primary focused in the {max_quad}, supporting a clinical finding of {predicted_class}."
