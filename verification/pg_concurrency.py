"""Phase 6 (cont.) — PostgreSQL-specific runtime checks.

* Concurrent refresh with the SAME refresh token: single-use must hold.
* Duplicate upload: unique file_hash constraint -> 409, not a crash.
* Replay of a consumed token after rotation -> 401 + family revocation.
* RefreshSession rows visible in Postgres (durable session state).
"""
import asyncio
import os
import sys
import time

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

BASE = "http://127.0.0.1:8000"
PASS: list[str] = []
FAIL: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    if cond:
        PASS.append(name)
        print(f"  PASS {name} {extra}")
    else:
        FAIL.append(name)
        print(f"  FAIL {name} {extra}")


def new_client(ip: str) -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=300, headers={"X-Forwarded-For": ip})


def csrf_h(c: httpx.Client) -> dict:
    t = c.cookies.get("csrf_token")
    return {"X-CSRF-Token": t} if t else {}


print("== A. concurrent refresh with the same token (single-use under Postgres) ==")
c = new_client("10.0.6.1")
r = c.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("login -> 200", r.status_code == 200, f"(got {r.status_code})")
rt = c.cookies.get("refresh_token")
csrf = c.cookies.get("csrf_token")

async def _concurrent_refresh(token: str, csrf_val: str, n: int = 10):
    async with httpx.AsyncClient(base_url=BASE, timeout=60,
                                 headers={"X-Forwarded-For": "10.0.6.1"}) as ac:
        results = await asyncio.gather(*[
            ac.post("/api/v1/auth/refresh", json={"refresh_token": token},
                    headers={"X-CSRF-Token": csrf_val})
            for _ in range(n)
        ])
        return [res.status_code for res in results]

codes = asyncio.run(_concurrent_refresh(rt, csrf))
ok = sum(1 for x in codes if x == 200)
denied = sum(1 for x in codes if x == 401)
print(f"    statuses={sorted(set(codes))} 200s={ok} 401s={denied}")
check("exactly one concurrent refresh succeeds (single-use)", ok == 1, f"(got {ok} x 200)")
check("remaining concurrent refreshes denied 401", denied == len(codes) - 1, f"(got {denied})")

# Family revoked by the replays: the access cookie is dead now.
me = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {c.cookies.get('access_token')}"})
check("access token dead after concurrent replay (family revoke)", me.status_code == 401,
      f"(got {me.status_code})")

print("== B. unique file_hash constraint (duplicate upload -> 409) ==")
import io  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

rng = np.random.default_rng(9)
y, x = np.mgrid[0:256, 0:256]
base = np.clip(200 - np.sqrt((x - 128) ** 2 + (y - 128) ** 2) * 0.9, 40, 200)
img = Image.fromarray(np.clip(base + rng.normal(0, 18, (256, 256)), 0, 255).astype("uint8"), "L").convert("RGB")
buf = io.BytesIO()
img.save(buf, "PNG")
png = buf.getvalue()

c2 = new_client("10.0.6.2")
r = c2.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("login -> 200", r.status_code == 200, f"(got {r.status_code})")
r1 = c2.post("/api/v1/scans/upload", files={"file": ("dup.png", png, "image/png")},
             data={"anonymized_patient_id": "PT-DUP-1"}, headers=csrf_h(c2))
check("first upload -> 201", r1.status_code == 201, f"(got {r1.status_code})")
r2 = c2.post("/api/v1/scans/upload", files={"file": ("dup.png", png, "image/png")},
             data={"anonymized_patient_id": "PT-DUP-1"}, headers=csrf_h(c2))
check("duplicate upload (same bytes) -> 409 unique constraint", r2.status_code == 409,
      f"(got {r2.status_code} {r2.json().get('detail')})")

print("== C. RefreshSession rows persisted in PostgreSQL ==")
import asyncio as _a  # noqa: E402
from sqlalchemy import text  # noqa: E402
from app.db.session import async_session_maker  # noqa: E402


async def _rows():
    async with async_session_maker() as s:
        res = await s.execute(text(
            "SELECT count(*), count(*) FILTER (WHERE revoked_at IS NOT NULL) "
            "FROM refresh_sessions"
        ))
        return res.fetchone()


total, revoked = _a.run(_rows())
print(f"    refresh_sessions rows in Postgres: total={total} revoked={revoked}")
check("refresh_sessions table populated", total >= 4, f"(total={total})")
check("revoked (rotated/replayed) sessions recorded", revoked >= 3, f"(revoked={revoked})")

print()
print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
