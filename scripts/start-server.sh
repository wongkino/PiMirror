#!/usr/bin/env bash
# PiMirror dashboard API only (no Electron).
set -euo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
PI_ROOT="$(cd "$SCRIPTS/.." && pwd)"
DASHBOARD="$PI_ROOT/dashboard"
cd "$PI_ROOT"

# shellcheck source=load-config-env.sh
. "$SCRIPTS/load-config-env.sh"
_pi_load_config_env "$PI_ROOT/config/config.env"

export DASHBOARD_PORT="${DASHBOARD_PORT:-8090}"

exec node "$DASHBOARD/server.js"
