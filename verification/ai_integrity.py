"""Phase 10 — AI integrity, live.

Instance on :8001: MODEL_PATH points at a missing file,
ALLOW_HEURISTIC_FALLBACK=false (production default). Prediction must FAIL
loudly (500), never fall back to the heuristic. /health must report
model_loaded=false and heuristic_fallback_active=false. Also verifies the
Secure attribute on auth cookies (COOKIE_SECURE=true, production default).

Instance on :8002: same missing model but ALLOW_HEURISTIC_FALLBACK=true —
the heuristic engine is reachable ONLY when explicitly opted in (dev), and
the prediction row must report engine=baseline-heuristic so the engine is
never hidden.
"""
import os
import re
import sys

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

HERE = os.path.dirname(os.path.abspath(__file__))
PASS: list[str] = []
FAIL: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    if cond:
        PASS.append(name)
        print(f"  PASS {name} {extra}")
    else:
        FAIL.append(name)
        print(f"  FAIL {name} {extra}")


scan_id = open(os.path.join(HERE, ".e2e_scan_id")).read().strip()
pred_id = open(os.path.join(HERE, ".e2e_pred_id")).read().strip()


def login(port: int, ip: str) -> httpx.Client:
    c = httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=300,
                     headers={"X-Forwarded-For": ip})
    r = c.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
    check(f"login on :{port} -> 200", r.status_code == 200, f"(got {r.status_code})")
    return c


def csrf_h(c: httpx.Client) -> dict:
    t = c.cookies.get("csrf_token")
    return {"X-CSRF-Token": t} if t else {}


print("== 1. production mode + missing model + fallback disabled -> FAIL LOUD ==")
c = login(8001, "10.0.3.1")
# COOKIE_SECURE=true: httpx (like a browser) refuses to send Secure cookies
# over plain HTTP, so authenticate with the Bearer token from the login body.
access = c.cookies.get("access_token")
if not access:
    # Secure cookie was not stored/resent — use the body token instead.
    access = None
r = c.get("/api/v1/health")
h = r.json()
check("health: model NOT loaded", h.get("model_loaded") is False, f"(got {h.get('model_loaded')})")
check("health: heuristic fallback NOT active", h.get("heuristic_fallback_active") is False,
      f"(got {h.get('heuristic_fallback_active')})")
# Re-login capturing the body access token for Bearer auth (Secure cookies
# are not resent over plain HTTP).
rlogin = httpx.post("http://127.0.0.1:8001/api/v1/auth/login",
                    json={"username": "doctore2e", "password": "E2ePass123!"},
                    headers={"X-Forwarded-For": "10.0.3.1"}, timeout=60)
# No JWT in the login JSON body (security contract); the token is in the
# Set-Cookie header, which an HTTP client reads regardless of HttpOnly.
body_at = None
for header in rlogin.headers.get_list("set-cookie"):
    if header.split(";", 1)[0].strip().startswith("access_token="):
        body_at = header.split(";", 1)[0].split("=", 1)[1]
        break
assert body_at, "access_token cookie not found in login response"
bearer = {"X-Forwarded-For": "10.0.3.1", "Authorization": f"Bearer {body_at}"}
# Fresh scan: the E2E scan is already COMPLETED with a cached prediction, so
# predicting it returns the cached result without touching the model.
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import io as _io  # noqa: E402
rng = np.random.default_rng(31)
yy, xx = np.mgrid[0:256, 0:256]
base = np.clip(200 - np.sqrt((xx - 128) ** 2 + (yy - 128) ** 2) * 0.9, 40, 200)
noise = rng.normal(0, 18, (256, 256))
img = Image.fromarray(np.clip(base + noise, 0, 255).astype("uint8"), "L").convert("RGB")
buf = _io.BytesIO()
img.save(buf, "PNG")
up = httpx.post("http://127.0.0.1:8001/api/v1/scans/upload",
                headers=bearer,
                files={"file": ("fail_loud_probe.png", buf.getvalue(), "image/png")},
                data={"anonymized_patient_id": "PT-FAIL-1"}, timeout=300)
check("fresh upload on fail-loud instance -> 201", up.status_code == 201, f"(got {up.status_code})")
fresh_id = up.json()["id"]
r = httpx.post(f"http://127.0.0.1:8001/api/v1/predictions/predict/{fresh_id}",
               headers=bearer, timeout=300)
check("predict with missing model -> 500 (no guessed diagnosis)", r.status_code == 500,
      f"(got {r.status_code} {r.json().get('detail')})")

# Secure cookies on the production-default instance
r2 = httpx.post("http://127.0.0.1:8001/api/v1/auth/login",
                json={"username": "doctore2e", "password": "E2ePass123!"},
                headers={"X-Forwarded-For": "10.0.3.2"}, timeout=60)
sc = {}
for header in r2.headers.get_list("set-cookie"):
    m = re.match(r"^([^=]+)=", header)
    if m:
        sc[m.group(1)] = header
check("COOKIE_SECURE=true -> access_token cookie has Secure flag",
      "access_token" in sc and "Secure" in sc["access_token"],
      f"(secure={'; Secure;' in sc.get('access_token', '')})")

print("== 2. heuristic reachable ONLY when explicitly enabled (dev opt-in) ==")
c2 = login(8002, "10.0.3.3")
r = c2.get("/api/v1/health")
h2 = r.json()
check("health: heuristic fallback active (explicit opt-in)",
      h2.get("heuristic_fallback_active") is True, f"(got {h2.get('heuristic_fallback_active')})")
# Use a FRESH scan: the E2E scan was already predicted (cached resnet50
# result is returned by design). Upload a new unique image on this instance.
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import io as _io  # noqa: E402
rng = np.random.default_rng(21)
yy, xx = np.mgrid[0:256, 0:256]
base = np.clip(200 - np.sqrt((xx - 128) ** 2 + (yy - 128) ** 2) * 0.9, 40, 200)
noise = rng.normal(0, 18, (256, 256))
img = Image.fromarray(np.clip(base + noise, 0, 255).astype("uint8"), "L").convert("RGB")
buf = _io.BytesIO()
img.save(buf, "PNG")
up = c2.post("/api/v1/scans/upload",
             files={"file": ("heuristic_probe.png", buf.getvalue(), "image/png")},
             data={"anonymized_patient_id": "PT-HEUR-1"}, headers=csrf_h(c2))
check("fresh upload on heuristic instance -> 201", up.status_code == 201, f"(got {up.status_code})")
fresh_scan = up.json()["id"]
r = c2.post(f"/api/v1/predictions/predict/{fresh_scan}", headers=csrf_h(c2))
check("predict succeeds with heuristic when ALLOW_HEURISTIC_FALLBACK=true", r.status_code == 200,
      f"(got {r.status_code})")
if r.status_code == 200:
    engine = r.json()["prediction"].get("model_architecture")
    check("engine reported honestly as baseline-heuristic", engine == "baseline-heuristic",
          f"(got {engine})")

print()
print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
