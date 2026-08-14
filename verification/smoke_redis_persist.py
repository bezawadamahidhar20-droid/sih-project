"""Phase 3 (cont.) — security state survives a BACKEND restart.

Redis keeps running; the backend process is restarted. The login lockout
counters and rate-limit windows live in Redis, so they must still be
enforced; the DB-backed refresh session must also still rotate.
"""
import os
import sys

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


HERE = os.path.dirname(os.path.abspath(__file__))

# 1. lockout persisted across restart (Redis, not process memory)
c = httpx.Client(base_url=BASE, timeout=60, headers={"X-Forwarded-For": "10.0.0.1"})
r = c.post("/api/v1/auth/login", json={"username": "locktest", "password": "E2ePass123!"})
check("locktest still locked out after backend restart -> 429", r.status_code == 429,
      f"(got {r.status_code})")

# 2. DB-backed refresh session survives restart (rotation still works)
rt_pre = open(os.path.join(HERE, ".pre_restart_refresh")).read().strip()
c2 = httpx.Client(base_url=BASE, timeout=60, headers={"X-Forwarded-For": "10.0.0.6"})
r = c2.post("/api/v1/auth/refresh", json={"refresh_token": rt_pre})
check("pre-restart refresh token still valid after restart -> 200", r.status_code == 200,
      f"(got {r.status_code})")
if r.status_code == 200:
    # Tokens travel only in HttpOnly cookies (no JWT in JSON body).
    new_at = c2.cookies.get("access_token")
    rr = c2.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_at}"})
    check("new access token from post-restart refresh works -> 200", rr.status_code == 200,
          f"(got {rr.status_code})")

# 3. CSRF still enforced after restart
c3 = httpx.Client(base_url=BASE, timeout=60, headers={"X-Forwarded-For": "10.0.0.7"})
r = c3.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("fresh login post-restart -> 200", r.status_code == 200, f"(got {r.status_code})")
r = c3.post("/api/v1/auth/logout", json={})
check("CSRF missing still rejected post-restart -> 403", r.status_code == 403, f"(got {r.status_code})")

print()
print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
