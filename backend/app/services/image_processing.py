import pydicom
from pydicom.dataset import Dataset
from pydicom.dataelem import DataElement
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

PHI_TAGS = [
    (0x0010, 0x0010),  # Patient Name
    (0x0010, 0x0020),  # Patient ID
    (0x0010, 0x0030),  # Patient Birth Date
    (0x0010, 0x0040),  # Patient Sex
    (0x0010, 0x1000),  # Other Patient IDs
    (0x0010, 0x1001),  # Other Patient Names
    (0x0010, 0x2160),  # Ethnic Group
    (0x0010, 0x4000),  # Patient Comments
    (0x0008, 0x0050),  # Accession Number
    (0x0008, 0x0080),  # Institution Name
    (0x0008, 0x0090),  # Referring Physician Name
    (0x0008, 0x1040),  # Institutional Department Name
    (0x0008, 0x1050),  # Performing Physician Name
    (0x0008, 0x1060),  # Name of Physician Reading Study
    (0x0008, 0x1070),  # Operators Name
    (0x0010, 0x0021),  # Issuer of Patient ID
    (0x0010, 0x1010),  # Patient Age
    (0x0010, 0x1020),  # Patient Size
    (0x0010, 0x1030),  # Patient Weight
    (0x0010, 0x2180),  # Occupation
    (0x0010, 0x21B0),  # Additional Patient History
    (0x0032, 0x1032),  # Requesting Physician
    (0x0032, 0x1060),  # Requested Procedure Description
    (0x0040, 0x0275),  # Request Attributes Sequence
]

SAFE_TAGS = [
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
    (0x0020, 0x000D),  # Study Instance UID
    (0x0020, 0x000E),  # Series Instance UID
    (0x0020, 0x0010),  # Study ID
    (0x0020, 0x0011),  # Series Number
    (0x0020, 0x0013),  # Instance Number
    (0x0028, 0x0010),  # Rows
    (0x0028, 0x0011),  # Columns
    (0x0028, 0x0100),  # Bits Allocated
    (0x0028, 0x0101),  # Bits Stored
    (0x0028, 0x0102),  # High Bit
    (0x0028, 0x0103),  # Pixel Representation
]


def anonymize_dicom(dataset: Dataset) -> Dataset:
    anonymized = dataset.copy()
    
    for tag in PHI_TAGS:
        if tag in anonymized:
            elem = anonymized[tag]
            if elem.VR in ['PN', 'LO', 'SH', 'ST', 'LT', 'UT', 'DA', 'TM', 'DT', 'AS', 'IS', 'DS']:
                if elem.VR == 'PN':
                    elem.value = "ANONYMIZED"
                elif elem.VR in ['DA', 'DT']:
                    elem.value = "19000101"
                elif elem.VR == 'TM':
                    elem.value = "000000"
                else:
                    elem.value = "REDACTED"
    
    if (0x0010, 0x0010) in anonymized:
        anonymized.PatientName = "ANONYMIZED"
    if (0x0010, 0x0020) in anonymized:
        anonymized.PatientID = "ANONYMIZED"
    
    return anonymized


def extract_dicom_metadata(dataset: Dataset) -> Dict[str, Any]:
    metadata = {}
    for tag in SAFE_TAGS:
        if tag in dataset:
            elem = dataset[tag]
            metadata[elem.keyword] = str(elem.value) if elem.value else None
    return metadata


def dicom_to_pil(dataset: Dataset) -> Image.Image:
    pixel_array = dataset.pixel_array

    if pixel_array.ndim == 3:
        if pixel_array.shape[-1] in [3, 4]:
            # Already RGB(A) — no rescale windowing applies.
            return Image.fromarray(normalize_pixel_array(pixel_array))
        pixel_array = pixel_array[0]

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


def load_image(file_path: str) -> Tuple[Image.Image, Optional[Dict[str, Any]]]:
    ext = os.path.splitext(file_path)[1].lower()
    metadata = None
    
    if ext in ['.dcm', '.dicom']:
        dataset = pydicom.dcmread(file_path)
        metadata = extract_dicom_metadata(dataset)
        dataset = anonymize_dicom(dataset)
        image = dicom_to_pil(dataset)
    else:
        image = Image.open(file_path).convert('RGB')
    
    return image, metadata


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