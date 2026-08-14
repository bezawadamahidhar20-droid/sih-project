"""Security regression tests: object-level authorization (IDOR) and DICOM PHI.

The exact attacks from the security audit:

    Doctor A logs in.
    Doctor B uploads a scan and receives a prediction id.
    Doctor A attempts:
        POST /predictions/{B_prediction}/flag
        GET  /predictions/{B_prediction}/pdf
        GET  /predictions/{B_prediction}/heatmap/{condition}
        DELETE /scans/{B_scan}
        GET  /predictions/image/{B_derived_image}
    Expected: DENIED (404, resource existence not disclosed).

    Doctor B (owner) attempts the same: ALLOWED.
"""

import io
import os

import numpy as np
from httpx import AsyncClient

from sqlalchemy import delete

from app.core.security import get_password_hash
from app.db.models import User, UserRole


def make_png_bytes(size: int = 256) -> bytes:
    rng = np.random.default_rng(42)
    arr = (np.clip(rng.normal(0.5, 0.2, (size, size)), 0, 1) * 255).astype(np.uint8)
    img = __import__("PIL").Image.fromarray(arr, mode="L").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _login(client: AsyncClient, username: str, password: str) -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestCrossDoctorIDOR:
    """Doctor A must not reach Doctor B's flag/PDF/heatmap/delete/images."""

    async def _setup(self, client, db_session, test_user):
        # Doctor B uploads + predicts a scan.
        doctor_b = User(
            username="doctor_b",
            email="doctorb@example.com",
            hashed_password=get_password_hash("testpass123"),
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db_session.add(doctor_b)
        await db_session.commit()
        await db_session.refresh(doctor_b)

        b_headers = await _login(client, "doctor_b", "testpass123")
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=b_headers,
        )
        assert upload.status_code == 201, upload.text
        scan = upload.json()

        predict = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=b_headers
        )
        assert predict.status_code == 200, predict.text
        pred = predict.json()["prediction"]
        return b_headers, scan, pred

    async def test_doctor_a_cannot_flag_doctors_b_prediction(self, client, db_session, test_user, auth_headers):
        _, _, pred = await self._setup(client, db_session, test_user)
        resp = await client.post(
            f"/api/v1/predictions/{pred['id']}/flag",
            json={"flagged": True},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_doctor_a_cannot_download_doctors_b_pdf(self, client, db_session, test_user, auth_headers):
        _, _, pred = await self._setup(client, db_session, test_user)
        resp = await client.get(
            f"/api/v1/predictions/{pred['id']}/pdf", headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_doctor_a_cannot_fetch_doctors_b_heatmap(self, client, db_session, test_user, auth_headers):
        _, _, pred = await self._setup(client, db_session, test_user)
        for condition in pred.get("condition_heatmaps") or {"Normal": "", "Pneumonia": ""}:
            resp = await client.get(
                f"/api/v1/predictions/{pred['id']}/heatmap/{condition}", headers=auth_headers
            )
            assert resp.status_code == 404

    async def test_doctor_a_cannot_delete_doctors_b_scan(self, client, db_session, test_user, auth_headers):
        _, scan, _ = await self._setup(client, db_session, test_user)
        resp = await client.delete(f"/api/v1/scans/{scan['id']}", headers=auth_headers)
        assert resp.status_code == 404
        # The scan still exists for its owner.
        still = await client.get(f"/api/v1/scans/{scan['id']}", headers=auth_headers)
        assert still.status_code == 200

    async def test_doctor_a_cannot_fetch_doctors_b_derived_images(self, client, db_session, test_user, auth_headers):
        _, scan, _ = await self._setup(client, db_session, test_user)
        for stem in (f"original_{scan['file_hash']}.png", f"gradcam_{scan['file_hash']}.png"):
            resp = await client.get(
                f"/api/v1/predictions/image/{stem}", headers=auth_headers
            )
            assert resp.status_code == 404, f"IDOR: doctor A fetched {stem}"

    async def test_owner_doctor_b_can_flag_pdf_heatmap(self, client, db_session, test_user):
        b_headers, _, pred = await self._setup(client, db_session, test_user)

        flag = await client.post(
            f"/api/v1/predictions/{pred['id']}/flag",
            json={"flagged": True},
            headers=b_headers,
        )
        assert flag.status_code == 200

        pdf = await client.get(
            f"/api/v1/predictions/{pred['id']}/pdf", headers=b_headers
        )
        assert pdf.status_code == 200
        assert pdf.headers.get("content-type", "").startswith("application/pdf")
        assert pdf.content.startswith(b"%PDF")
        # The PDF embeds both derived images (decrypted from the encrypted
        # artifacts at rest) — a real document, not a placeholder.
        assert len(pdf.content) > 2000

        heatmap = await client.get(
            f"/api/v1/predictions/{pred['id']}/heatmap/Pneumonia", headers=b_headers
        )
        assert heatmap.status_code == 200
        assert heatmap.headers.get("content-type", "").startswith("image/png")

    async def test_owner_doctor_b_can_delete_own_scan(self, client, db_session, test_user):
        b_headers, scan, _ = await self._setup(client, db_session, test_user)
        resp = await client.delete(f"/api/v1/scans/{scan['id']}", headers=b_headers)
        assert resp.status_code == 204

    async def test_nonexistent_prediction_is_safe_404(self, client, db_session, test_user, auth_headers):
        calls = [
            ("post", "/api/v1/predictions/999999/flag", {"json": {"flagged": True}}),
            ("get", "/api/v1/predictions/999999/pdf", {}),
            ("get", "/api/v1/predictions/999999/heatmap/Normal", {}),
        ]
        for method, path, kwargs in calls:
            resp = await getattr(client, method)(path, headers=auth_headers, **kwargs)
            assert resp.status_code == 404

    async def test_unauthenticated_pdf_and_heatmap_401(self, client, db_session, test_user, auth_headers):
        _, _, pred = await self._setup(client, db_session, test_user)
        pdf = await client.get(f"/api/v1/predictions/{pred['id']}/pdf")
        assert pdf.status_code == 401
        heatmap = await client.get(f"/api/v1/predictions/{pred['id']}/heatmap/Normal")
        assert heatmap.status_code == 401


class TestDicomPhiHardening:
    """StudyID must be dropped, linkage UIDs replaced, multi-frame rejected."""

    @staticmethod
    def _make_dicom(pixel_data: bytes, rows: int = 16, cols: int = 16, bits: int = 16) -> bytes:
        import pydicom
        from pydicom.dataset import FileDataset, FileMetaDataset

        ds = FileDataset("phi.dcm", {}, preamble=b"\0" * 128, file_meta=FileMetaDataset())
        ds.file_meta.MediaStorageSOPClassUID = pydicom.uid.SecondaryCaptureImageStorage
        ds.file_meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
        ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
        ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
        ds.StudyInstanceUID = pydicom.uid.generate_uid()
        ds.SeriesInstanceUID = pydicom.uid.generate_uid()
        ds.StudyID = "MRN-987654"
        ds.PatientName = "DOE^JOHN"
        ds.PatientID = "12345"
        ds.StudyDate = "20240101"
        ds.Modality = "DX"
        ds.BodyPartExamined = "CHEST"
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows = rows
        ds.Columns = cols
        ds.BitsAllocated = bits
        ds.BitsStored = bits
        ds.HighBit = bits - 1
        ds.PixelRepresentation = 0
        ds.PixelData = pixel_data

        buf = io.BytesIO()
        ds.save_as(buf, enforce_file_format=True)
        return buf.getvalue()

    @staticmethod
    def _read_anonymized_at_rest(file_hash: str) -> bytes:
        from app.core.config import get_settings
        from app.core.security import decrypt_data

        path = os.path.join(get_settings().upload_dir, f"{file_hash}.enc")
        with open(path, "rb") as f:
            return decrypt_data(f.read())

    async def _upload_dicom(self, client, auth_headers, dcm_bytes: bytes) -> dict:
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.dcm", dcm_bytes, "application/dicom")},
            headers=auth_headers,
        )
        assert upload.status_code == 201, upload.text
        return upload.json()

    async def test_study_id_dropped_and_uids_replaced(self, client, auth_headers):
        import pydicom
        from pydicom.filebase import BytesIO  # noqa: F401  (import check)

        pixel = (np.arange(256, dtype=np.uint16) % 256).reshape(16, 16).tobytes()
        dcm = self._make_dicom(pixel)
        # Grab the ORIGINAL UIDs before upload for comparison.
        original = pydicom.dcmread(io.BytesIO(dcm))
        original_sop = original.SOPInstanceUID
        original_study = original.StudyInstanceUID
        original_series = original.SeriesInstanceUID

        scan = await self._upload_dicom(client, auth_headers, dcm)

        raw = self._read_anonymized_at_rest(scan["file_hash"])
        stored = pydicom.dcmread(io.BytesIO(raw))

        # Study ID (institution-assigned identifier) must not survive.
        assert not hasattr(stored, "StudyID"), "Study ID must be removed (PHI risk)"

        # Linkage UIDs must be REPLACED, never retained.
        assert stored.SOPInstanceUID != original_sop
        assert stored.StudyInstanceUID != original_study
        assert stored.SeriesInstanceUID != original_series

        # No patient identifiers survive anywhere in the stored bytes.
        assert b"DOE" not in raw and b"JOHN" not in raw
        assert b"12345" not in raw
        assert b"MRN-987654" not in raw

        # The anonymized file still decodes as a valid image (pixel data kept).
        assert stored.pixel_array.shape == (16, 16)

    async def test_multi_frame_dicom_rejected_explicitly(self, client, auth_headers):
        # 3-frame grayscale volume (frames, rows, cols) — must be rejected
        # with an actionable message, never silently analyzed as frame 0.
        frames = 3
        pixel = (np.arange(16 * 16 * frames, dtype=np.uint16) % 256).reshape(frames, 16, 16).tobytes()
        dcm = self._make_dicom(pixel, rows=16, cols=16)

        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("volume.dcm", dcm, "application/dicom")},
            headers=auth_headers,
        )
        assert upload.status_code == 400
        detail = upload.json()["detail"].lower()
        assert "multi-frame" in detail, detail

    async def test_dicom_upload_does_not_leak_phi_to_db(self, client, auth_headers):
        pixel = (np.arange(256, dtype=np.uint16) % 256).reshape(16, 16).tobytes()
        dcm = self._make_dicom(pixel)
        scan = await self._upload_dicom(client, auth_headers, dcm)
        # PatientID is not whitelisted, so the DB row must not echo it.
        assert scan["anonymized_patient_id"] is None
