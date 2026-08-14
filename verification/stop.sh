#!/usr/bin/env bash
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/.backend_pid" ]; then
  PID="$(cat "$HERE/.backend_pid")"
  echo "stopping backend tree PID=$PID"
  taskkill //F //T //PID "$PID" >/dev/null 2>&1 || true
  rm -f "$HERE/.backend_pid"
fi
sleep 1
