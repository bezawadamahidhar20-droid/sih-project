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

| Login hero background | Sample chest X-ray | Grad-CAM heatmap example |
| --- | --- | --- |
| ![Login hero](frontend/public/images/login-hero.jpg) | ![Sample X-ray](frontend/public/images/demo-xray.jpg) | ![Grad-CAM heatmap](frontend/public/images/demo-xray-heatmap.jpg) |

> These demo assets are checked in under [`frontend/public/images/`](frontend/public/images/) and
> used by the UI for the login hero, demo scans, and explainability views.

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
- **Grad-CAM explainability**: toggleable heatmap overlay with an opacity
  slider and side-by-side comparison (CNN engine) or a deterministic saliency
  map (baseline engine).
- **Security**: JWT auth with refresh tokens, RBAC (doctor/radiologist full
  access; staff upload-only + their own scans), AES-256 (Fernet) encryption at
  rest, DICOM PHI anonymization, structured audit logging without PHI.
- **Clinical safety UX**: predictions below the 70% confidence threshold are
  flagged, high-risk findings are emphasized, and doctors can flag results for
  review. Model selection during training prioritizes **sensitivity** (minimize
  false negatives).
- **Engine-agnostic inference**: the API uses a trained CNN when a
  `model.pth` state dict is present at `MODEL_PATH`, and otherwise falls back
  to a deterministic baseline heuristic so the whole app works out of the box.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Material UI v9, Tailwind CSS v4, Recharts, React Router v7, react-dropzone, notistack |
| Backend | FastAPI, SQLAlchemy 2 (async), Pydantic v2, Uvicorn |
| ML | PyTorch 2.2 (ResNet / EfficientNet / DenseNet transfer learning), Grad-CAM, NumPy-only evaluation metrics |
| Data | PostgreSQL 16 (production) / SQLite + aiosqlite (local dev) |
| Security | python-jose (JWT), bcrypt, cryptography (Fernet AES-256) |
| Infra | Docker, docker-compose, nginx (SPA + `/api` reverse proxy) |

---

## Quick start (local development)

### Prerequisites

- Python 3.11 or 3.12 (pinned `numpy==1.26.4` / `torch==2.2.1` don't support 3.13)
- Node.js 20+
- npm

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# For a local dev run WITHOUT Postgres, switch the database to SQLite and
# enable demo-user seeding in backend/.env:
#   DATABASE_URL=sqlite+aiosqlite:///./mediscan.db
#   SEED_DEMO_USERS=true

uvicorn app.main:app --reload --port 8000
```

* Interactive API docs: http://localhost:8000/docs
* Note: the required `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, and `ENCRYPTION_SALT`
  values from `.env.example` are dev placeholders — generate strong random
  secrets before any real deployment.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The API client targets `/api/v1` on the same origin by default
(`VITE_API_URL` override). For local development against a backend running on
port 8000, create `frontend/.env` with:

```
VITE_API_URL=http://localhost:8000/api/v1
```

### 3. Verify it works

1. Open http://localhost:5173, sign in as one of the [demo accounts](#demo-accounts).
2. Upload a chest X-ray (JPEG/PNG or DICOM) from the **Upload** page.
3. Open the result — you'll see the prediction, confidence meter, and the
   toggleable saliency/heatmap overlay.

## Demo accounts

The backend seeds these users when `SEED_DEMO_USERS=true` (default in the
Docker stack). All passwords are `DemoPass123!`:

| Username | Role | Permissions |
| --- | --- | --- |
| `doctor` | Doctor | Full diagnostic access: upload, run predictions, flag for review, patient history |
| `radiologist` | Radiologist | Full diagnostic access, review queue |
| `staff` | Staff | Upload scans + view own scans only |

## API overview

All routes are prefixed with `/api/v1`. JWT access tokens are returned by
`POST /auth/login`.

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /auth/login` | public | JWT + refresh token |
| `POST /auth/register` | doctor/radiologist | create user |
| `POST /scans/upload` | any role | upload scan (encrypted at rest) |
| `GET /scans/` | any role | list scans (staff: own only) |
| `POST /predictions/predict/{id}` | any role | run inference + Grad-CAM |
| `GET /predictions/` | any role | list predictions (staff: own only) |
| `POST /predictions/{id}/flag` | doctor/radiologist | flag for review |
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

The API works immediately with the baseline heuristic engine, but for a
clinical-grade model, fine-tune a CNN and drop the state dict at `MODEL_PATH`:

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

## Docker deployment (roadmap step 6)

```bash
cp .env.example .env     # set real secrets in production
docker compose up --build
```

* Frontend: http://localhost:8080 (nginx serves the SPA, proxies `/api`)
* Backend API: http://localhost:8000/docs (dev convenience mapping; remove
  the `BACKEND_PORT` mapping in production so the API is only reachable
  through the nginx proxy)
* Postgres is internal to the compose network; scans persist in named volumes.
* HTTPS/TLS: terminate at a reverse proxy / load balancer in front of the
  stack (`SSL_CERTFILE`/`SSL_KEYFILE` in the backend `.env` can also enable
  uvicorn TLS directly).
* To enable the trained model in Docker: copy `model.pth` into
  `./backend/models/` (bind-mounted read-only into the container).

## Repository layout

```
backend/
  app/
    api/routes/      # auth, scans, predictions, health (FastAPI)
    core/            # config, security (JWT/encryption), logging
    db/              # SQLAlchemy models, session, seed
    services/        # image_processing (DICOM/PHI), model_inference (engines)
    models/          # TRAINING PIPELINE: metrics, data, train, evaluate
  tests/             # pytest suite (auth, RBAC, upload→predict→heatmap, metrics)
  Dockerfile         # python:3.11-slim
frontend/
  public/images/     # demo assets (login hero, sample scans, heatmap)
  src/               # React + MUI (pages, components, api client, theme)
  Dockerfile         # multi-stage: node:22 vite build → nginx:1.25
  nginx.conf         # SPA + /api proxy
docker-compose.yml   # postgres + backend + frontend
```

## Security & compliance notes

- **PHI anonymization**: DICOM tags (name, ID, birth date, referring physician,
  institution, etc.) are stripped before processing or logging.
- **Encryption**: uploaded scans are encrypted with AES-256 (Fernet) at rest;
  decryption happens only in memory during inference.
- **RBAC**: doctor/radiologist = full diagnostic access; staff = upload +
  own scans only. JWT access + refresh tokens with role claims.
- **Audit logging**: structured JSON logs of uploads, predictions, and flags —
  never containing PHI.
- This is **decision-support only**, not a final diagnosis. Production
  deployments require HTTPS/TLS, a HIPAA-aligned infrastructure review, and
  proper key management (never ship the `.env` from this repo).

## Testing

```bash
# Backend — 33 tests, no GPU/torch needed
cd backend
.venv/Scripts/python -m pytest -q

# Frontend — typecheck + production build
cd ../frontend
npm run build
```

## Roadmap status

| Step | Status |
| --- | --- |
| 1. Dataset collection & preprocessing | Dataset loaders + transforms in `app/models/data.py` |
| 2. Model architecture & training | `app/models/train.py` (transfer learning, Grad-CAM) |
| 3. Web application | ✅ Complete (backend + frontend) |
| 4. Data security & privacy | ✅ PHI strip, AES-256 at rest, RBAC, audit logs |
| 5. Quality control & clinical validation | `app/models/evaluate.py` (sensitivity-focused metrics) |
| 6. Compliance & deployment | ✅ Dockerfile ×2 + docker-compose + TLS at proxy |

## Contributing

1. Fork the repo and create a feature branch (`git checkout -b feat/my-change`).
2. Make your changes — keep the [testing](#testing) suite green.
3. Commit with a clear message and open a pull request.

Before opening a PR, please run the backend tests and the frontend build
locally, and do **not** commit real secrets, `.env` files, model weights
(`*.pth`), datasets, or uploaded scans — all of these are gitignored.

## License

This project is not yet published under an open-source license. All rights
reserved. Contact the maintainers before using or distributing this code.
