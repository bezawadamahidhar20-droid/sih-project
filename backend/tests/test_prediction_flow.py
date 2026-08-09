"""End-to-end tests for the upload -> predict -> heatmap loop.

These tests exercise the baseline heuristic engine, so they do **not** require
PyTorch or a trained model file to pass.
"""

import io

import numpy as np
from PIL import Image


def make_png_bytes(size: int = 256) -> bytes:
    rng = np.random.default_rng(42)
    arr = (np.clip(rng.normal(0.5, 0.2, (size, size)), 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(arr, mode="L").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestFullPredictionFlow:
    async def test_upload_then_predict_returns_heatmap(self, client, auth_headers):
        png = make_png_bytes()

        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", png, "image/png")},
            headers=auth_headers,
        )
        assert upload.status_code == 201
        scan = upload.json()
        assert scan["status"] == "uploaded"

        predict = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        assert predict.status_code == 200
        data = predict.json()

        pred = data["prediction"]
        assert pred["predicted_class"] in ("Normal", "Pneumonia")
        assert 0.0 <= pred["confidence"] <= 1.0
        assert pred["model_architecture"] == "baseline-heuristic"
        assert set(pred["all_probabilities"].keys()) == {"Normal", "Pneumonia"}
        assert pred["scan"]["id"] == scan["id"]

        assert data["original_image_url"].startswith("/api/v1/predictions/image/original_")
        assert data["gradcam_overlay_url"].startswith("/api/v1/predictions/image/gradcam_")

        # Heatmap file is actually served, authenticated.
        heatmap = await client.get(data["gradcam_overlay_url"], headers=auth_headers)
        assert heatmap.status_code == 200
        assert heatmap.headers.get("content-type", "").startswith("image/png")

        original = await client.get(data["original_image_url"], headers=auth_headers)
        assert original.status_code == 200

    async def test_repeat_predict_is_idempotent(self, client, auth_headers):
        png = make_png_bytes()
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", png, "image/png")},
            headers=auth_headers,
        )
        scan = upload.json()

        first = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        second = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["prediction"]["id"] == second.json()["prediction"]["id"]

    async def test_duplicate_upload_rejected(self, client, auth_headers):
        png = make_png_bytes()
        first = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", png, "image/png")},
            headers=auth_headers,
        )
        assert first.status_code == 201

        second = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", png, "image/png")},
            headers=auth_headers,
        )
        assert second.status_code == 409


class TestImageSecurity:
    async def test_path_traversal_rejected(self, client, auth_headers):
        response = await client.get(
            "/api/v1/predictions/image/..%2F..%2Fapp%2Fcore%2Fsecurity.py",
            headers=auth_headers,
        )
        assert response.status_code == 404

        # httpx normalizes literal "../" segments away, so this must never
        # reach a successful file read either way.
        response = await client.get(
            "/api/v1/predictions/image/../security.py",
            headers=auth_headers,
        )
        assert response.status_code in (404, 422)

    async def test_missing_image_returns_404(self, client, auth_headers):
        response = await client.get(
            "/api/v1/predictions/image/nonexistent.png", headers=auth_headers
        )
        assert response.status_code == 404


class TestFlagForReview:
    async def _upload_and_predict(self, client, auth_headers):
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=auth_headers,
        )
        scan = upload.json()
        predict = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        return predict.json()["prediction"]

    async def test_staff_cannot_flag(self, client, auth_headers, staff_headers):
        pred = await self._upload_and_predict(client, auth_headers)

        response = await client.post(
            f"/api/v1/predictions/{pred['id']}/flag",
            json={"flagged": True},
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_doctor_can_flag_and_unflag(self, client, auth_headers):
        pred = await self._upload_and_predict(client, auth_headers)

        flag = await client.post(
            f"/api/v1/predictions/{pred['id']}/flag",
            json={"flagged": True},
            headers=auth_headers,
        )
        assert flag.status_code == 200
        assert flag.json()["is_flagged"] is True

        unflag = await client.post(
            f"/api/v1/predictions/{pred['id']}/flag",
            json={"flagged": False},
            headers=auth_headers,
        )
        assert unflag.status_code == 200
        assert unflag.json()["is_flagged"] is False
