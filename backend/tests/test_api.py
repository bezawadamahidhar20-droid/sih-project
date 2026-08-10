import pytest
from httpx import AsyncClient, ASGITransport

from app.core.security import create_refresh_token

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
        assert "model_path" in data
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
