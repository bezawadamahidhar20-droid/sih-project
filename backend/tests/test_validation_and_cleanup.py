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


class TestRateLimiting:
    async def test_upload_rate_limited_429(self, client, auth_headers, monkeypatch):
        from app.core.config import get_settings
        from app.core.ratelimit import upload_limiter

        # Tighten the budget so the test needs no 30 real uploads.
        monkeypatch.setattr(get_settings(), "upload_rate_limit_per_minute", 2)
        upload_limiter.clear()

        # Unique bytes per upload: the endpoint dedups by SHA-256, so reusing
        # the same bytes would return 409 before the limiter is even reached.
        def _fresh_png(seed: int) -> bytes:
            rng = np.random.default_rng(seed)
            arr = (np.clip(rng.normal(0.5, 0.2, (64, 64)), 0, 1) * 255).astype(np.uint8)
            img = Image.fromarray(arr, mode="L").convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()

        for seed in (101, 202):
            resp = await client.post(
                "/api/v1/scans/upload",
                files={"file": ("scan.png", _fresh_png(seed), "image/png")},
                headers=auth_headers,
            )
            assert resp.status_code == 201, resp.text

        third = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", _fresh_png(303), "image/png")},
            headers=auth_headers,
        )
        assert third.status_code == 429
        assert "Retry-After" in third.headers

    async def test_predict_rate_limited_429(self, client, auth_headers, monkeypatch):
        from app.core.config import get_settings
        from app.core.ratelimit import predict_limiter

        monkeypatch.setattr(get_settings(), "predict_rate_limit_per_minute", 2)
        predict_limiter.clear()

        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("scan.png", make_png_bytes(), "image/png")},
            headers=auth_headers,
        )
        scan = upload.json()

        for _ in range(2):
            resp = await client.post(
                f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
            )
            assert resp.status_code == 200

        third = await client.post(
            f"/api/v1/predictions/predict/{scan['id']}", headers=auth_headers
        )
        assert third.status_code == 429


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


class TestProductionConfig:
    """The app must refuse to boot in production with placeholder secrets, so
    a public deployment can never start with forgeable JWTs or a decryptable
    data key. Local development (ENVIRONMENT != production) stays permissive."""

    PLACEHOLDER = {
        "jwt_secret_key": "change-me-32-chars-minimum-!!!!!!!!",
        "encryption_key": "change-me-32-chars-minimum-!!!!!!!!",
        "encryption_salt": "change-me-16-chars!",
        "database_url": "sqlite+aiosqlite:///:memory:",
    }

    def test_placeholder_secrets_rejected_in_production(self):
        from app.core.config import Settings

        with pytest.raises(ValueError, match="placeholder"):
            Settings(environment="production", _env_file=None, **self.PLACEHOLDER)

    def test_placeholder_secrets_allowed_in_development(self):
        from app.core.config import Settings

        # Dev convenience: local .env.example placeholders must still boot.
        settings = Settings(environment="development", _env_file=None, **self.PLACEHOLDER)
        assert settings.environment == "development"

    def test_real_secrets_accepted_in_production(self):
        from app.core.config import Settings

        settings = Settings(
            environment="production",
            _env_file=None,
            jwt_secret_key="f" * 64,
            encryption_key="e" * 64,
            encryption_salt="s" * 32,
            database_url="sqlite+aiosqlite:///:memory:",
            cors_origins=["https://mediscan.example.com"],
        )
        assert settings.environment == "production"
        assert settings.seed_demo_users is False

    def test_http_localhost_cors_origin_rejected_in_production(self):
        """Production must refuse the compose default
        (``CORS_ORIGINS=["http://localhost:8080"]``) — the CORS allowlist
        doubles as the CSRF Origin allowlist, so shipping a dev origin to
        production would either break the app or bless a misconfigured
        deployment. Fail fast instead."""
        from app.core.config import Settings

        base = dict(
            jwt_secret_key="f" * 64,
            encryption_key="e" * 64,
            encryption_salt="s" * 32,
            database_url="sqlite+aiosqlite:///:memory:",
        )
        for bad in (["http://localhost:8080"], ["http://localhost:5173"], []):
            with pytest.raises(ValueError, match="CORS_ORIGINS"):
                Settings(environment="production", _env_file=None, cors_origins=bad, **base)

        # Localhost over HTTPS is still not a production origin.
        with pytest.raises(ValueError, match="CORS_ORIGINS"):
            Settings(
                environment="production", _env_file=None,
                cors_origins=["https://localhost:8443"], **base,
            )

    def test_http_localhost_cors_origin_allowed_in_development(self):
        from app.core.config import Settings

        settings = Settings(
            environment="development",
            _env_file=None,
            jwt_secret_key="f" * 64,
            encryption_key="e" * 64,
            encryption_salt="s" * 32,
            database_url="sqlite+aiosqlite:///:memory:",
            cors_origins=["http://localhost:5173", "http://localhost:8080"],
        )
        assert settings.cors_origins == ["http://localhost:5173", "http://localhost:8080"]

    def test_known_default_postgres_password_rejected_in_production(self):
        """The compose template default (``mediscan``) must never silently
        become a production database credential."""
        from app.core.config import Settings

        base = dict(
            jwt_secret_key="f" * 64,
            encryption_key="e" * 64,
            encryption_salt="s" * 32,
            cors_origins=["https://mediscan.example.com"],
        )
        for bad in (
            "postgresql+asyncpg://mediscan:mediscan@db:5432/mediscan",
            "postgresql+asyncpg://mediscan:@db:5432/mediscan",
            "postgresql+asyncpg://mediscan:postgres@db:5432/mediscan",
        ):
            with pytest.raises(ValueError, match="known-default PostgreSQL password"):
                Settings(environment="production", _env_file=None, database_url=bad, **base)

        # A strong password boots fine; SQLite (no password concept) is exempt.
        ok = Settings(
            environment="production", _env_file=None,
            database_url="postgresql+asyncpg://mediscan:V3ry-Strong-Pw@db:5432/mediscan", **base,
        )
        assert ok.database_url.startswith("postgresql")
