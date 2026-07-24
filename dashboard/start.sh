#!/usr/bin/env bash
# Start PiMirror dashboard server only (no Electron kiosk).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
MM_ROOT="$(cd "$ROOT/.." && pwd)"
cd "$MM_ROOT"

# shellcheck source=../installers/load-config-env.sh
. "$MM_ROOT/installers/load-config-env.sh"
_mm_load_config_env "$MM_ROOT/config/config.env"

export DASHBOARD_PORT="${DASHBOARD_PORT:-8090}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:=wayland-0}"
export DISPLAY="${DISPLAY:=:0}"

exec node "$ROOT/server.js"
