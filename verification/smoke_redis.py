"""Phase 3 — live Redis-backed security state (single worker, USE_REDIS=true).

Covers: login lockout build-up, CSRF double-submit + origin check, refresh
rotation + replay family-revoke, per-user predict rate limiting. Redis key
evidence is collected separately with redis-cli.
"""
import os
import re
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


def cookie_flags(resp: httpx.Response) -> dict:
    """Parse Set-Cookie headers -> {name: set-of-attributes}."""
    out: dict[str, set] = {}
    for header in resp.headers.get_list("set-cookie"):
        m = re.match(r"^([^=]+)=([^;]*)(.*)$", header)
        if not m:
            continue
        attrs = set()
        for part in (m.group(3) or "").split(";"):
            part = part.strip().lower()
            if part:
                attrs.add(part)
        out[m.group(1)] = attrs
    return out


def make_unique_png(path: str, seed: int) -> bytes:
    """Synthetic, non-PHI, X-ray-like 256x256 PNG (unique per seed)."""
    import numpy as np
    from PIL import Image
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:256, 0:256]
    # radial "lung field" gradient + structured noise -> plausible std
    base = np.clip(200 - np.sqrt((x - 128) ** 2 + (y - 128) ** 2) * 0.9, 40, 200)
    noise = rng.normal(0, 18, (256, 256))
    img = np.clip(base + noise, 0, 255).astype("uint8")
    im = Image.fromarray(img, "L").convert("RGB")
    im.save(path, "PNG")
    return open(path, "rb").read()


# ------------------------------------------------------------------ A. lockout
print("== A. login lockout (Redis-backed) ==")
c = new_client("10.0.0.1")
codes = [c.post("/api/v1/auth/login", json={"username": "locktest", "password": "wrong"}).status_code
         for _ in range(5)]
check("5 wrong logins all 401", codes == [401] * 5, f"(got {codes})")
r = c.post("/api/v1/auth/login", json={"username": "locktest", "password": "E2ePass123!"})
check("6th attempt with correct password -> 429 (locked)", r.status_code == 429,
      f"(got {r.status_code} {r.json().get('detail')})")
check("429 carries Retry-After", r.headers.get("retry-after") is not None,
      f"(hdr={r.headers.get('retry-after')})")

# ------------------------------------------------------------------ B. CSRF
print("== B. CSRF double-submit + origin check ==")
c2 = new_client("10.0.0.2")
r = c2.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("login doctore2e -> 200", r.status_code == 200, f"(got {r.status_code})")
flags = cookie_flags(r)
check("access_token cookie is HttpOnly+SameSite=Lax",
      "httponly" in flags.get("access_token", set()) and "samesite=lax" in flags.get("access_token", set()),
      f"(flags={sorted(flags.get('access_token', set()))})")
check("refresh_token cookie is HttpOnly+SameSite=Strict+path=/api/v1/auth",
      "httponly" in flags.get("refresh_token", set())
      and "samesite=strict" in flags.get("refresh_token", set())
      and "path=/api/v1/auth" in flags.get("refresh_token", set()),
      f"(flags={sorted(flags.get('refresh_token', set()))})")
check("csrf_token cookie is NOT HttpOnly (readable by SPA)",
      "csrf_token" in flags and "httponly" not in flags.get("csrf_token", set()),
      f"(flags={sorted(flags.get('csrf_token', set()))})")

r = c2.post("/api/v1/auth/logout", json={})  # cookie-authenticated, no CSRF header
check("state-changing POST without X-CSRF-Token -> 403", r.status_code == 403, f"(got {r.status_code})")
r = c2.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong-token"}, json={})
check("state-changing POST with wrong X-CSRF-Token -> 403", r.status_code == 403, f"(got {r.status_code})")
r = c2.post("/api/v1/auth/logout", headers=csrf_h(c2), json={})
check("state-changing POST with correct CSRF -> 204", r.status_code == 204, f"(got {r.status_code})")

r = c2.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"},
            headers={"Origin": "http://evil.example"})
check("login with cross-site Origin -> 403", r.status_code == 403, f"(got {r.status_code})")
r = c2.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"},
            headers={"Origin": "http://localhost:5173"})
check("login with allowlisted Origin -> 200", r.status_code == 200, f"(got {r.status_code})")

# ------------------------------------------------------------- C. refresh
print("== C. refresh rotation + replay family-revoke ==")
c3 = new_client("10.0.0.3")
r = c3.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("login for rotation test -> 200", r.status_code == 200, f"(got {r.status_code})")
at0 = c3.cookies.get("access_token")
rt0 = c3.cookies.get("refresh_token")
r = c3.post("/api/v1/auth/refresh", json={}, headers=csrf_h(c3))  # refresh token travels in HttpOnly cookie
check("refresh via cookie -> 200", r.status_code == 200, f"(got {r.status_code})")
rt1 = c3.cookies.get("refresh_token")
check("refresh token rotated (new value issued)", rt1 is not None and rt1 != rt0)
r = c3.post("/api/v1/auth/refresh", json={"refresh_token": rt0}, headers=csrf_h(c3))  # replay of old token
check("replay of consumed refresh token -> 401", r.status_code == 401, f"(got {r.status_code})")
r = c3.get("/api/v1/auth/me")
check("access token minted before replay is revoked (token_version bumped) -> 401",
      r.status_code == 401, f"(got {r.status_code})")

# ------------------------------------------------------------- D. rate limit
print("== D. per-user predict rate limit (budget 5/min) ==")
c4 = new_client("10.0.0.4")
r = c4.post("/api/v1/auth/login", json={"username": "ratetest", "password": "E2ePass123!"})
check("login ratetest -> 200", r.status_code == 200, f"(got {r.status_code})")
png = make_unique_png(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".ratetest.png"), seed=7)
r = c4.post("/api/v1/scans/upload", files={"file": ("ratetest.png", png, "image/png")},
            data={"anonymized_patient_id": "PT-RATE-1"}, headers=csrf_h(c4))
check("upload ratetest -> 201", r.status_code == 201, f"(got {r.status_code})")
scan_id = r.json()["id"]
r = c4.post(f"/api/v1/predictions/predict/{scan_id}", headers=csrf_h(c4))
check("first predict -> 200 (real inference)", r.status_code == 200, f"(got {r.status_code})")
ok = True
for i in range(4):
    rr = c4.post(f"/api/v1/predictions/predict/{scan_id}", headers=csrf_h(c4))
    if rr.status_code != 200:
        ok = False
        print(f"    cached predict #{i+2} -> {rr.status_code} (expected 200)")
check("predicts 2..5 -> 200 (within budget)", ok)
r = c4.post(f"/api/v1/predictions/predict/{scan_id}", headers=csrf_h(c4))
check("6th predict -> 429 (budget exhausted)", r.status_code == 429, f"(got {r.status_code})")

# ------------------------------------------------------- E. pre-restart token
print("== E. capture pre-restart refresh token for persistence test ==")
c5 = new_client("10.0.0.6")
r = c5.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("login for restart-persistence token -> 200", r.status_code == 200, f"(got {r.status_code})")
rt_pre = c5.cookies.get("refresh_token")
if rt_pre:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".pre_restart_refresh"), "w") as f:
        f.write(rt_pre)
    print("  saved pre-restart refresh token")
else:
    check("pre-restart refresh token captured", False)

print()
print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
