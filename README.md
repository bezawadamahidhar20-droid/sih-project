# MediScan AI

AI-powered medical image diagnostic tool. Medical staff upload a chest X-ray
or CT scan; the system runs a deep-learning classifier, shows the diagnostic
prediction with confidence, and overlays a **Grad-CAM heatmap** highlighting
the region of interest. Built around clinical safety: PHI is stripped from
DICOM metadata, scans are encrypted at rest, access is role-based, and
low-confidence results are surfaced loudly instead of hidden.

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

## Repository layout

```
backend/
  app/
    api/routes/      # auth, scans, predictions, health (FastAPI)
    core/            # config, security (JWT/encryption), logging
    db/              # SQLAlchemy models, session, seed
    services/        # image_processing (DICOM/PHI), model_inference (engines)
    models/          # TRAINING PIPELINE: metrics, data, train, evaluate
  tests/             # 33 pytest tests (auth, RBAC, upload→predict→heatmap, metrics)
  Dockerfile
frontend/
  src/               # React + MUI (pages, components, api client, theme)
  Dockerfile         # multi-stage: vite build → nginx
  nginx.conf         # SPA + /api proxy
docker-compose.yml   # postgres + backend + frontend
```

## Quick start (local development)

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit values; dev defaults are fine locally

uvicorn app.main:app --reload --port 8000
```

* API docs: http://localhost:8000/docs
* The dev `.env` uses SQLite and seeds demo users:
  `doctor` / `radiologist` / `staff` — password `DemoPass123!`.

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000, proxies /api → localhost:8000
```

### Run tests

```bash
cd backend
.venv/Scripts/python -m pytest -q        # 33 tests, no GPU/torch needed
cd ../frontend && npm run build          # typechecks + production build
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
for dataset formats, flags, and CSV (NIH-style) support.

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

## API overview

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /api/v1/auth/login` | public | JWT + refresh token |
| `POST /api/v1/auth/register` | doctor/radiologist | create user |
| `POST /api/v1/scans/upload` | any role | upload scan (encrypted at rest) |
| `GET /api/v1/scans/` | any role | list scans (staff: own only) |
| `POST /api/v1/predictions/predict/{id}` | any role | run inference + Grad-CAM |
| `GET /api/v1/predictions/` | any role | list predictions (staff: own only) |
| `POST /api/v1/predictions/{id}/flag` | doctor/radiologist | flag for review |
| `GET /api/v1/predictions/patient/{pid}/history` | doctor/radiologist | per-patient history |
| `GET /api/v1/health` | public | engine / model status |

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

## Roadmap status

| Step | Status |
| --- | --- |
| 1. Dataset collection & preprocessing | Dataset loaders + transforms in `app/models/data.py` |
| 2. Model architecture & training | `app/models/train.py` (transfer learning, Grad-CAM) |
| 3. Web application | ✅ Complete (backend + frontend) |
| 4. Data security & privacy | ✅ PHI strip, AES-256 at rest, RBAC, audit logs |
| 5. Quality control & clinical validation | `app/models/evaluate.py` (sensitivity-focused metrics) |
| 6. Compliance & deployment | Dockerfile ×2 + docker-compose + README; TLS at proxy |
