"""Phase 4 — WORKERS=2 with USE_REDIS=true.

Every request opens a FRESH TCP connection so consecutive requests land on
different uvicorn worker processes (the OS distributes the shared listening
socket). If security state were per-process, a budget of 5/min would allow
~10 calls across two workers before any 429; a lockout of 5 failures would
need ~10. Only a shared Redis store produces 429 at exactly the 6th call —
that is the evidence that worker 1 and worker 2 share state.
"""
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


def call(method: str, path: str, ip: str, cookies=None, csrf=None, auth=None, **kw):
    headers = {"X-Forwarded-For": ip}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if auth:
        headers["Authorization"] = auth
    return httpx.request(method, BASE + path, headers=headers, cookies=cookies,
                         timeout=300, **kw)


def login(ip: str, username: str):
    r = call("POST", "/api/v1/auth/login", ip, json={"username": username, "password": "E2ePass123!"})
    cookies = {}
    for name, value in r.cookies.items():
        cookies[name] = value
    csrf = cookies.get("csrf_token")
    return r, cookies, csrf


def make_unique_png(seed: int) -> bytes:
    import numpy as np
    from PIL import Image
    import io
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:256, 0:256]
    base = np.clip(200 - np.sqrt((x - 128) ** 2 + (y - 128) ** 2) * 0.9, 40, 200)
    noise = rng.normal(0, 18, (256, 256))
    img = np.clip(base + noise, 0, 255).astype("uint8")
    im = Image.fromarray(img, "L").convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


# ---------------------------------------------- 1. rate limit shared across workers
print("== 1. predict rate limit shared across workers (budget 5/min) ==")
r, cookies, csrf = login("10.0.1.1", "mprate")
check("login mprate -> 200", r.status_code == 200, f"(got {r.status_code})")
png = make_unique_png(seed=11)
r = call("POST", "/api/v1/scans/upload", "10.0.1.1", cookies=cookies, csrf=csrf,
         files={"file": ("mprate.png", png, "image/png")}, data={"anonymized_patient_id": "PT-MP-1"})
check("upload mprate -> 201", r.status_code == 201, f"(got {r.status_code})")
scan_id = r.json()["id"]
r = call("POST", f"/api/v1/predictions/predict/{scan_id}", "10.0.1.1", cookies=cookies, csrf=csrf)
check("first predict -> 200", r.status_code == 200, f"(got {r.status_code})")
codes = []
for i in range(5):
    rr = call("POST", f"/api/v1/predictions/predict/{scan_id}", "10.0.1.1", cookies=cookies, csrf=csrf)
    codes.append(rr.status_code)
check("predicts 2..6 -> 429 on exactly the 6th (shared window across workers)",
      codes == [200, 200, 200, 200, 429], f"(got {codes})")

# ---------------------------------------------- 2. lockout shared across workers
print("== 2. login lockout shared across workers (5 failures -> locked) ==")
codes = []
for _ in range(5):
    rr = call("POST", "/api/v1/auth/login", "10.0.1.2", json={"username": "mplock", "password": "wrong"})
    codes.append(rr.status_code)
check("5 wrong logins across workers -> 401 x5", codes == [401] * 5, f"(got {codes})")
r = call("POST", "/api/v1/auth/login", "10.0.1.2", json={"username": "mplock", "password": "E2ePass123!"})
check("6th attempt with correct password -> 429 (shared lockout)", r.status_code == 429,
      f"(got {r.status_code})")

# ---------------------------------------------- 3. refresh rotation cross-worker
print("== 3. refresh rotation + replay across workers ==")
r, cookies, csrf = login("10.0.1.3", "mpuser")
check("login mpuser -> 200", r.status_code == 200, f"(got {r.status_code})")
at0 = cookies.get("access_token")
rt0 = cookies.get("refresh_token")
r = call("POST", "/api/v1/auth/refresh", "10.0.1.3", cookies=cookies, csrf=csrf, json={})
check("refresh (worker B) -> 200", r.status_code == 200, f"(got {r.status_code})")
rt1 = r.cookies.get("refresh_token")
check("refresh token rotated", rt1 is not None and rt1 != rt0)
r = call("POST", "/api/v1/auth/refresh", "10.0.1.3", cookies=cookies, csrf=csrf, json={"refresh_token": rt0})
check("replay consumed refresh (worker A) -> 401 family revoke", r.status_code == 401,
      f"(got {r.status_code})")
r = call("GET", "/api/v1/auth/me", "10.0.1.3", auth=f"Bearer {at0}")
check("pre-replay access token now revoked -> 401", r.status_code == 401, f"(got {r.status_code})")

# ---------------------------------------------- 4. CSRF across workers
print("== 4. CSRF enforced across workers ==")
r, cookies, csrf = login("10.0.1.4", "mpuser2")
check("login mpuser2 -> 200", r.status_code == 200, f"(got {r.status_code})")
r = call("POST", "/api/v1/auth/logout", "10.0.1.4", cookies=cookies, csrf="wrong", json={})
check("wrong CSRF (worker A) -> 403", r.status_code == 403, f"(got {r.status_code})")
r = call("POST", "/api/v1/auth/logout", "10.0.1.4", cookies=cookies, csrf=csrf, json={})
check("correct CSRF (worker B) -> 204", r.status_code == 204, f"(got {r.status_code})")

print()
print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
