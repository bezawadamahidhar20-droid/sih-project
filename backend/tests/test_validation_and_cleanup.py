"""Validation, secure-loading, and cascade-cleanup tests.

* Oversized uploads -> 413 (Content-Length and in-memory size checks)
* Corrupted image content -> 400 (never a 500, never stored)
* Checkpoint loading uses ``weights_only=True`` (no pickle gadgets)
* Deleting a scan removes the prediction row AND all derived/encrypted files
"""

import io
import os

import numpy as np
import pytest
from PIL import Image


def make_png_bytes(size: int = 64) -> bytes:
    rng = np.random.default_rng(7)
    arr = (np.clip(rng.normal(0.5, 0.2, (size, size)), 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(arr, mode="L").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _upload_and_predict(client, auth_headers):
    upload = await client.post(
        "/api/v1/scans/upload",
        files={"file": ("scan.png", make_png_bytes(), "image/png")},
        headers=auth_headers,
    )
    assert upload.status_code == 201
    scan = upload.json()
    predict = await client.post(
        f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
    )
    assert predict.status_code == 200
    return scan, predict.json()


class TestUploadValidation:
    async def test_oversized_upload_rejected_413(self, client, auth_headers, monkeypatch):
        from app.core.config import get_settings

        # Shrink the limit so a tiny file is "oversized" without allocating
        # hundreds of MB in the test.
        monkeypatch.setattr(get_settings(), "max_file_size_mb", 0.000001)  # ~1 byte

        response = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 413
        assert "too large" in response.json()["detail"].lower()

    async def test_corrupted_png_content_rejected_400(self, client, auth_headers):
        # A .png extension with non-image content must be rejected cleanly.
        response = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", b"this is definitely not a png", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 400
        body = response.json()
        assert "detail" in body
        assert "Invalid or corrupted image" in body["detail"]

    async def test_anonymized_patient_id_rejects_oversized_value(self, client, auth_headers):
        response = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            data={"anonymized_patient_id": "P" * 500},
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestSecureCheckpointLoading:
    def test_weights_only_loading_is_used(self):
        """The inference service must load checkpoints with weights_only=True
        so a malicious model file cannot execute pickle gadget chains."""
        import inspect

        from app.services import model_inference as mi

        src = inspect.getsource(mi.ModelService._load_cnn)
        assert "weights_only=True" in src

    def test_actual_checkpoint_loads_with_weights_only(self):
        from pathlib import Path

        import torch

        from app.core.config import get_settings

        path = Path(get_settings().model_path)
        if not path.exists():
            pytest.skip("no trained model checkpoint in this checkout")
        state = torch.load(str(path), map_location="cpu", weights_only=True)
        assert len(state) > 100  # a real ResNet50 state dict


class TestDeleteScanCascade:
    async def test_delete_removes_prediction_and_files(self, client, auth_headers):
        from app.core.config import get_settings

        scan, result = await _upload_and_predict(client, auth_headers)
        prediction_id = result["prediction"]["id"]
        file_hash = scan["file_hash"]

        delete = await client.delete(f"/api/v1/scans/{scan['id']}", headers=auth_headers)
        assert delete.status_code == 204

        # Prediction and scan rows are gone through the API.
        pred = await client.get(f"/api/v1/predictions/{prediction_id}", headers=auth_headers)
        assert pred.status_code == 404
        scan_resp = await client.get(f"/api/v1/scans/{scan['id']}", headers=auth_headers)
        assert scan_resp.status_code == 404

        # Derived images (plaintext + encrypted) gone.
        gradcam_dir = os.path.join(get_settings().upload_dir, "gradcam")
        for stem in (f"original_{file_hash}.png", f"gradcam_{file_hash}.png"):
            assert not os.path.exists(os.path.join(gradcam_dir, stem))
            assert not os.path.exists(os.path.join(gradcam_dir, stem + ".enc"))

        # Encrypted upload gone.
        enc = os.path.join(get_settings().upload_dir, f"{file_hash}.enc")
        assert not os.path.exists(enc)

    async def test_delete_scan_that_never_predicts(self, client, auth_headers):
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=auth_headers,
        )
        scan = upload.json()

        delete = await client.delete(f"/api/v1/scans/{scan['id']}", headers=auth_headers)
        assert delete.status_code == 204

    async def test_delete_returns_404_for_missing(self, client, auth_headers):
        response = await client.delete("/api/v1/scans/99999", headers=auth_headers)
        assert response.status_code == 404

    async def test_staff_cannot_delete(self, client, staff_headers, auth_headers):
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=auth_headers,
        )
        scan = upload.json()

        response = await client.delete(f"/api/v1/scans/{scan['id']}", headers=staff_headers)
        assert response.status_code == 403
