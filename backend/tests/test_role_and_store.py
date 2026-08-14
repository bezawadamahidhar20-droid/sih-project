"""Privilege-escalation and security-state-store regression tests.

Role management: the application has exactly three roles
(doctor / radiologist / staff) and NO admin role exists, so nobody can
escalate to an administrative role. Self-role/status changes are blocked,
staff cannot manage roles, and a doctor changing a peer's role stays within
the documented three-role policy.

Store contract: the shared sliding-window store (in-memory by default,
Redis when USE_REDIS=true) must enforce limits and support reset/clear.
"""

import pytest


class TestNoPrivilegeEscalation:
    def test_no_admin_role_exists(self):
        """There is no ADMIN role in the system — escalation to an
        administrative role is impossible by construction."""
        from app.db.models import UserRole

        assert set(r.value for r in UserRole) == {"doctor", "radiologist", "staff"}
        assert "admin" not in set(r.value for r in UserRole)

    async def test_register_with_admin_role_rejected(self, client, auth_headers):
        resp = await client.post(
            "/api/v1/auth/register",
            json={
                "username": "wannabe",
                "email": "wannabe@example.com",
                "password": "password123",
                "role": "admin",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422  # pydantic enum rejects 'admin'

    async def test_cannot_set_own_role_to_admin(self, client, test_user, auth_headers):
        resp = await client.patch(
            f"/api/v1/auth/users/{test_user.id}",
            json={"role": "admin"},
            headers=auth_headers,
        )
        assert resp.status_code == 422  # invalid enum value, not silently applied

    async def test_staff_cannot_change_any_role(self, client, test_user, staff_headers):
        resp = await client.patch(
            f"/api/v1/auth/users/{test_user.id}",
            json={"role": "radiologist"},
            headers=staff_headers,
        )
        assert resp.status_code == 403

    async def test_self_role_change_always_blocked(self, client, test_user, auth_headers):
        """Even a valid role cannot be self-applied (self-protection)."""
        resp = await client.patch(
            f"/api/v1/auth/users/{test_user.id}",
            json={"role": "radiologist"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_doctor_role_change_within_documented_policy(self, client, test_user, db_session, auth_headers):
        """Documented business rule: doctor/radiologist may administer the
        three roles (this application has no separate admin role). The
        change is audit-logged via the token_version bump (revokes the
        target's sessions)."""
        from app.db.models import User, UserRole
        from app.core.security import get_password_hash
        from sqlalchemy import select

        peer = User(
            username="peer_doc",
            email="peer@example.com",
            hashed_password=get_password_hash("testpass123"),
            role=UserRole.DOCTOR,
            is_active=True,
        )
        db_session.add(peer)
        await db_session.commit()
        await db_session.refresh(peer)

        resp = await client.patch(
            f"/api/v1/auth/users/{peer.id}",
            json={"role": "staff"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "staff"
        # The target's token_version was bumped (sessions revoked).
        fresh = (await db_session.execute(select(User).where(User.id == peer.id))).scalar_one()
        assert fresh.token_version == 1


class TestSlidingWindowStore:
    async def test_in_memory_store_enforces_limit_and_resets(self):
        from app.core.stores import InMemorySlidingWindowStore

        store = InMemorySlidingWindowStore()
        key = "login:1.2.3.4:user"
        assert await store.is_over_limit(key, 60, 3) is False
        await store.record(key, 60)
        await store.record(key, 60)
        assert await store.is_over_limit(key, 60, 3) is False
        await store.record(key, 60)
        assert await store.is_over_limit(key, 60, 3) is True  # 3 events in window

        await store.reset(key)
        assert await store.is_over_limit(key, 60, 3) is False

    async def test_in_memory_store_expires_old_events(self):
        from app.core.stores import InMemorySlidingWindowStore

        store = InMemorySlidingWindowStore()
        key = "login:1.2.3.4:user"
        await store.record(key, 60)
        # Expire the window: events outside it no longer count.
        store._windows[key][0] -= 61
        assert await store.is_over_limit(key, 60, 1) is False

    def test_workers_gt_1_requires_redis(self):
        from app.core.config import Settings

        base = {
            "jwt_secret_key": "f" * 64,
            "encryption_key": "e" * 64,
            "encryption_salt": "s" * 32,
            "database_url": "sqlite+aiosqlite:///:memory:",
            "environment": "production",
        }
        with pytest.raises(ValueError, match="WORKERS must be 1"):
            Settings(_env_file=None, workers=4, use_redis=False, **base)

        # With Redis enabled, multiple workers are permitted by config.
        settings = Settings(_env_file=None, workers=4, use_redis=True, redis_url="redis://localhost:6379/0", **base)
        assert settings.workers == 4
