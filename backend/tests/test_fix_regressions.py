"""Regression tests for the bug-fix batch.

Covers: M4 (upload leaves no plaintext temp files when encryption fails),
L4 (no self role/active-status change), M5 (naive-UTC datetimes serialize
with an explicit offset), M6 (relative config paths are resolved to
absolute against the backend root).
"""

import io
import os

from PIL import Image

from httpx import AsyncClient

from app.core.config import get_settings


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (128, 128, 128)).save(buf, format="JPEG")
    return buf.getvalue()


class TestUploadCleanupOnEncryptFailure:
    async def test_no_plaintext_temp_left_when_encryption_fails(
        self, client: AsyncClient, auth_headers, monkeypatch
    ):
        from app.api.routes import scans as scans_module

        def _boom(src, dst):
            raise OSError("simulated disk full")

        monkeypatch.setattr(scans_module, "encrypt_file", _boom)

        upload_dir = get_settings().upload_dir
        os.makedirs(upload_dir, exist_ok=True)
        before = {f for f in os.listdir(upload_dir)}

        resp = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("x.jpg", _make_jpeg_bytes(), "image/jpeg")},
            headers=auth_headers,
        )
        assert resp.status_code == 500

        after = {f for f in os.listdir(upload_dir)}
        leftovers = after - before
        assert all(not name.startswith("temp_") for name in leftovers), leftovers
        # No plaintext original should survive either.
        assert not any(name.endswith(".jpg") and not name.endswith(".enc") for name in leftovers), leftovers


class TestSelfPrivilegeGuard:
    async def test_doctor_cannot_change_own_role(self, client: AsyncClient, test_user, auth_headers):
        resp = await client.patch(
            f"/api/v1/auth/users/{test_user.id}",
            json={"role": "radiologist"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_doctor_cannot_deactivate_self(self, client: AsyncClient, test_user, auth_headers):
        resp = await client.patch(
            f"/api/v1/auth/users/{test_user.id}",
            json={"is_active": False},
            headers=auth_headers,
        )
        assert resp.status_code == 400


class TestUtcDatetimeSerialization:
    def test_naive_utc_datetimes_get_an_offset(self):
        from datetime import datetime

        from app.api.schemas import _UtcOffsetSerialization

        class M(_UtcOffsetSerialization):
            ts: datetime

        import json

        payload = M(ts=datetime(2026, 8, 11, 10, 0, 0)).model_dump_json()
        rendered = json.loads(payload)["ts"]
        # pydantic renders UTC as "...Z" or "...+00:00" — never a bare
        # "2026-08-11T10:00:00" that JS would misread as local time.
        assert rendered.endswith("Z") or rendered.endswith("+00:00"), rendered


class TestBinaryMetricsPositiveIndex:
    def test_metrics_correct_when_abnormal_class_is_index_0(self):
        """Regression: binary_metrics must honor positive_index when
        extracting tp/fp/fn/tn, not assume the positive class is index 1."""
        import numpy as np

        from app.models.metrics import binary_metrics

        # Class order ["PNEUMONIA", "NORMAL"] -> positive (abnormal) at index 0.
        # 3 abnormal (class 0), 2 normal (class 1); perfect separation.
        y_true = np.array([0, 0, 0, 1, 1])
        y_score = np.array(
            [[0.9, 0.1], [0.8, 0.2], [0.6, 0.4], [0.2, 0.8], [0.3, 0.7]]
        )
        m = binary_metrics(y_true, y_score, positive_index=0)
        assert m["true_positive"] == 3
        assert m["false_negative"] == 0
        assert m["sensitivity"] == 1.0
        assert m["false_positive"] == 0
        assert m["specificity"] == 1.0


class TestAbsoluteConfigPaths:
    def test_relative_paths_resolved_against_backend_root(self):
        settings = get_settings()
        for name in ("upload_dir", "audit_log_path", "model_path"):
            value = getattr(settings, name)
            assert os.path.isabs(value), f"{name} is not absolute: {value}"
        # The uploads dir must be a real, absolute directory regardless of
        # whether it came from .env (./uploads) or the container default
        # (/app/uploads).
        assert os.path.basename(os.path.normpath(settings.upload_dir)) == "uploads"
