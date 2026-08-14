<div align="center">

# 🩻 MediScan AI

**Clinical-grade AI decision support for chest X-ray and CT diagnostics**

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](backend/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi&logoColor=white)](backend/app/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.2-EE4C2C?logo=pytorch&logoColor=white)](backend/app/models/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](frontend/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](frontend/src/)
[![MUI](https://img.shields.io/badge/Material%20UI-v9-007FFF?logo=mui&logoColor=white)](frontend/src/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](docker-compose.yml)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

Medical staff upload a chest X-ray or CT scan; the system runs a deep-learning
classifier, shows the diagnostic prediction with confidence, and overlays a
**Grad-CAM heatmap** highlighting the region of interest. Built around clinical
safety: PHI is stripped from DICOM metadata, scans are encrypted at rest, access
is role-based, and low-confidence results are surfaced loudly instead of hidden.

</div>

---

## Demo assets

| Login background (legacy) | Sample chest X-ray | Grad-CAM heatmap example |
| --- | --- | --- |
| ![Login hero](frontend/public/images/login-hero.jpg) | ![Sample X-ray](frontend/public/images/demo-xray.jpg) | ![Grad-CAM heatmap](frontend/public/images/demo-xray-heatmap.jpg) |

> These demo assets are checked in under [`frontend/public/images/`](frontend/public/images/) and
> used by the UI for demo scans and explainability views. The login page is
> now rendered with an animated neural-mesh canvas (see LoginPage) rather than
> the static hero image (kept for backward compatibility).

---

## Table of contents

- [Overview & architecture](#overview--architecture)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start (local development)](#quick-start-local-development)
- [Demo accounts](#demo-accounts)
- [API overview](#api-overview)
- [Training a real model](#training-a-real-model-roadmap-steps-2--5)
- [Docker deployment](#docker-deployment-roadmap-step-6)
- [Repository layout](#repository-layout)
- [Security & compliance notes](#security--compliance-notes)
- [Testing](#testing)
- [Roadmap status](#roadmap-status)
- [Contributing](#contributing)
- [License](#license)

---

## Overview & architecture

```
┌─────────────┐   upload   ┌──────────────┐   inference   ┌──────────────────┐
│ React SPA   │ ─────────▶ │ FastAPI      │ ────────────▶ │ CNN + Grad-CAM   │
│ (MUI)       │  JWT/RBAC  │  /api/v1     │   decrypt     │ (or baseline     │
│             │ ◀───────── │  scans/      │ ◀───────────  │  heuristic)      │
│ heatmap     │  result +  │  predictions │   AES-256     │                  │
│ overlay     │  image     │  auth        │               └──────────────────┘
└─────────────┘            └──────────────┘
                                 │ SQLAlchemy (Postgres / SQLite)
                                 ▼
                           audits (no PHI)
```

## Features

- **Upload → predict → heatmap** loop with drag & drop upload (JPEG/PNG/DICOM),
  client-side validation, progress bars, and slow-inference feedback.
- **Premium dark UI**: deep-navy glassmorphism design system (dark mode) with
  an animated login — interactive neural-mesh particle canvas, ambient glowing
  orbs, 3D tilt cards with specular glare, spring micro-interactions, and a
  reduced-motion-safe `VerdictHero` result banner with a spring-driven
  confidence gauge.
- **Grad-CAM explainability**: toggleable heatmap overlay with an opacity
  slider and side-by-side comparison (CNN engine) or a deterministic saliency
  map (baseline engine).
- **Security**: JWT auth with refresh tokens, RBAC (doctor/radiologist full
  access; staff upload-only + their own scans), AES-256 (Fernet) encryption at
  rest, DICOM PHI anonymization, structured audit logging without PHI.
- **Refresh-token rotation & tokens you can revoke**: refresh tokens are
  one-time-use (`jti` rotation) and every API-minted refresh token is tracked
  in a persistent `refresh_sessions` table — replaying a used token returns
  401 **and revokes the whole session family** (all outstanding refresh
  tokens + a `token_version` bump that kills access tokens too), surviving
  restarts and horizontal scaling. `POST /auth/logout` burns the presented
  refresh token server-side. A `token_version` claim lets a password or
  role/status change revoke *every* outstanding access + refresh token
  instantly. Login failures are keyed on the proxy-aware client IP and
  bcrypt timing is equalized for unknown usernames, so neither lockouts nor
  account-existence probing can follow a spoofed or shared proxy address.
- **HttpOnly cookie sessions (no tokens in JavaScript)**: the browser SPA
  authenticates with `HttpOnly` + `SameSite` + `Secure` cookies set by the
  backend — access tokens and refresh tokens are **never stored in
  `localStorage`** and JavaScript cannot read them. The login/refresh JSON
  response bodies deliberately contain **no JWT material** (only a
  confirmation message), so a token can never leak through a response body
  that page JavaScript can read; the session lives entirely in the
  Set-Cookie headers. CSRF is mitigated with a SameSite policy + Origin
  verification + a double-submit `csrf_token` cookie echoed in the
  `X-CSRF-Token` header on every state-changing request. Programmatic
  clients read the tokens from the Set-Cookie headers (HTTP libraries
  expose them regardless of HttpOnly) and can also use
  `Authorization: Bearer`.
- **Shared security state**: rate limiting and login lockout run on a
  sliding-window store that is in-process by default (single worker) and
  Redis-backed with `USE_REDIS=true` when scaling to multiple workers
  (`WORKERS>1` is refused at startup unless Redis is enabled).
- **Self-hosted fonts, strict CSP**: all UI fonts (Inter, Space Grotesk,
  Figtree, Noto Sans, IBM Plex Mono) are bundled as woff2 under
  `frontend/public/fonts/` and served same-origin (`@font-face` in
  `frontend/src/fonts.css`). There is no dependency on Google Fonts, so the
  production CSP (`default-src 'self'; style-src 'self' 'unsafe-inline'`)
  needs no third-party origins and the browser console is free of font
  errors.
- **Clinical safety UX**: predictions below the 70% confidence threshold are
  flagged, high-risk findings are emphasized, and doctors can flag results for
  review. Model selection during training prioritizes **sensitivity** (minimize
  false negatives) or **balanced accuracy** (`--selection-metric
  balanced_accuracy`) to avoid over-predicting the abnormal class.
- **Calibrated decision threshold**: binary models report the abnormal class
  only above `MODEL_DECISION_THRESHOLD` (default 0.8 instead of plain
  argmax@0.5), which sharply cuts false positives on out-of-distribution
  (real-world) scans while preserving sensitivity. The active threshold is
  surfaced via `/api/v1/health` and shown in the UI (result page + dashboard),
  along with real hold-out validation metrics from `<model>.evaluation.json`.
  Health-checked in this repo against real images downloaded from Wikimedia
  Commons: 3/3 pneumonia cases correctly identified, and the calibrated
  boundary raised overall real-world accuracy from ~25% → 58% on that set.
- **Engine-agnostic inference**: the API uses a trained CNN when a
  `model.pth` state dict is present at `MODEL_PATH`. With the model missing
  and `ALLOW_HEURISTIC_FALLBACK=false` (the production default), prediction
  requests **fail loudly** rather than serve guessed diagnoses. A dev-only
  deterministic baseline heuristic is available for demos by explicitly
  setting `ALLOW_HEURISTIC_FALLBACK=true` — it is never used silently in
  production.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Material UI v9, Tailwind CSS v4, **Motion** (Framer Motion), Recharts, React Router v7, react-dropzone, notistack |
| Backend | FastAPI, SQLAlchemy 2 (async), Pydantic v2, Uvicorn |
| ML | PyTorch 2.2 (ResNet / EfficientNet / DenseNet transfer learning), Grad-CAM, NumPy-only evaluation metrics |
| Data | PostgreSQL 16 (production) / SQLite + aiosqlite (local dev) |
| Security | python-jose (JWT), bcrypt, cryptography (Fernet AES-256) |
| Infra | Docker, docker-compose, nginx (SPA + `/api` reverse proxy) |

---

## Quick start (local development)

### Prerequisites

- Python 3.11–3.13 (pins in `backend/requirements.txt` mirror the tested stack: `torch==2.13.0` / `numpy==2.5.1` / `fastapi==0.141.1`)
- Node.js 20+
- npm

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# backend/.env.example is pre-configured for local development out of the box:
#   ENVIRONMENT=development           # placeholder secrets are accepted in dev
#   DATABASE_URL=sqlite+aiosqlite:///./mediscan.db
#   MODEL_PATH=./models/model.pth     # the trained CNN shipped in the repo
#   ALLOW_HEURISTIC_FALLBACK=true     # dev baseline if the model is ever missing
#   SEED_DEMO_USERS=true              # doctor / radiologist / staff (DemoPass123!)

uvicorn app.main:app --reload --port 8000
```

* Interactive API docs: http://localhost:8000/docs
* Note: the required `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, and `ENCRYPTION_SALT`
  values from `.env.example` are dev placeholders. In production the app
  **refuses to start** with placeholder secrets (`ENVIRONMENT=production` +
  a placeholder value → startup `ValueError`), so always generate strong
  random secrets before any real deployment.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:8000`, so the UI works
against a locally running backend out of the box (no CORS, no env vars).

**Demo mode is strictly opt-in.** Run `VITE_DEMO_MODE=1 npm run dev` to enable
it: the app then falls back to bundled mock data **only when the backend is
genuinely unreachable (network error)** and shows an unmissable **DEMO MODE —
results are simulated** banner. Demo mode is OFF by default (`VITE_DEMO_MODE`
unset): every real server response — 400/401/403/404/409/422/429/500,
malformed payloads, DB or inference failures — is surfaced as a real error
and is **never** replaced with fabricated logins, predictions, heatmaps, or
health data. A backend HTTP 500 can never become a successful demo login.

### 3. Verify it works

1. Open http://localhost:5173, sign in as one of the [demo accounts](#demo-accounts).
2. Upload a chest X-ray (JPEG/PNG or DICOM) from the **Upload** page.
3. Open the result — you'll see the prediction, confidence meter, and the
   toggleable saliency/heatmap overlay.

## Demo accounts

> ⚠️ **Demo-user seeding is opt-in, never a production default.** The Docker
> stack defaults `SEED_DEMO_USERS=false`; the local-dev template
> (`backend/.env.example`) sets `SEED_DEMO_USERS=true`, and seeding also
> activates whenever `ENVIRONMENT` is not `production`. For the SIH demo,
> explicitly run `SEED_DEMO_USERS=true docker compose up`. Any public
> deployment must keep seeding off and provide real `JWT_SECRET_KEY` /
> `ENCRYPTION_KEY` / `ENCRYPTION_SALT` values — compose fails fast if they
> are missing.

The backend seeds these users when `SEED_DEMO_USERS=true` (explicit opt-in
for Docker; the local dev default) or when `ENVIRONMENT` is not `production`.
All passwords are `DemoPass123!`:

| Username | Role | Permissions |
| --- | --- | --- |
| `doctor` | Doctor | Full diagnostic access: upload, run predictions, flag for review, patient history |
| `radiologist` | Radiologist | Full diagnostic access, review queue |
| `staff` | Staff | Upload scans + view own scans only |

## API overview

All routes are prefixed with `/api/v1`. The browser session is carried by
HttpOnly cookies set on login (`access_token`, `refresh_token`, `csrf_token`)
and **the login/refresh JSON bodies contain no JWT** — the session is in the
Set-Cookie headers only. Programmatic clients read the tokens from the
Set-Cookie headers and can also send `Authorization: Bearer`.

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /auth/login` | public | sets HttpOnly session cookies; JSON body has **no JWT** |
| `POST /auth/register` | doctor/radiologist | create user |
| `PATCH /auth/me` | any role | update own `email` / `full_name` only |
| `POST /auth/change-password` | any role | change own password (current password required) |
| `POST /auth/logout` | public (revokes presented refresh token) | server-side sign-out; burned refresh tokens can never be replayed |
| `POST /scans/upload` | any role | upload scan (encrypted at rest) |
| `GET /scans/` | any role | list scans (staff: own only) |
| `POST /predictions/predict/{id}` | any role | run inference + Grad-CAM |
| `GET /predictions/` | any role | list predictions (staff: own only) |
| `POST /predictions/{id}/flag` | doctor/radiologist | flag for review — owner/creator only (see object-level authorization) |
| `GET /predictions/patient/{pid}/history` | doctor/radiologist | per-patient history |
| `GET /health` | public | engine / model status |

Example — login, then check engine status:

```bash
# Login
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"doctor","password":"DemoPass123!"}'

# Health / engine status (public)
curl -s http://localhost:8000/api/v1/health
```

## Training a real model (roadmap steps 2 & 5)

The API serves the trained CNN as soon as a state dict exists at
`MODEL_PATH` (the repo ships with `model.pth`). To train or improve the
model, fine-tune a CNN and drop the resulting state dict at `MODEL_PATH`:

```bash
cd backend
.venv/Scripts/activate
# Folder layout (e.g. Kaggle chest_xray):
python -m app.models.train --data-dir ./data/chest_xray \
    --arch resnet50 --epochs 12 --batch-size 16 --output ./models/model.pth

# Evaluate on the held-out test split (reports sensitivity, specificity, AUC):
python -m app.models.evaluate --model ./models/model.pth --data-dir ./data/chest_xray

# Grad-CAM example overlays are written to ./evaluation_examples
```

Then restart the backend — `/api/v1/health` and the Settings page report
`"model_loaded": true`, and the CNN + real Grad-CAM engine takes over with no
code changes. See [`backend/app/models/README.md`](backend/app/models/README.md)
for dataset formats, CLI flags, and CSV (NIH-style) support.

### Model calibration & retraining tooling

The repo ships several dev-only scripts (in `backend/`) used to retrain and
validate the deployed CNN:

| Script | Purpose |
| --- | --- |
| `run_v2_retrain.ps1` | Launches a `resnet50` v2 retrain (balanced-accuracy selection, class weights, augmented aug pipeline) into `models/model_v2.pth` |
| `threshold_analysis.py` | Sweeps the abnormal-class decision threshold over a split and prints acc / bal-acc / sens / spec / F1 / AUC at each operating point (+ best Youden / balanced-accuracy cut) |
| `online_check.py` | Runs the deployed CNN on labeled chest X-rays downloaded from Wikimedia Commons (out-of-distribution) |
| `compare_models.py` | Side-by-side test-split + online-set comparison of `model.pth` vs `model_v2.pth` so the better checkpoint can be promoted |

Example:

```bash
cd backend
# Retrain v2 (selects checkpoint by balanced accuracy, augmented pipeline)
.\run_v2_retrain.ps1          # or the equivalent python -m app.models.train ...
python threshold_analysis.py  val   # pick a calibrated threshold
python online_check.py             # real-world sanity check
python compare_models.py           # decide whether to promote model_v2.pth
```

## Docker deployment (roadmap step 6)

```bash
cp .env.example .env     # real secrets are REQUIRED — compose refuses to start without them
docker compose up --build
# SIH demo with well-known accounts: SEED_DEMO_USERS=true docker compose up --build
```

* `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, and `ENCRYPTION_SALT` use the `:?`
  compose syntax: `docker compose up` **fails fast** if they are unset, so a
  misconfigured stack can never boot with forgeable JWTs or a decryptable key.
* Demo accounts are **not** seeded by default (`SEED_DEMO_USERS=false`).

* Frontend: http://localhost:8080 (nginx serves the SPA, proxies `/api`)
* Backend API: NOT exposed on a host port — reachable only through the nginx
  proxy (Intranet/HTTPS proxy -> frontend -> backend).
* Postgres is internal to the compose network; scans persist in named volumes.
* HTTPS/TLS: terminate at a reverse proxy / load balancer in front of the
  stack — a production nginx template (TLS, HSTS, HTTP→HTTPS redirect,
  security headers) ships at `deploy/nginx-production.conf.example` with
  placeholder certificate paths. `SSL_CERTFILE`/`SSL_KEYFILE` in the backend
  `.env` can also enable uvicorn TLS directly.
* Redis is included in the stack (no host port) and stays idle unless
  `USE_REDIS=true`; enable it before scaling `WORKERS` above 1.
* The trained model is enabled by default: `model.pth` is bind-mounted
  read-only into the container from `./backend/models/`.
* If no model file is present and `ALLOW_HEURISTIC_FALLBACK` is unset/false,
  `/api/v1/health` reports `model_loaded: false` and prediction requests
  return a clear 500 (no fabricated diagnoses).

## Repository layout

```
backend/
  app/
    api/routes/      # auth, scans, predictions, health (FastAPI)
    core/            # config, security (JWT/encryption), logging, netutil (proxy-aware client IP)
    db/              # SQLAlchemy models, session, seed
    services/        # image_processing (DICOM/PHI), model_inference (engines)
    models/          # TRAINING PIPELINE: metrics, data, train, evaluate
  tests/             # pytest suite (auth, RBAC, upload→predict→heatmap, metrics, token rotation, regressions)
  compare_models.py  # dev: pitted model.pth vs model_v2.pth (test-split + online set)
  online_check.py    # dev: real-world Wikimedia Commons sanity check
  threshold_analysis.py  # dev: decision-threshold sweep + Youden / balanced-accuracy operating point
  run_v2_retrain.ps1     # dev: Windows launcher for a v2 retrain
  Dockerfile         # python:3.11-slim
frontend/
  public/images/     # demo assets (login hero, sample scans, heatmap)
  src/               # React + MUI (pages, components, api client, theme)
  Dockerfile         # multi-stage: node:22 vite build → nginx:1.25
  nginx.conf         # SPA + /api proxy
docker-compose.yml   # postgres + backend + frontend
```

## Security & compliance notes

- **PHI anonymization**: DICOM files are de-identified with a **whitelist**
  (only safe tags + pixel data survive) and the *anonymized* file is what gets
  encrypted and stored — the original bytes never touch disk. Private/vendor
  tags and all patient identifiers are dropped; the institution-assigned
  **Study ID is removed** and the Study/Series/SOP Instance **UIDs are
  replaced** with fresh values so the stored file cannot be re-linked to the
  original study. **Multi-frame DICOM (e.g. CT volumes) is explicitly
  rejected** at upload with an actionable message — the pipeline never
  silently analyzes a single frame of a volume.
- **Encryption**: uploaded scans **and derived images** (the `original_*.png` /
  `gradcam_*.png` renders) are encrypted with AES-256 (Fernet) at rest;
  decryption happens only transiently in memory while serving (the PDF
  report is assembled from in-memory decrypted bytes — no plaintext PHI is
  ever written to disk).
- **RBAC & object-level authorization**: doctor/radiologist = full diagnostic
  access (listings, detail, patient history); staff = upload + own scans only.
  Destructive / PHI-exporting endpoints are stricter and **owner-scoped**: a
  prediction's PDF, heatmap, flag action, and scan deletion are only allowed
  for the prediction's creator or the scan's uploader — another clinician is
  answered with a plain 404 so record existence is never disclosed. Users can
  only edit `email`/`full_name` on their own account; role changes are
  doctor/radiologist-only.
- **Brute-force protection**: `POST /auth/login` is rate-limited per
  IP + username (5 failures / 15 min, in-process — swap for Redis/nginx when
  scaling horizontally). The client key is proxy-aware: behind nginx the last
  `X-Forwarded-For` entry is trusted (`TRUST_PROXY_HEADERS=true`), so an
  attacker behind the proxy can no longer lock out a real user. Unknown
  usernames answer with a dummy bcrypt hash to equalize timing.
- **Session revocation & refresh rotation**: every refresh token carries a
  one-time `jti` (reuse → 401) and access/refresh tokens embed
  `token_version`; changing a password or a user's role/active status bumps
  it and immediately invalidates all previously issued tokens.
- **Endpoint rate limiting**: upload and prediction endpoints are guarded by a
  per-user sliding window (`UPLOAD_RATE_LIMIT_PER_MINUTE` /
  `PREDICT_RATE_LIMIT_PER_MINUTE`, default 30/min) that returns 429 with
  `Retry-After` — an in-process store, adequate for the single-worker stack,
  replace with Redis when scaling horizontally.
- **Audit logging**: structured JSON logs of uploads, predictions, auth
  events, and flags — written to `AUDIT_LOG_PATH` and stdout, never containing
  PHI. Access logs record paths only, not query strings.
- This is **decision-support only**, not a final diagnosis. Production
  deployments require HTTPS/TLS, a HIPAA-aligned infrastructure review, and
  proper key management (never ship the `.env` from this repo).

## Testing

```bash
# Backend — 129 tests (validation, cleanup, security, RBAC, ML safety, rate limits,
# image-quality gate, token rotation/revocation, IDOR cross-doctor attacks, logout,
# refresh replay/family revocation, HttpOnly-cookie auth, CSRF, DICOM PHI,
# no-JWT-in-JSON contract, real-CNN inference probe)
cd backend
.venv/Scripts/python -m pytest -q

# Frontend — typecheck + production build
cd ../frontend
npm run build
```

## Roadmap status

| Step | Status | Hold-Out Evaluation Metrics (internal) |
| --- | --- | --- |
| 1. Dataset collection & preprocessing | ✅ Complete | Kaggle Chest X-Ray dataset (5,856 train/val/test images) |
| 2. Model architecture & training | ✅ Complete | ResNet50 Transfer Learning trained (`backend/models/model.pth`) |
| 3. Web application | ✅ Complete | Full-stack FastAPI + React 19 MUI Workstation |
| 4. Data security & privacy | ✅ Complete | DICOM PHI stripping, AES-256 Fernet at rest, RBAC, JWT rotation |
| 5. Quality control & internal evaluation | ✅ Complete | **86.06% Accuracy**, **83.08% Sensitivity**, **91.03% Specificity**, **95.03% ROC AUC** (624 hold-out test studies — reported in `backend/models/model.evaluation.json`, served by `/api/v1/health`) |
| 6. Compliance & deployment | ✅ Complete | Docker Compose, audit logs, automated test suite |

> ⚠️ **Metric honesty.** The roadmap figures are *internal hold-out evaluation*
> on the Kaggle Chest X-Ray dataset — not clinical validation. No FDA/CE
> clearance or real-world clinical validation has been performed; an
> out-of-distribution sanity check on Wikimedia images is described in the
> [Features](#features) section and must not be read as clinical evidence.

## Contributing

1. Fork the repo and create a feature branch (`git checkout -b feat/my-change`).
2. Make your changes — keep the [testing](#testing) suite green.
3. Commit with a clear message and open a pull request.

Before opening a PR, please run the backend tests and the frontend build
locally, and do **not** commit real secrets, `.env` files, datasets, or
uploaded scans — those are gitignored.

> ⚠️ **Model checkpoints are intentionally tracked.** Unlike datasets, the
> trained CNN (`backend/models/model.pth` + summary/evaluation JSON) ships
> with the repo because the API fails loudly without it (see
> [Testing](#testing) and [Training a real model](#training-a-real-model-roadmap-steps-2--5)).
> A v2 retrain checkpoint (`model_v2.pth`, balanced-accuracy selection) is
> also tracked for off-line comparison via `compare_models.py`. Only add
> *new* retrained checkpoints when they are meant to ship with the product;
> keep experimental weights out of the repository.

## License

This project is not yet published under an open-source license. All rights
reserved. Contact the maintainers before using or distributing this code.
