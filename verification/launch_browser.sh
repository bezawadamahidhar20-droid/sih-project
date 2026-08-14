#!/usr/bin/env bash
# Launch the backend for the TLS browser E2E (Phase 24):
# Secure cookies + https://127.0.0.1:8443 allowlisted as a frontend origin.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../backend"

for P in 8000 8001 8002; do
  PID="$(netstat -ano 2>/dev/null | grep ":$P" | grep LISTENING | awk '{print $5}' | head -1 || true)"
  [ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true
done
sleep 1

export PORT_OVERRIDE=8000
export ALLOW_HEURISTIC_FALLBACK_OVERRIDE=false
export COOKIE_SECURE_OVERRIDE=true
export DATABASE_URL_OVERRIDE="postgresql+asyncpg://mediscan:E2ePgPass2026@127.0.0.1:5433/mediscan"
export REDIS_URL_OVERRIDE="redis://:e2eRedisPass1@127.0.0.1:6379/0"
export CORS_ORIGINS_OVERRIDE='["https://127.0.0.1:8443"]'
# shellcheck disable=SC1091
source "$HERE/prod_env.sh" 1

rm -f backend_prod_8000.log
nohup ./.venv/Scripts/python.exe -m uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 --workers 1 > backend_prod_8000.log 2>&1 &
echo $! > "$HERE/.backend_pid"
echo "launched browser-test backend PID=$!"
for i in $(seq 1 30); do
  curl -s -m 2 http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1 && break
  sleep 1
done
# Show the effective CORS allowlist as the app sees it.
./.venv/Scripts/python.exe -c "
import os
from app.core.config import get_settings
s = get_settings()
print('cors_origins =', s.cors_origins)
print('cookie_secure =', s.cookie_secure)
print('environment =', s.environment)
"
