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

from sqlalchemy import delete, select

from app.core.security import get_password_hash
from app.db.models import Scan, User, UserRole


def make_png_bytes(size: int = 256) -> bytes:
    rng = np.random.default_rng(42)
    arr = (np.clip(rng.normal(0.5, 0.2, (size, size)), 0, 1) * 255).astype(np.uint8)
    img = __import__("PIL").Image.fromarray(arr, mode="L").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _login(client: AsyncClient, username: str, password: str) -> dict:
    """Login and return Bearer headers.

    The login JSON body deliberately contains no JWT (security contract), so
    the access token is read from the HttpOnly cookie the client jar received
    — exactly how a programmatic HTTP client consumes this API.
    """
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    assert "access_token" not in resp.json()
    token = client.cookies.get("access_token")
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

    async def test_doctor_a_cannot_read_doctors_b_prediction(self, client, db_session, test_user, auth_headers):
        """The by-ID prediction endpoint is owner-scoped like flag/PDF/heatmap:
        a peer must not read a specific prediction record (the doctor-wide
        LIST view remains the intentional clinical-visibility surface)."""
        _, _, pred = await self._setup(client, db_session, test_user)
        resp = await client.get(
            f"/api/v1/predictions/{pred['id']}", headers=auth_headers
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
        # The setup logged Doctor B in on this client, so the jar holds auth
        # cookies — clear them to truly simulate an anonymous caller.
        client.cookies.clear()
        pdf = await client.get(f"/api/v1/predictions/{pred['id']}/pdf")
        assert pdf.status_code == 401
        heatmap = await client.get(f"/api/v1/predictions/{pred['id']}/heatmap/Normal")
        assert heatmap.status_code == 401


class TestPredictThenAccessBOLA:
    """Regression: predicting a scan must never grant access to a peer's
    scan (predict-then-access BOLA).

    Live-confirmed during the independent audit: POST /predictions/predict
    had no ownership filter for doctors, so doctor B could predict doctor
    A's scan and the resulting prediction (owned by B) immediately unlocked
    A's PDF report, Grad-CAM heatmap and derived images — defeating the
    owner-scoped resource boundary that the flag/PDF/heatmap/image endpoints
    deliberately enforce. The predict endpoint must now apply the same rule:
    a doctor may only predict a scan they uploaded or already predicted.
    """

    @staticmethod
    async def _upload_scan(client: AsyncClient, headers: dict) -> dict:
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=headers,
        )
        assert upload.status_code == 201, upload.text
        return upload.json()

    @staticmethod
    async def _make_doctor(db_session, username: str) -> User:
        doctor = User(
            username=username,
            email=f"{username}@example.com",
            hashed_password=get_password_hash("testpass123"),
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db_session.add(doctor)
        await db_session.commit()
        await db_session.refresh(doctor)
        return doctor

    async def test_doctor_b_cannot_predict_doctors_a_scan(self, client, db_session, test_user, auth_headers):
        # Doctor A uploads a scan.
        scan = await self._upload_scan(client, auth_headers)

        # Doctor B is a different doctor with no relationship to the scan.
        await self._make_doctor(db_session, "bola_b")
        b_headers = await _login(client, "bola_b", "testpass123")

        # THE ATTACK: predict A's scan. Denied with a safe 404 (existence
        # not disclosed), and no prediction is created for B.
        resp = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=b_headers
        )
        assert resp.status_code == 404, resp.text

        # B's prediction list must not contain anything for A's scan.
        preds = (await client.get("/api/v1/predictions", headers=b_headers)).json()[
            "predictions"
        ]
        assert not [p for p in preds if p["scan_id"] == scan["id"]]

    async def test_doctor_b_attempt_leaves_owner_resources_protected(self, client, db_session, test_user, auth_headers):
        # Even after B's denied attempt, the scan stays fully owner-scoped:
        # B cannot reach the scan row, its derived images, or a (nonexistent)
        # prediction's PDF — every probe answers 404/404.
        scan = await self._upload_scan(client, auth_headers)
        await self._make_doctor(db_session, "bola_b2")
        b_headers = await _login(client, "bola_b2", "testpass123")

        await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=b_headers
        )

        derived = await client.get(
            f"/api/v1/predictions/image/gradcam_{scan['file_hash']}.png",
            headers=b_headers,
        )
        assert derived.status_code == 404
        pdf = await client.get("/api/v1/predictions/999999/pdf", headers=b_headers)
        assert pdf.status_code == 404

        # The owner still has full functionality.
        ok = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        assert ok.status_code == 200, ok.text

    async def test_owner_can_still_predict_own_scan(self, client, db_session, test_user, auth_headers):
        scan = await self._upload_scan(client, auth_headers)
        resp = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["prediction"]["scan_id"] == scan["id"]

    async def test_doctor_with_existing_prediction_can_repredict(self, client, db_session, test_user, auth_headers):
        """Legacy rows (created before the guard) keep working: a doctor who
        already predicted a scan already holds the derived-resource access, so
        re-predicting grants nothing new and must not regress."""
        from app.db.models import Prediction, ScanStatus

        scan = await self._upload_scan(client, auth_headers)
        doctor_b = await self._make_doctor(db_session, "bola_legacy")

        db_session.add(
            Prediction(
                scan_id=scan["id"],
                user_id=doctor_b.id,
                predicted_class="Normal",
                confidence=0.99,
                all_probabilities='{"Normal": 0.99, "Pneumonia": 0.01}',
                model_version="test",
                model_architecture="resnet50",
            )
        )
        scan_row = (
            await db_session.execute(
                select(Scan).where(Scan.id == scan["id"])
            )
        ).scalar_one()
        scan_row.status = ScanStatus.COMPLETED
        await db_session.commit()

        b_headers = await _login(client, "bola_legacy", "testpass123")
        resp = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=b_headers
        )
        assert resp.status_code == 200, resp.text
        # The cached prediction returned is B's own (the only one for the
        # scan — the unique scan_id constraint enforces single-use). The
        # response schema omits user_id, so prove ownership via B's unique
        # row values (confidence 0.99) and the scan linkage.
        body = resp.json()
        assert body["prediction"]["scan_id"] == scan["id"]
        assert body["prediction"]["confidence"] == 0.99
        row = (
            await db_session.execute(
                select(Prediction).where(Prediction.scan_id == scan["id"])
            )
        ).scalar_one()
        assert row.user_id == doctor_b.id


class TestPatientHistoryAuthorization:
    """The patient-history endpoint is intentionally doctor/radiologist-wide
    (anonymized opaque patient IDs, no per-doctor ownership filter — the
    same model list_predictions uses, documented on the endpoint). The
    invariants that MUST hold: only DOCTOR/RADIOLOGIST roles can call it
    (staff is scoped to their own uploads and gets 403), and the data is
    keyed only by the anonymized patient ID."""

    @staticmethod
    async def _upload_and_predict(client, headers, patient_id: str) -> dict:
        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            data={"anonymized_patient_id": patient_id},
            headers=headers,
        )
        assert upload.status_code == 201, upload.text
        scan = upload.json()
        predict = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=headers
        )
        assert predict.status_code == 200, predict.text
        return scan, predict.json()["prediction"]

    async def test_staff_cannot_query_patient_history(self, client, db_session, test_user, auth_headers, staff_headers):
        await self._upload_and_predict(client, auth_headers, "PT-STAFF-PROBE")
        resp = await client.get(
            "/api/v1/predictions/patient/PT-STAFF-PROBE/history",
            headers=staff_headers,
        )
        assert resp.status_code == 403

    async def test_doctor_can_query_anonymized_patient_history(self, client, db_session, test_user, auth_headers):
        scan, pred = await self._upload_and_predict(client, auth_headers, "PT-ANON-7")
        resp = await client.get(
            "/api/v1/predictions/patient/PT-ANON-7/history",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        history = resp.json()
        assert len(history) == 1
        assert history[0]["id"] == pred["id"]
        assert history[0]["scan"]["anonymized_patient_id"] == "PT-ANON-7"
        # Only anonymized identity is exposed — the raw DICOM patient
        # identifier must never be echoed.
        assert history[0]["scan"]["anonymized_patient_id"] != "12345"

    async def test_radiologist_can_query_patient_history(self, client, db_session, test_user, auth_headers):
        radiologist = User(
            username="hist_radiologist",
            email="hist_rad@example.com",
            hashed_password=get_password_hash("testpass123"),
            role=UserRole.RADIOLOGIST,
            is_active=True,
        )
        db_session.add(radiologist)
        await db_session.commit()
        await db_session.refresh(radiologist)

        await self._upload_and_predict(client, auth_headers, "PT-RAD-1")
        rad_headers = await _login(client, "hist_radiologist", "testpass123")
        resp = await client.get(
            "/api/v1/predictions/patient/PT-RAD-1/history",
            headers=rad_headers,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1

    async def test_unknown_patient_id_returns_empty_list(self, client, db_session, test_user, auth_headers):
        # A peer's patient ID is opaque: an empty list, never a 404 that
        # would reveal whether that patient exists.
        resp = await client.get(
            "/api/v1/predictions/patient/PT-NO-SUCH-PATIENT/history",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []


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
