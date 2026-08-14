"""Phases 6-8 — production-mode E2E (local HTTP stand-in for the public HTTPS
smoke test), security smoke (IDOR/RBAC/JWT/CSRF/CORS), and PHI checks.

The SPA itself is cookie-based (verified in frontend/src/services/api.ts:
withCredentials + HttpOnly cookies, tokens never read from the body), so the
API-level flow below exercises exactly the browser path.
"""
import io
import os
import re
import sys
import time

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

BASE = os.environ.get("E2E_BASE", "http://127.0.0.1:8000")
VERIFY_SSL = os.environ.get("E2E_VERIFY", "1") == "1"
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


def new_client(ip: str) -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=300, verify=VERIFY_SSL,
                        headers={"X-Forwarded-For": ip})


def csrf_h(c: httpx.Client) -> dict:
    t = c.cookies.get("csrf_token")
    return {"X-CSRF-Token": t} if t else {}


def cookie_flags(resp: httpx.Response) -> dict:
    out: dict[str, set] = {}
    for header in resp.headers.get_list("set-cookie"):
        m = re.match(r"^([^=]+)=([^;]*)(.*)$", header)
        if not m:
            continue
        attrs = {p.strip().lower() for p in (m.group(3) or "").split(";") if p.strip()}
        out[m.group(1)] = attrs
    return out


def make_dicom_with_phi(pixel: bytes) -> bytes:
    import pydicom
    from pydicom.dataset import FileDataset, FileMetaDataset
    ds = FileDataset("phi.dcm", {}, preamble=b"\0" * 128, file_meta=FileMetaDataset())
    ds.file_meta.MediaStorageSOPClassUID = pydicom.uid.SecondaryCaptureImageStorage
    ds.file_meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
    ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
    ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = pydicom.uid.generate_uid()
    ds.StudyInstanceUID = pydicom.uid.generate_uid()
    ds.SeriesInstanceUID = pydicom.uid.generate_uid()
    ds.StudyID = "MRN-987654"
    ds.PatientName = "DOE^JOHN"
    ds.PatientID = "12345"
    ds.StudyDate = "20240101"
    ds.Modality = "DX"
    ds.BodyPartExamined = "CHEST"
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows = 64
    ds.Columns = 64
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.PixelData = pixel
    buf = io.BytesIO()
    ds.save_as(buf, enforce_file_format=True)
    return buf.getvalue()


# ------------------------------------------------------------------ health / AI
print("== 0. AI integrity via /health ==")
c = new_client("10.0.2.9")
r = c.get("/api/v1/health")
h = r.json()
check("health -> 200", r.status_code == 200, f"(got {r.status_code})")
check("real CNN loaded (model_loaded=true)", h.get("model_loaded") is True, f"(got {h.get('model_loaded')})")
check("engine is resnet50 (real weights)", h.get("engine") == "resnet50", f"(got {h.get('engine')})")
check("heuristic fallback NOT active", h.get("heuristic_fallback_active") is False,
      f"(got {h.get('heuristic_fallback_active')})")

# ------------------------------------------------------------- happy path
print("== 1. login + HttpOnly cookies ==")
c = new_client("10.0.2.1")
r = c.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("login -> 200", r.status_code == 200, f"(got {r.status_code})")
flags = cookie_flags(r)
check("access_token: HttpOnly + SameSite=Lax",
      "httponly" in flags.get("access_token", set()) and "samesite=lax" in flags.get("access_token", set()))
check("refresh_token: HttpOnly + SameSite=Strict, path=/api/v1/auth",
      "httponly" in flags.get("refresh_token", set())
      and "samesite=strict" in flags.get("refresh_token", set())
      and "path=/api/v1/auth" in flags.get("refresh_token", set()))
check("csrf_token: NOT HttpOnly (SPA reads it for double-submit)",
      "csrf_token" in flags and "httponly" not in flags.get("csrf_token", set()))
# Security contract: the login JSON body contains NO JWT — browser JS can
# read the body but not the HttpOnly cookies, so no token is exposed.
body = r.json()
check("login JSON contains NO access_token", "access_token" not in body, f"(keys={sorted(body.keys())})")
check("login JSON contains NO refresh_token", "refresh_token" not in body)
check("session carried by HttpOnly cookies",
      bool(c.cookies.get("access_token")) and bool(c.cookies.get("refresh_token")))

print("== 2. upload synthetic non-PHI image ==")
sample = os.path.join(HERE, "..", "sample_scan.png")
with open(sample, "rb") as f:
    png_bytes = f.read()
r = c.post("/api/v1/scans/upload",
           files={"file": ("sample_scan.png", png_bytes, "image/png")},
           data={"anonymized_patient_id": "PT-E2E-001"}, headers=csrf_h(c))
check("upload -> 201", r.status_code == 201, f"(got {r.status_code})")
scan = r.json()
scan_id = scan["id"]
file_hash = scan["file_hash"]
check("scan status UPLOADED", scan.get("status") == "uploaded", f"(got {scan.get('status')})")

print("== 3. real prediction ==")
r = c.post(f"/api/v1/predictions/predict/{scan_id}", headers=csrf_h(c))
check("predict -> 200", r.status_code == 200, f"(got {r.status_code})")
pred = r.json()
p = pred["prediction"]
check("engine is resnet50 (real CNN)", p.get("model_architecture") == "resnet50",
      f"(got {p.get('model_architecture')})")
check("real processing time recorded", (p.get("processing_time_ms") or 0) > 0,
      f"(got {p.get('processing_time_ms')}ms)")
check("probabilities present", "Normal" in (p.get("all_probabilities") or {}) and "Pneumonia" in (p.get("all_probabilities") or {}),
      f"(keys={list((p.get('all_probabilities') or {}).keys())})")
conf = p.get("confidence")
check("confidence in [0,1]", conf is not None and 0.0 <= conf <= 1.0, f"(got {conf})")
check("gradcam URL present", bool(p.get("gradcam_url")), f"(got {p.get('gradcam_url')})")
pred_id = p["id"]

print("== 4. Grad-CAM / heatmap / original image ==")
r = c.get(p["gradcam_url"])
check("gradcam image -> 200 image/png", r.status_code == 200 and r.headers.get("content-type") == "image/png",
      f"(got {r.status_code} {r.headers.get('content-type')})")
gradcam_bytes = r.content
r = c.get(pred["scan"]["id"] and f"/api/v1/predictions/image/original_{file_hash}.png")
check("original derived image -> 200 image/png", r.status_code == 200 and r.headers.get("content-type") == "image/png",
      f"(got {r.status_code})")
hm_url = (p.get("condition_heatmaps") or {}).get("Normal")
if hm_url:
    r = c.get(hm_url)
    check("condition heatmap -> 200 image/png", r.status_code == 200 and r.headers.get("content-type") == "image/png",
          f"(got {r.status_code})")
else:
    check("condition heatmap URL present", False)

print("== 5. PDF export ==")
r = c.get(f"/api/v1/predictions/{pred_id}/pdf")
check("pdf -> 200 application/pdf", r.status_code == 200 and r.headers.get("content-type") == "application/pdf",
      f"(got {r.status_code} {r.headers.get('content-type')})")
pdf_bytes = r.content
check("pdf is a real PDF (%PDF magic)", pdf_bytes[:5] == b"%PDF-")
secrets = [os.environ.get("JWT_SECRET_KEY", ""), os.environ.get("ENCRYPTION_KEY", ""), os.environ.get("ENCRYPTION_SALT", "")]
leaks = [s[:12] for s in secrets if s and s.encode() in pdf_bytes]
check("pdf contains no encryption/JWT key material", not leaks, f"(leaked={leaks})")

print("== 6. flag ==")
r = c.post(f"/api/v1/predictions/{pred_id}/flag", json={"flagged": True}, headers=csrf_h(c))
check("flag prediction -> 200 is_flagged=true", r.status_code == 200 and r.json()["is_flagged"] is True,
      f"(got {r.status_code} is_flagged={r.json().get('is_flagged') if r.status_code == 200 else 'n/a'})")

print("== 7. logout + refresh revocation ==")
rt_before_logout = c.cookies.get("refresh_token")
r = c.post("/api/v1/auth/logout", headers=csrf_h(c), json={})
check("logout -> 204", r.status_code == 204, f"(got {r.status_code})")
r = c.post("/api/v1/auth/refresh", json={"refresh_token": rt_before_logout})
check("refresh after logout -> 401 (revoked)", r.status_code == 401, f"(got {r.status_code})")

# ------------------------------------------------------------- security smoke
print("== 8. IDOR from a separate user (staff) ==")
s = new_client("10.0.2.2")
r = s.post("/api/v1/auth/login", json={"username": "staffe2e", "password": "E2ePass123!"})
check("staff login -> 200", r.status_code == 200, f"(got {r.status_code})")
sh = csrf_h(s)
checks = [
    ("staff GET doctor scan", "GET", f"/api/v1/scans/{scan_id}"),
    ("staff GET doctor prediction", "GET", f"/api/v1/predictions/{pred_id}"),
    ("staff GET original image", "GET", f"/api/v1/predictions/image/original_{file_hash}.png"),
    ("staff GET gradcam image", "GET", f"/api/v1/predictions/image/gradcam_{file_hash}.png"),
    ("staff GET heatmap", "GET", f"/api/v1/predictions/{pred_id}/heatmap/Normal"),
    ("staff GET pdf", "GET", f"/api/v1/predictions/{pred_id}/pdf"),
    ("staff POST flag", "POST", f"/api/v1/predictions/{pred_id}/flag"),
]
for name, method, path in checks:
    rr = s.request(method, path, headers=sh if method == "POST" else {})
    # Role check (403, staff is below doctor/radiologist) or object-level
    # check (404) — either way the request is DENIED.
    check(f"{name} -> DENIED", rr.status_code in (403, 404), f"(got {rr.status_code})")

r = s.get("/api/v1/scans")
check("staff scan list shows own scans only (0)", r.json().get("total") == 0, f"(got {r.json().get('total')})")

print("== 9. RBAC ==")
r = s.post("/api/v1/auth/register",
           json={"username": "hacker", "email": "h@h.com", "password": "Xyz12345!", "full_name": "x", "role": "doctor"})
check("staff cannot register users -> 403", r.status_code == 403, f"(got {r.status_code})")
r = s.patch(f"/api/v1/auth/users/{scan['uploaded_by']}", json={"is_active": False})
check("staff cannot modify users -> 403", r.status_code == 403, f"(got {r.status_code})")
r = s.delete(f"/api/v1/scans/{scan_id}")
check("staff cannot delete doctor scan -> DENIED", r.status_code in (403, 404), f"(got {r.status_code})")

print("== 10. JWT abuse ==")
from jose import jwt as jose_jwt
SECRET = os.environ["JWT_SECRET_KEY"]
me_headers = lambda tok: {"Authorization": f"Bearer {tok}"}
r = s.get("/api/v1/auth/me", headers=me_headers("invalid.signature.token"))
check("invalid-signature JWT -> 401", r.status_code == 401, f"(got {r.status_code})")
expired = jose_jwt.encode({"sub": "1", "type": "access", "exp": int(time.time()) - 3600, "ver": 0}, SECRET, algorithm="HS256")
r = s.get("/api/v1/auth/me", headers=me_headers(expired))
check("expired JWT -> 401", r.status_code == 401, f"(got {r.status_code})")
refresh_as_access = jose_jwt.encode({"sub": "1", "type": "refresh", "exp": int(time.time()) + 3600, "ver": 0, "jti": "x"}, SECRET, algorithm="HS256")
r = s.get("/api/v1/auth/me", headers=me_headers(refresh_as_access))
check("refresh token used as access token -> 401", r.status_code == 401, f"(got {r.status_code})")
r = s.get("/api/v1/auth/me", headers=me_headers("garbage"))
check("garbage token -> 401", r.status_code == 401, f"(got {r.status_code})")

print("== 11. CSRF / cross-origin ==")
r = s.post("/api/v1/auth/logout", headers={"Origin": "http://evil.example", "X-CSRF-Token": s.cookies.get("csrf_token") or ""}, json={})
check("cross-origin state-changing request -> 403", r.status_code == 403, f"(got {r.status_code})")

# ------------------------------------------------------------- PHI checks
print("== 12. PHI: encrypted artifacts only, no plaintext left behind ==")
upload_dir = os.path.join(HERE, "..", "backend", "uploads_e2e")
plain_files = []
enc_count = 0
for root, _dirs, files in os.walk(upload_dir):
    for fn in files:
        full = os.path.join(root, fn)
        if fn.endswith(".enc"):
            enc_count += 1
        else:
            plain_files.append(os.path.relpath(full, upload_dir))
check("no plaintext artifacts in upload dir", not plain_files,
      f"(plaintext={plain_files})")
check("encrypted artifacts exist (.enc files)", enc_count >= 3, f"(count={enc_count})")

print("== 13. PHI: DICOM anonymization at rest (live decrypt) ==")
from app.core.config import get_settings  # noqa: E402
from app.core.security import decrypt_file  # noqa: E402
import numpy as np  # noqa: E402
pixel = (np.arange(64 * 64, dtype=np.uint16) % 256).reshape(64, 64).tobytes()
dcm_bytes = make_dicom_with_phi(pixel)
import pydicom  # noqa: E402
orig = pydicom.dcmread(io.BytesIO(dcm_bytes))
orig_sop, orig_study, orig_series = orig.SOPInstanceUID, orig.StudyInstanceUID, orig.SeriesInstanceUID
# The earlier E2E client logged out in section 7 — use a fresh authenticated
# client for the DICOM PHI test.
dc = new_client("10.0.2.3")
r = dc.post("/api/v1/auth/login", json={"username": "doctore2e", "password": "E2ePass123!"})
check("fresh login for DICOM test -> 200", r.status_code == 200, f"(got {r.status_code})")
r = dc.post("/api/v1/scans/upload", files={"file": ("phi.dcm", dcm_bytes, "application/dicom")},
            data={}, headers=csrf_h(dc))
check("DICOM upload -> 201", r.status_code == 201, f"(got {r.status_code})")
dcm_scan = r.json()
dcm_hash = dcm_scan["file_hash"]
enc_path = os.path.join(get_settings().upload_dir, f"{dcm_hash}.enc")
check("encrypted DICOM exists at rest", os.path.exists(enc_path))
decrypted_path = os.path.join(get_settings().upload_dir, f"verify_{dcm_hash}.dcm")
decrypt_file(enc_path, decrypted_path)
raw = open(decrypted_path, "rb").read()
os.remove(decrypted_path)
stored = pydicom.dcmread(io.BytesIO(raw))
check("no patient name in stored DICOM", b"DOE" not in raw and b"JOHN" not in raw)
check("no patient ID in stored DICOM", b"12345" not in raw)
check("no study ID (institution MRN) in stored DICOM", not hasattr(stored, "StudyID"))
check("linkage UIDs replaced", stored.SOPInstanceUID != orig_sop and stored.StudyInstanceUID != orig_study and stored.SeriesInstanceUID != orig_series)
check("pixel data preserved", stored.pixel_array.shape == (64, 64))

print("== 14. PHI: logs contain no tokens / no raw filenames ==")
log_files = [
    os.path.join(HERE, "..", "backend", "backend_prod_8000.log"),
    os.path.join(HERE, "..", "backend", "logs_e2e", "audit.log"),
]
token_hits, name_hits, rawname_hits = [], [], []
for lf in log_files:
    if not os.path.exists(lf):
        continue
    text = open(lf, "r", encoding="utf-8", errors="replace").read()
    if re.search(r"eyJ[A-Za-z0-9_-]{20,}", text):
        token_hits.append(lf)
    if "sample_scan.png" in text or "phi.dcm" in text:
        rawname_hits.append(lf)
    if "DOE" in text or "JOHN" in text or "E2ePass123" in text:
        name_hits.append(lf)
check("no JWT tokens in logs", not token_hits, f"(files={token_hits})")
check("no raw client filenames in logs", not rawname_hits, f"(files={rawname_hits})")
check("no PHI strings in logs", not name_hits, f"(files={name_hits})")

print("== 15. production defaults: no demo accounts ==")
from sqlalchemy import select  # noqa: E402
from app.db.models import User  # noqa: E402
from app.db.session import async_session_maker  # noqa: E402
import asyncio  # noqa: E402


async def _demo_check():
    async with async_session_maker() as sess:
        rows = (await sess.execute(select(User.username).where(User.username.in_(["doctor", "radiologist", "staff"])))).scalars().all()
        return list(rows)


demo_rows = asyncio.run(_demo_check())
check("no demo accounts auto-created (SEED_DEMO_USERS=false)", not demo_rows, f"(found={demo_rows})")

with open(os.path.join(HERE, ".e2e_scan_id"), "w") as f:
    f.write(str(scan_id))
with open(os.path.join(HERE, ".e2e_pred_id"), "w") as f:
    f.write(str(pred_id))

print()
print(f"RESULT: {len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
