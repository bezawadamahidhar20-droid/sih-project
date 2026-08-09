"""Idempotent seeding of demo accounts.

Gated by ``SEED_DEMO_USERS=true`` or a non-production environment so that
production deployments are not silently given default credentials.
"""

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import get_password_hash
from app.db.models import User, UserRole
from app.db.session import async_session_maker

logger = get_logger(__name__)

DEMO_USERS = [
    {
        "username": "doctor",
        "email": "doctor@mediscan.com",
        "password": "DemoPass123!",
        "full_name": "Dr. Sarah Chen",
        "role": UserRole.DOCTOR,
    },
    {
        "username": "radiologist",
        "email": "radiologist@mediscan.com",
        "password": "DemoPass123!",
        "full_name": "Dr. James Okafor",
        "role": UserRole.RADIOLOGIST,
    },
    {
        "username": "staff",
        "email": "staff@mediscan.com",
        "password": "DemoPass123!",
        "full_name": "Maya Patel",
        "role": UserRole.STAFF,
    },
]


async def seed_demo_users() -> None:
    settings = get_settings()
    if not (settings.seed_demo_users or settings.environment != "production"):
        return

    if settings.environment == "production":
        logger.warning(
            "Seeding demo accounts with well-known credentials in a 'production' "
            "environment. Disable with SEED_DEMO_USERS=false for any public deployment."
        )

    async with async_session_maker() as session:
        total = await session.scalar(select(func.count()).select_from(User))
        if total and total > 0:
            return

        for entry in DEMO_USERS:
            session.add(
                User(
                    username=entry["username"],
                    email=entry["email"],
                    hashed_password=get_password_hash(entry["password"]),
                    full_name=entry["full_name"],
                    role=entry["role"],
                )
            )

        await session.commit()
        logger.info("Seeded %d demo users", len(DEMO_USERS))
