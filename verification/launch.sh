#!/usr/bin/env bash
# usage: launch.sh <WORKERS> <PORT> [MODEL_PATH] [ALLOW_HEURISTIC_FALLBACK] [COOKIE_SECURE]
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../backend"

export PORT_OVERRIDE="${2:-8000}"
if [ -n "${3:-}" ]; then export MODEL_PATH_OVERRIDE="$3"; fi
if [ -n "${4:-}" ]; then export ALLOW_HEURISTIC_FALLBACK_OVERRIDE="$4"; fi
if [ -n "${5:-}" ]; then export COOKIE_SECURE_OVERRIDE="$5"; fi
if [ -n "${6:-}" ]; then export DATABASE_URL_OVERRIDE="$6"; fi
if [ -n "${7:-}" ]; then export REDIS_URL_OVERRIDE="$7"; fi
if [ -n "${8:-}" ]; then export CORS_ORIGINS_OVERRIDE="$8"; fi

# shellcheck disable=SC1091
source "$HERE/prod_env.sh" "${1:-1}"

mkdir -p uploads_e2e logs_e2e
rm -f "backend_prod_${PORT}.log"
nohup ./.venv/Scripts/python.exe -m uvicorn app.main:app \
    --host 127.0.0.1 --port "$PORT" --workers "$WORKERS" \
    > "backend_prod_${PORT}.log" 2>&1 &
echo $! > "$HERE/.backend_pid"
echo "launched uvicorn PID=$! port=$PORT workers=$WORKERS"
# wait for readiness
for i in $(seq 1 60); do
  if curl -s -m 2 "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null 2>&1; then
    echo "ready after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "TIMEOUT waiting for backend on ${PORT}"
exit 1
