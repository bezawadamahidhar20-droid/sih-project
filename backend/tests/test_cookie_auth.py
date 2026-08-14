"""Regression tests for the HttpOnly/Secure/SameSite cookie authentication
migration and the CSRF protection that comes with cookie auth.

The browser SPA never stores tokens in JavaScript: login sets three cookies
(access_token, refresh_token — both HttpOnly — and a JS-readable csrf_token
for the double-submit header), and every state-changing request from a
cookie-authenticated session must echo the csrf_token cookie in the
X-CSRF-Token header.
"""

from httpx import AsyncClient

from app.core.config import get_settings


def _cookie_attrs(response, name: str) -> str | None:
    """Return the raw Set-Cookie attribute string for ``name``."""
    for raw in response.headers.get_list("set-cookie"):
        if raw.split(";", 1)[0].strip().startswith(f"{name}="):
            return raw
    return None


class TestCookieAttributes:
    async def test_login_sets_http_only_cookies(self, client, test_user):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert resp.status_code == 200

        access = _cookie_attrs(resp, "access_token")
        refresh = _cookie_attrs(resp, "refresh_token")
        csrf = _cookie_attrs(resp, "csrf_token")
        assert access and refresh and csrf

        # Access cookie: HttpOnly, SameSite=Lax, sent everywhere.
        assert "HttpOnly" in access
        assert "SameSite=lax" in access
        assert "Path=/" in access
        # Refresh cookie: HttpOnly, SameSite=Strict, scoped to auth routes.
        assert "HttpOnly" in refresh
        assert "SameSite=strict" in refresh
        assert "Path=/api/v1/auth" in refresh
        # CSRF token cookie: readable by JavaScript BY DESIGN (double-submit).
        assert "HttpOnly" not in csrf
        # Secure follows the environment (True in production, False in dev).
        secure = get_settings().cookie_secure
        assert ("Secure" in access) is secure

    async def test_authenticated_request_via_cookie_only(self, client, test_user):
        """GET /auth/me with NO Authorization header, only the cookie jar,
        must authenticate through the HttpOnly access cookie."""
        await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["username"] == "testuser"


class TestCookieRefreshFlow:
    async def test_refresh_via_cookie_rotates_and_replay_revokes_family(self, client, test_user):
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert login.status_code == 200
        old_refresh = client.cookies.get("refresh_token")
        assert old_refresh

        # Refresh with an empty body — the server reads the HttpOnly cookie.
        r1 = await client.post(
            "/api/v1/auth/refresh", json={}, headers={"X-CSRF-Token": client.cookies.get("csrf_token")}
        )
        assert r1.status_code == 200
        new_refresh = client.cookies.get("refresh_token")
        assert new_refresh and new_refresh != old_refresh

        # Replaying the old (rotated) refresh token triggers family revocation.
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": old_refresh},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert replay.status_code == 401

        # Family revocation bumped token_version: the current access cookie is dead.
        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 401

    async def test_logout_via_cookie_revokes_and_clears(self, client, test_user):
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        old_refresh = client.cookies.get("refresh_token")

        logout = await client.post(
            "/api/v1/auth/logout", json={}, headers={"X-CSRF-Token": client.cookies.get("csrf_token")}
        )
        assert logout.status_code == 204
        # Cookies are cleared server-side.
        assert client.cookies.get("access_token") is None
        assert client.cookies.get("refresh_token") is None

        # Refresh after logout is rejected.
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": old_refresh},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token") or "x"},
        )
        assert replay.status_code == 401


class TestNoTokenExposureInJson:
    """Security contract: login/refresh JSON responses contain NO JWT
    material. Browser JS can read the response body but NOT the HttpOnly
    cookies, so echoing tokens in the body would defeat HttpOnly. The
    session is carried exclusively by the Set-Cookie headers."""

    async def test_login_json_contains_no_jwt(self, client, test_user):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" not in body
        assert "refresh_token" not in body
        assert "Authorization" not in body
        # The session is present, in the HttpOnly cookies.
        assert client.cookies.get("access_token")
        assert client.cookies.get("refresh_token")

    async def test_refresh_json_contains_no_jwt(self, client, test_user):
        await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        old_refresh = client.cookies.get("refresh_token")
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" not in body
        assert "refresh_token" not in body
        # Rotation still happened — via the HttpOnly cookie.
        assert client.cookies.get("refresh_token") != old_refresh

    async def test_logout_json_contains_no_jwt(self, client, test_user):
        await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        resp = await client.post(
            "/api/v1/auth/logout",
            json={},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert resp.status_code == 204
        assert resp.content == b""

    async def test_authentication_still_works_via_cookies(self, client, test_user):
        """After the contract change the full cookie flow still works:
        login -> authenticated request -> refresh -> logout -> refresh denied."""
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert login.status_code == 200

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200

        old_refresh = client.cookies.get("refresh_token")
        refresh = await client.post(
            "/api/v1/auth/refresh",
            json={},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert refresh.status_code == 200
        assert client.cookies.get("refresh_token") != old_refresh

        logout = await client.post(
            "/api/v1/auth/logout",
            json={},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert logout.status_code == 204

        after = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": old_refresh},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token") or "x"},
        )
        assert after.status_code == 401

    async def test_replay_detection_still_works_after_contract_change(self, client, test_user):
        await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        old_refresh = client.cookies.get("refresh_token")
        r1 = await client.post(
            "/api/v1/auth/refresh",
            json={},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert r1.status_code == 200
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": old_refresh},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert replay.status_code == 401
        # Family revocation: current access cookie is dead too.
        assert (await client.get("/api/v1/auth/me")).status_code == 401


class TestCsrf:
    async def _login(self, client):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert resp.status_code == 200

    async def test_state_changing_without_csrf_header_403(self, client, test_user):
        await self._login(client)
        resp = await client.post("/api/v1/auth/logout", json={})
        assert resp.status_code == 403
        assert "CSRF" in resp.json()["detail"]

    async def test_state_changing_with_wrong_csrf_header_403(self, client, test_user):
        await self._login(client)
        resp = await client.post(
            "/api/v1/auth/logout", json={}, headers={"X-CSRF-Token": "forged-value"}
        )
        assert resp.status_code == 403

    async def test_state_changing_with_correct_csrf_header_ok(self, client, test_user):
        await self._login(client)
        resp = await client.post(
            "/api/v1/auth/logout",
            json={},
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert resp.status_code == 204

    async def test_cross_site_origin_rejected_even_with_csrf_header(self, client, test_user):
        await self._login(client)
        resp = await client.post(
            "/api/v1/auth/logout",
            json={},
            headers={
                "X-CSRF-Token": client.cookies.get("csrf_token"),
                "Origin": "https://attacker.example.com",
            },
        )
        assert resp.status_code == 403

    async def test_login_csrf_blocked_by_origin(self, client):
        # Even login (no cookies yet) rejects a cross-site Origin.
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
            headers={"Origin": "https://attacker.example.com"},
        )
        assert resp.status_code == 403

    async def test_safe_methods_not_csrf_checked(self, client, test_user):
        await self._login(client)
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 200
