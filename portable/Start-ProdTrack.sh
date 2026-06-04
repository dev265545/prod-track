#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${SCRIPT_DIR}/web"
PORT="${PRODTRACK_PORT:-3847}"
URL="http://127.0.0.1:${PORT}/"

if [[ ! -f "${WEB_DIR}/index.html" ]]; then
  echo "Missing web/index.html. Rebuild portable bundle on dev machine:"
  echo "  npm run build:web-sqlite"
  echo "  npm run pack-portable"
  exit 1
fi

if [[ ! -f "${WEB_DIR}/wasm/sql-wasm.wasm" ]]; then
  echo "WARNING: Missing web/wasm/sql-wasm.wasm (SQLite file mode will fail)."
fi

PY_CMD=""
if command -v python3 >/dev/null 2>&1; then
  PY_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PY_CMD="python"
else
  echo "Python is required. Install python3 and re-run this script."
  exit 1
fi

export PRODTRACK_PORT="${PORT}"
export PRODTRACK_OPEN_BROWSER=1

echo "Serving ${WEB_DIR} at ${URL}"
echo "(Routes like /employees map to employees.html — use this launcher, not plain http.server)"
exec "${PY_CMD}" "${SCRIPT_DIR}/serve.py"
