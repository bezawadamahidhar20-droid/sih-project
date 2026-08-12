import os
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

pytest_plugins = ["pytest_asyncio"]


def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: mark test as async")


# Tests exercise the proxy-aware client-IP path (login lockout, rate limits)
# exactly as the docker-compose deployment runs it.
os.environ.setdefault("TRUST_PROXY_HEADERS", "true")


from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base, get_db
from app.db.models import User, UserRole
from app.core.security import get_password_hash, create_access_token

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture(autouse=True)
def _reset_login_rate_limiter():
    """The login rate limiter and the consumed-refresh-token store are
    process-global in-memory stores; clear them between tests so failed-login
    / refresh-rotation tests never bleed into the next one."""
    from app.api.routes.auth import _LOGIN_FAILURES, _CONSUMED_REFRESH_JTIS
    _LOGIN_FAILURES.clear()
    _CONSUMED_REFRESH_JTIS.clear()
    yield


@pytest.fixture(autouse=True)
def _reset_endpoint_rate_limiters():
    """Clear the upload/predict sliding-window limiters between tests so a
    test that exhausts a budget cannot bleed into the next one."""
    from app.core.ratelimit import upload_limiter, predict_limiter
    upload_limiter.clear()
    predict_limiter.clear()
    yield
    upload_limiter.clear()
    predict_limiter.clear()


@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session():
    async with TestingSessionLocal() as session:
        yield session
    # Wipe all rows so the shared in-memory DB stays isolated between tests.
    async with TestingSessionLocal() as cleanup:
        for table in reversed(Base.metadata.sorted_tables):
            await cleanup.execute(table.delete())
        await cleanup.commit()


@pytest.fixture
async def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    # Starlette's ServerErrorMiddleware always re-raises unhandled exceptions
    # after sending the 500 (so the server can log them); with the default
    # raise_app_exceptions=True that escapes into the test. Match real client
    # behavior: see the 500 response, not the exception.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(
        transport=transport, base_url="http://test", follow_redirects=True
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session):
    # Idempotent: remove any leftover rows from previous tests in the shared
    # in-memory database before inserting a fresh user.
    await db_session.execute(delete(User).where(User.username == "testuser"))
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=get_password_hash("testpass123"),
        role=UserRole.DOCTOR,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_staff(db_session):
    await db_session.execute(delete(User).where(User.username == "staffuser"))
    user = User(
        username="staffuser",
        email="staff@example.com",
        hashed_password=get_password_hash("testpass123"),
        role=UserRole.STAFF,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user):
    token = create_access_token(data={"sub": str(test_user.id), "role": test_user.role.value})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def staff_headers(test_staff):
    token = create_access_token(data={"sub": str(test_staff.id), "role": test_staff.role.value})
    return {"Authorization": f"Bearer {token}"}
