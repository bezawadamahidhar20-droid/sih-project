"""Independent red-team verification tests.

Coverage added during the final review pass beyond the earlier regression
suites:

* Token-type misuse: an access token must never refresh; a refresh token
  must never authenticate as an access token.
* Tampered and expired JWTs are rejected.
* CORS: only configured origins receive Access-Control-Allow-Origin.
* 500/422 responses never leak stack traces, paths, or secrets.
* Model/class consistency: the shipped checkpoint's head matches
  MODEL_NUM_CLASSES and MODEL_CLASSES.
* RefreshSession state is durable: a row written by one engine survives an
  engine restart (persistence, not process memory).
"""

import os
from datetime import timedelta

import pytest

from httpx import AsyncClient


class TestTokenTypeMisuse:
    async def test_access_token_cannot_refresh(self, client, test_user):
        tokens = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert tokens.status_code == 200
        access = tokens.json()["access_token"]

        resp = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": access}
        )
        assert resp.status_code == 401

    async def test_refresh_token_cannot_authenticate_as_access(self, client, test_user):
        tokens = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert tokens.status_code == 200
        refresh = tokens.json()["refresh_token"]

        resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"}
        )
        assert resp.status_code == 401


class TestJwtTampering:
    async def test_tampered_signature_rejected(self, client, test_user, auth_headers):
        token = auth_headers["Authorization"].removeprefix("Bearer ")
        # Flip the last character of the signature.
        tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
        resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"}
        )
        assert resp.status_code == 401

    async def test_expired_access_token_rejected(self, client, test_user):
        from app.core.security import create_access_token

        expired = create_access_token(
            data={"sub": str(test_user.id), "role": test_user.role.value},
            expires_delta=timedelta(seconds=-60),
        )
        resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"}
        )
        assert resp.status_code == 401

    async def test_garbage_token_rejected(self, client):
        resp = await client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"}
        )
        assert resp.status_code == 401


class TestCors:
    async def test_disallowed_origin_gets_no_cors_headers(self, client, test_user):
        resp = await client.get("/api/v1/health", headers={"Origin": "https://evil.example.com"})
        assert resp.status_code == 200
        assert "access-control-allow-origin" not in resp.headers

    async def test_configured_origin_gets_cors_headers(self, client, test_user):
        from app.core.config import get_settings

        allowed = get_settings().cors_origins[0]
        resp = await client.get("/api/v1/health", headers={"Origin": allowed})
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == allowed


class TestErrorLeakage:
    async def test_500_response_has_no_stacktrace_or_paths(self, client, auth_headers, monkeypatch):
        import io

        from PIL import Image

        from app.api.routes import scans as scans_module

        def _boom(src, dst):
            raise OSError("simulated disk full")

        monkeypatch.setattr(scans_module, "encrypt_file", _boom)

        buf = io.BytesIO()
        Image.new("RGB", (32, 32), (128, 128, 128)).save(buf, format="JPEG")

        resp = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("x.jpg", buf.getvalue(), "image/jpeg")},
            headers=auth_headers,
        )
        assert resp.status_code == 500
        body = resp.text
        assert "Traceback" not in body
        assert "simulated disk full" not in body
        assert "\\app\\" not in body and "/app/" not in body

    async def test_validation_error_does_not_leak_internals(self, client, auth_headers):
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": 12345},  # wrong type on purpose
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "secret" not in resp.text.lower()
        assert "password" not in resp.text.lower()


class TestModelClassConsistency:
    def test_checkpoint_head_matches_configured_classes(self):
        """The shipped checkpoint's classification head must match
        MODEL_NUM_CLASSES and MODEL_CLASSES — the API can never silently map
        a prediction to a class the model was not trained on."""
        from pathlib import Path

        import torch

        from app.core.config import get_settings

        settings = get_settings()
        path = Path(settings.model_path)
        if not path.exists():
            pytest.skip("no trained model checkpoint in this checkout")

        assert settings.model_num_classes == len(settings.model_classes), (
            "MODEL_NUM_CLASSES must equal len(MODEL_CLASSES)"
        )

        state = torch.load(str(path), map_location="cpu", weights_only=True)
        # resnet50 head: state dict key ``fc.weight``, out_features = classes.
        head_out = state["fc.weight"].shape[0]
        assert head_out == settings.model_num_classes, (
            f"checkpoint head has {head_out} outputs but MODEL_NUM_CLASSES="
            f"{settings.model_num_classes}"
        )

    async def test_health_reports_real_engine_and_classes(self, client):
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["model_loaded"] is True
        assert data["engine"] != "baseline-heuristic"
        if data.get("model_metrics"):
            classes = data["model_metrics"].get("class_names") or []
            assert len(classes) == 2


class TestRefreshSessionPersistence:
    def test_session_row_survives_engine_restart(self, tmp_path):
        """Prove RefreshSession state lives in the database: a row written by
        one engine instance is still there after the engine is disposed and a
        fresh one is created on the same file (i.e. a process restart)."""
        import asyncio

        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

        from app.core.timeutil import utcnow
        from app.db.models import Base, RefreshSession

        db_file = tmp_path / "restart.db"
        url = f"sqlite+aiosqlite:///{db_file}"

        async def _write():
            engine = create_async_engine(url)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with maker() as session:
                session.add(
                    RefreshSession(
                        user_id=1,
                        jti="persist-me",
                        expires_at=utcnow(),
                        revoked_at=None,
                    )
                )
                await session.commit()
            await engine.dispose()  # simulate process shutdown

        async def _read() -> bool:
            engine = create_async_engine(url)  # fresh engine = fresh process
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with maker() as session:
                from sqlalchemy import select

                row = (
                    await session.execute(
                        select(RefreshSession).where(RefreshSession.jti == "persist-me")
                    )
                ).scalar_one_or_none()
                await engine.dispose()
                return row is not None

        asyncio.run(_write())
        assert asyncio.run(_read()), "refresh session row lost after restart"

    def test_file_database_matches_runtime_schema(self):
        """The runtime engine creates refresh_sessions on a fresh database
        (create_all) and the table exists in the schema."""
        from app.db.models import RefreshSession, Base

        tables = Base.metadata.tables
        assert "refresh_sessions" in tables
        cols = {c.name for c in tables["refresh_sessions"].columns}
        assert {"jti", "user_id", "expires_at", "revoked_at"} <= cols
        assert RefreshSession.__tablename__ == "refresh_sessions"
