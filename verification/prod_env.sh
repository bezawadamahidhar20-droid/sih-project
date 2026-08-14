#!/usr/bin/env bash
# Production-mode environment for the E2E verification backend.
# Sources: generates fresh real secrets once (verification/.prod_secrets),
# then exports the production configuration used by every launch.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_FILE="$HERE/.prod_secrets"
if [ ! -f "$SECRETS_FILE" ]; then
  "$(dirname "$HERE")/backend/.venv/Scripts/python.exe" - "$SECRETS_FILE" <<'PY'
import secrets, sys
p = sys.argv[1]
with open(p, "w") as f:
    f.write("export JWT_SECRET_KEY='%s'\n" % secrets.token_urlsafe(48))
    f.write("export ENCRYPTION_KEY='%s'\n" % secrets.token_urlsafe(48))
    f.write("export ENCRYPTION_SALT='%s'\n" % secrets.token_urlsafe(24))
PY
fi
# shellcheck disable=SC1090
source "$SECRETS_FILE"

export ENVIRONMENT=production
export DEBUG=false
export WORKERS="${1:-1}"
export USE_REDIS=true
export REDIS_URL=redis://127.0.0.1:6379/0
export ALLOW_HEURISTIC_FALLBACK=false
export SEED_DEMO_USERS=false
export SEED_DEMO_SCANS=false
export DATABASE_URL="sqlite+aiosqlite:///./mediscan_e2e.db"
export MODEL_PATH="./models/model.pth"
export MODEL_ARCHITECTURE=resnet50
export MODEL_NUM_CLASSES=2
export MODEL_INPUT_SIZE=224
export MODEL_CLASSES='["Normal","Pneumonia"]'
export UPLOAD_DIR="./uploads_e2e"
export AUDIT_LOG_PATH="./logs_e2e/audit.log"
export COOKIE_SECURE=false
export TRUST_PROXY_HEADERS=true
export CORS_ORIGINS='["http://localhost:5173","http://localhost:3000"]'
export UPLOAD_RATE_LIMIT_PER_MINUTE=5
export PREDICT_RATE_LIMIT_PER_MINUTE=5
export HOST=127.0.0.1
export PORT=8000
export LOG_LEVEL=INFO

# Optional overrides for the negative tests (missing model / heuristic-on)
if [ -n "${MODEL_PATH_OVERRIDE:-}" ]; then export MODEL_PATH="$MODEL_PATH_OVERRIDE"; fi
if [ -n "${ALLOW_HEURISTIC_FALLBACK_OVERRIDE:-}" ]; then export ALLOW_HEURISTIC_FALLBACK="$ALLOW_HEURISTIC_FALLBACK_OVERRIDE"; fi
if [ -n "${COOKIE_SECURE_OVERRIDE:-}" ]; then export COOKIE_SECURE="$COOKIE_SECURE_OVERRIDE"; fi
if [ -n "${PORT_OVERRIDE:-}" ]; then export PORT="$PORT_OVERRIDE"; fi
if [ -n "${DATABASE_URL_OVERRIDE:-}" ]; then export DATABASE_URL="$DATABASE_URL_OVERRIDE"; fi
if [ -n "${REDIS_URL_OVERRIDE:-}" ]; then export REDIS_URL="$REDIS_URL_OVERRIDE"; fi
if [ -n "${CORS_ORIGINS_OVERRIDE:-}" ]; then export CORS_ORIGINS="$CORS_ORIGINS_OVERRIDE"; fi
