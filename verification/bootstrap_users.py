"""Insert the E2E test users directly into the verification DB.

register is role-gated (doctor/radiologist only), so a fresh production DB
has no API path to create the first user — the deployment story is seeding
via script/DB. Mirror that here (same pattern as app/db/seed.py).
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
sys.path.insert(0, os.getcwd())

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.models import User, UserRole
from app.db.session import async_session_maker

USERS = [
    # (username, email, role)
    ("doctore2e", "doctor_e2e@mediscan.local", UserRole.DOCTOR),
    ("staffe2e", "staff_e2e@mediscan.local", UserRole.STAFF),
    ("locktest", "locktest@mediscan.local", UserRole.DOCTOR),
    ("ratetest", "ratetest@mediscan.local", UserRole.DOCTOR),
    ("mprate", "mprate@mediscan.local", UserRole.DOCTOR),
    ("mplock", "mplock@mediscan.local", UserRole.DOCTOR),
    ("mpuser", "mpuser@mediscan.local", UserRole.DOCTOR),
    ("mpuser2", "mpuser2@mediscan.local", UserRole.DOCTOR),
]


async def main() -> None:
    async with async_session_maker() as session:
        existing = set(
            (await session.execute(select(User.username))).scalars().all()
        )
        n = 0
        for username, email, role in USERS:
            if username in existing:
                continue
            session.add(
                User(
                    username=username,
                    email=email,
                    hashed_password=get_password_hash("E2ePass123!"),
                    full_name=username,
                    role=role,
                    is_active=True,
                )
            )
            n += 1
        await session.commit()
        print(f"bootstrapped {n} user(s); db={os.environ.get('DATABASE_URL')}")


asyncio.run(main())
