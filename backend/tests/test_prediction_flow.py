"""End-to-end tests for the upload -> predict -> heatmap loop.

The tests accept either inference engine: the ``baseline-heuristic`` fallback
(used when no trained model file is present) or the ``resnet50`` CNN engine
(used when a trained state dict exists at ``MODEL_PATH``).
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
        assert pred["model_architecture"] in ("baseline-heuristic", "resnet50")
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

    async def test_staff_cannot_fetch_another_users_images(self, client, auth_headers, staff_headers):
        # IDOR regression: a staff member must not fetch another user's scan
        # images even when the file hash is known (it is returned by the API).
        png = make_png_bytes()
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", png, "image/png")},
            headers=auth_headers,
        )
        assert upload.status_code == 201
        scan = upload.json()

        predict = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        assert predict.status_code == 200
        urls = predict.json()

        # Staff cannot see the scan through the API either.
        hidden = await client.get(f"/api/v1/scans/{scan['id']}", headers=staff_headers)
        assert hidden.status_code == 404

        for url in (urls["original_image_url"], urls["gradcam_overlay_url"]):
            img = await client.get(url, headers=staff_headers)
            assert img.status_code == 404, f"IDOR: staff fetched {url}"

        # The owning doctor can still fetch both images.
        for url in (urls["original_image_url"], urls["gradcam_overlay_url"]):
            img = await client.get(url, headers=auth_headers)
            assert img.status_code == 200


class TestDerivedImagesAtRest:
    async def test_derived_images_encrypted_on_disk(self, client, auth_headers):
        import os

        from app.core.config import get_settings

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

        gradcam_dir = os.path.join(get_settings().upload_dir, "gradcam")
        for name in (f"original_{scan['file_hash']}.png", f"gradcam_{scan['file_hash']}.png"):
            plain = os.path.join(gradcam_dir, name)
            assert not os.path.exists(plain), f"derived image left in cleartext: {plain}"
            assert os.path.exists(plain + ".enc"), f"missing encrypted derived image: {plain}.enc"


class TestDicomAnonymization:
    def _make_dicom_bytes_with_phi(self) -> bytes:
        import io

        import numpy as np
        import pydicom
        from pydicom.dataset import FileDataset, FileMetaDataset

        ds = FileDataset("phi.dcm", {}, preamble=b"\0" * 128, file_meta=FileMetaDataset())
        ds.file_meta.MediaStorageSOPClassUID = pydicom.uid.SecondaryCaptureImageStorage
        ds.file_meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
        ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
        ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
        ds.PatientName = "DOE^JOHN"
        ds.PatientID = "12345"
        ds.StudyDate = "20240101"
        ds.Modality = "DX"
        ds.BodyPartExamined = "CHEST"
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows = 16
        ds.Columns = 16
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 0
        ds.PixelData = (np.arange(256, dtype=np.uint16) % 256).reshape(16, 16).tobytes()

        buf = io.BytesIO()
        ds.save_as(buf, enforce_file_format=True)
        return buf.getvalue()

    async def test_dicom_phi_stripped_before_encryption(self, client, auth_headers):
        import os

        from app.core.config import get_settings
        from app.core.security import decrypt_data

        dcm_bytes = self._make_dicom_bytes_with_phi()

        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.dcm", dcm_bytes, "application/dicom")},
            headers=auth_headers,
        )
        assert upload.status_code == 201
        scan = upload.json()

        # PatientID is not in the whitelist, so nothing leaks into the DB.
        assert scan["anonymized_patient_id"] is None

        # Decrypt the file at rest: no PHI may survive.
        encrypted_path = os.path.join(get_settings().upload_dir, f"{scan['file_hash']}.enc")
        assert os.path.exists(encrypted_path)
        with open(encrypted_path, "rb") as f:
            raw = decrypt_data(f.read())
        assert b"DOE" not in raw and b"JOHN" not in raw
        assert b"12345" not in raw

        # The anonymized file is still a valid image: prediction works.
        predict = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        assert predict.status_code == 200


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
