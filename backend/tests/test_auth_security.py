"""Authentication security regression tests.

* POST /auth/logout revokes the presented refresh token (replay-proof).
* API-minted refresh tokens are tracked in the persistent RefreshSession
  table: rotation works, and replaying a rotated token triggers family
  revocation (all refresh sessions + token_version bump kills access tokens).
* A logged-out (revoked) refresh token can never mint a new pair.
"""

from httpx import AsyncClient


async def _login(client: AsyncClient, username: str = "testuser", password: str = "testpass123") -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _csrf(client: AsyncClient) -> dict:
    """Double-submit CSRF header for requests that carry the auth cookies
    the client's jar received at login (no Authorization header)."""
    from tests.conftest import csrf_headers
    return csrf_headers(client)


class TestLogout:
    async def test_logout_revokes_refresh_token(self, client, test_user):
        tokens = await _login(client)
        refresh_token = tokens["refresh_token"]
        access_headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        # Logout must invalidate the refresh token server-side.
        logout = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": refresh_token},
            headers=_csrf(client),
        )
        assert logout.status_code == 204

        # The still-valid short-lived access token keeps working until expiry.
        me = await client.get("/api/v1/auth/me", headers=access_headers)
        assert me.status_code == 200

        # The revoked refresh token can no longer be refreshed (replay).
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
            headers=_csrf(client),
        )
        assert replay.status_code == 401

    async def test_logout_is_idempotent(self, client, test_user):
        tokens = await _login(client)
        for _ in range(2):
            resp = await client.post(
                "/api/v1/auth/logout",
                json={"refresh_token": tokens["refresh_token"]},
                headers=_csrf(client),
            )
            assert resp.status_code == 204

    async def test_logout_without_token_is_noop_204(self, client, test_user):
        resp = await client.post("/api/v1/auth/logout", json={})
        assert resp.status_code == 204


class TestExpiredRefreshToken:
    async def test_expired_db_session_rejected(self, client, test_user, db_session):
        """A refresh token whose RefreshSession row has expired must be
        rejected (the DB row is the source of truth for session lifetime,
        independent of the JWT's own exp claim)."""
        from datetime import timedelta

        from app.core.security import create_refresh_token_with_jti
        from app.core.timeutil import utcnow
        from app.db.models import RefreshSession

        token, jti = create_refresh_token_with_jti(
            data={"sub": str(test_user.id), "role": test_user.role.value, "ver": 0},
        )
        db_session.add(
            RefreshSession(
                user_id=test_user.id,
                jti=jti,
                expires_at=utcnow() - timedelta(minutes=5),  # already expired
            )
        )
        await db_session.commit()

        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": token},
            headers=_csrf(client),
        )
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()


class TestDbBackedRotation:
    async def test_login_refresh_rotation_via_db(self, client, test_user):
        from sqlalchemy import select

        from app.db.models import RefreshSession
        from tests.conftest import TestingSessionLocal

        tokens = await _login(client)
        r1 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            headers=_csrf(client),
        )
        assert r1.status_code == 200
        r2 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": r1.json()["refresh_token"]},
            headers=_csrf(client),
        )
        assert r2.status_code == 200

        # Each refresh mints a NEW DB-backed session row (rotation chain).
        async with TestingSessionLocal() as session:
            rows = (await session.execute(select(RefreshSession))).scalars().all()
            assert len(rows) == 3  # login + two rotations

    async def test_replaying_rotated_token_revokes_family(self, client, test_user, auth_headers):
        """Replay of a used refresh token = theft signal: the whole session
        family dies (every refresh session revoked + token_version bump, which
        also kills the outstanding access token)."""
        tokens = await _login(client)
        access_headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        # First use rotates the token forward (this is legitimate).
        r1 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            headers=_csrf(client),
        )
        assert r1.status_code == 200

        # Replaying the now-consumed token must be rejected…
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            headers=_csrf(client),
        )
        assert replay.status_code == 401

        # …and the family is dead: the access token minted at login is now
        # revoked too (token_version bumped server-side).
        me = await client.get("/api/v1/auth/me", headers=access_headers)
        assert me.status_code == 401

        # Even the freshly rotated refresh token cannot be used anymore.
        r2 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": r1.json()["refresh_token"]},
            headers=_csrf(client),
        )
        assert r2.status_code == 401

    async def test_legacy_token_single_use_via_memory_backstop(self, client, test_user):
        """Tokens minted outside the API (no DB row — e.g. tests or tokens
        issued before the RefreshSession table existed) still rotate via the
        in-memory backstop and replay is rejected."""
        from app.core.security import create_refresh_token

        legacy = create_refresh_token(
            data={"sub": str(test_user.id), "role": test_user.role.value, "ver": 0},
        )
        first = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": legacy}, headers=_csrf(client)
        )
        assert first.status_code == 200
        replay = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": legacy}, headers=_csrf(client)
        )
        assert replay.status_code == 401
