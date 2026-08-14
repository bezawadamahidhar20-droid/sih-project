import pytest
from httpx import AsyncClient, ASGITransport

from app.core.security import create_refresh_token
from app.api.routes.auth import LOGIN_MAX_ATTEMPTS
from tests.conftest import csrf_headers

# Fixtures (client, test_user, test_staff, auth_headers, staff_headers,
# db_session, setup_db) are provided by tests/conftest.py.


class TestHealth:
    async def test_health_check(self, client: AsyncClient):
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "engine" in data
        # The trained CNN ships with the repo: production must report it loaded
        # and must NOT be silently running the dev-only heuristic engine.
        assert data["model_loaded"] is True
        assert data["engine"] != "baseline-heuristic"
        # model_path was removed from the public health payload (no internal
        # path disclosure on an unauthenticated endpoint).
        assert "model_path" not in data
        assert data["heuristic_fallback_active"] is False


class TestAuth:
    async def test_login_success(self, client: AsyncClient, test_user):
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_failure(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "wrongpass"},
        )
        assert response.status_code == 401

    async def test_get_me(self, client: AsyncClient, auth_headers):
        response = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["role"] == "doctor"

    async def test_refresh_token(self, client: AsyncClient, test_user):
        refresh_token = create_refresh_token(
            data={"sub": str(test_user.id), "role": test_user.role.value},
        )
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    async def test_staff_cannot_self_promote(self, client: AsyncClient, staff_headers):
        # Privilege-escalation regression: role/is_active are not part of the
        # self-update schema and are rejected outright.
        response = await client.patch(
            "/api/v1/auth/me",
            json={"role": "doctor"},
            headers=staff_headers,
        )
        assert response.status_code == 422

        me = await client.get("/api/v1/auth/me", headers=staff_headers)
        assert me.status_code == 200
        assert me.json()["role"] == "staff"

    async def test_staff_can_update_own_profile_fields(self, client: AsyncClient, staff_headers):
        response = await client.patch(
            "/api/v1/auth/me",
            json={"full_name": "Maya Updated", "email": "maya2@mediscan.com"},
            headers=staff_headers,
        )
        assert response.status_code == 200
        assert response.json()["full_name"] == "Maya Updated"
        assert response.json()["role"] == "staff"

    async def test_change_password_verifies_current(self, client: AsyncClient, auth_headers):
        bad = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "wrongpass", "new_password": "newpass123"},
            headers=auth_headers,
        )
        assert bad.status_code == 400

        good = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "testpass123", "new_password": "newpass123"},
            headers=auth_headers,
        )
        assert good.status_code == 204

        # Old password no longer works; the new one does.
        old = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "testpass123"},
        )
        assert old.status_code == 401

        new = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "newpass123"},
        )
        assert new.status_code == 200


class TestRefreshRotation:
    # Successful refreshes set the HttpOnly auth cookies in the client's jar,
    # so the follow-up request is cookie-authenticated and must carry the
    # double-submit CSRF header (csrf_headers() returns {} when the jar is
    # empty, so attaching it unconditionally is safe).
    async def test_refresh_token_is_single_use(self, client: AsyncClient, test_user):
        refresh_token = create_refresh_token(
            data={"sub": str(test_user.id), "role": test_user.role.value, "ver": 0},
        )
        first = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
            headers=csrf_headers(client),
        )
        assert first.status_code == 200

        # Replaying the same (now consumed) refresh token must be rejected.
        replay = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
            headers=csrf_headers(client),
        )
        assert replay.status_code == 401

    async def test_refresh_issues_new_token_chain(self, client: AsyncClient, test_user):
        refresh_token = create_refresh_token(
            data={"sub": str(test_user.id), "role": test_user.role.value, "ver": 0},
        )
        r1 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
            headers=csrf_headers(client),
        )
        assert r1.status_code == 200
        # The freshly issued refresh token rotates forward.
        r2 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": r1.json()["refresh_token"]},
            headers=csrf_headers(client),
        )
        assert r2.status_code == 200

    async def test_password_change_revokes_outstanding_tokens(
        self, client: AsyncClient, test_user, auth_headers
    ):
        old_access = auth_headers["Authorization"]
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "testpass123", "new_password": "newpass123"},
            headers=auth_headers,
        )
        assert resp.status_code == 204

        # The token issued before the password change is now revoked.
        me = await client.get("/api/v1/auth/me", headers={"Authorization": old_access})
        assert me.status_code == 401


class TestLoginLockout:
    async def test_lockout_keyed_by_proxy_client_ip(self, client: AsyncClient):
        # Regression: behind the nginx proxy every request shares one socket IP,
        # so the limiter must key on X-Forwarded-For — otherwise five failures
        # from the shared proxy IP would lock real users out.
        attacker_headers = {"X-Forwarded-For": "203.0.113.9"}
        for _ in range(LOGIN_MAX_ATTEMPTS):
            r = await client.post(
                "/api/v1/auth/login",
                json={"username": "victim", "password": "wrongpass"},
                headers=attacker_headers,
            )
            assert r.status_code == 401

        blocked = await client.post(
            "/api/v1/auth/login",
            json={"username": "victim", "password": "wrongpass"},
            headers=attacker_headers,
        )
        assert blocked.status_code == 429

        # A different client IP is not affected by the attacker's failures.
        other = await client.post(
            "/api/v1/auth/login",
            json={"username": "victim", "password": "wrongpass"},
            headers={"X-Forwarded-For": "203.0.113.10"},
        )
        assert other.status_code == 401


class TestScans:
    async def test_upload_scan_unauthorized(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("test.jpg", b"fake", "image/jpeg")},
        )
        assert response.status_code == 401

    async def test_upload_scan_invalid_file(self, client: AsyncClient, auth_headers):
        response = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("test.txt", b"not an image", "text/plain")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    async def test_list_scans(self, client: AsyncClient, auth_headers):
        response = await client.get("/api/v1/scans/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "scans" in data
        assert "total" in data


class TestPredictions:
    async def test_predict_nonexistent_scan(self, client: AsyncClient, auth_headers):
        response = await client.post(
            "/api/v1/predictions/predict/999", headers=auth_headers
        )
        assert response.status_code == 404

    async def test_list_predictions(self, client: AsyncClient, auth_headers):
        response = await client.get("/api/v1/predictions/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "predictions" in data
        assert "total" in data

    async def test_list_endpoints_accept_large_page_size(self, client: AsyncClient, auth_headers):
        # Regression: History/Patients/Review/Audit pages request 200-300 rows;
        # the list endpoints used to cap at 100 and returned 422, breaking
        # those pages entirely.
        response = await client.get("/api/v1/predictions/?page_size=300", headers=auth_headers)
        assert response.status_code == 200

        scans_resp = await client.get("/api/v1/scans/?page_size=300", headers=auth_headers)
        assert scans_resp.status_code == 200


class TestRBAC:
    async def test_staff_cannot_access_users(self, client: AsyncClient, staff_headers):
        response = await client.get("/api/v1/auth/users", headers=staff_headers)
        assert response.status_code == 403

    async def test_doctor_can_access_users(self, client: AsyncClient, auth_headers):
        response = await client.get("/api/v1/auth/users", headers=auth_headers)
        assert response.status_code == 200

    async def test_staff_can_upload(self, client: AsyncClient, staff_headers):
        response = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("test.jpg", b"fake image data", "image/jpeg")},
            headers=staff_headers,
        )
        assert response.status_code in [201, 400]

    async def test_staff_cannot_view_patient_history(
        self, client: AsyncClient, staff_headers
    ):
        response = await client.get(
            "/api/v1/predictions/patient/ANON123/history", headers=staff_headers
        )
        assert response.status_code == 403
