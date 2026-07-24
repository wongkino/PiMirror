#!/usr/bin/env bash
# Docker entrypoint — server only or kiosk (API + Electron).
set -euo pipefail

PI_ROOT="${PI_ROOT:-/app}"
DASHBOARD="$PI_ROOT/dashboard"
RUN_MODE="${RUN_MODE:-kiosk}"
DASHBOARD_PORT="${DASHBOARD_PORT:-8090}"
SERVER_PID=""

cd "$PI_ROOT"

# shellcheck source=load-config-env.sh
. "$PI_ROOT/scripts/load-config-env.sh"
if [[ -f "$PI_ROOT/config/config.env" ]]; then
	_pi_load_config_env "$PI_ROOT/config/config.env"
fi

export DASHBOARD_PORT
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export DISPLAY="${DISPLAY:-:0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

health_ok () {
	curl -sf "http://127.0.0.1:${DASHBOARD_PORT}/api/health" >/dev/null 2>&1
}

wait_health () {
	for _ in $(seq 1 40); do
		health_ok && return 0
		sleep 0.25
	done
	return 1
}

start_server_bg () {
	if health_ok; then
		return 0
	fi
	node "$DASHBOARD/server.js" &
	SERVER_PID=$!
	wait_health || { echo "[entrypoint] server failed" >&2; exit 1; }
}

wayland_ready () {
	[[ -S "${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}" ]]
}

cleanup () {
	[[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ "$RUN_MODE" == "server" ]]; then
	echo "[entrypoint] RUN_MODE=server — :${DASHBOARD_PORT}"
	exec node "$DASHBOARD/server.js"
fi

echo "[entrypoint] RUN_MODE=kiosk"
start_server_bg

if ! wayland_ready; then
	echo "[entrypoint] no Wayland — API only on :${DASHBOARD_PORT}"
	if [[ -n "$SERVER_PID" ]]; then
		wait "$SERVER_PID"
	else
		exec node "$DASHBOARD/server.js"
	fi
fi

ELECTRON="$PI_ROOT/node_modules/.bin/electron"
if [[ ! -x "$ELECTRON" ]]; then
	echo "[entrypoint] Electron missing — API only"
	if [[ -n "$SERVER_PID" ]]; then wait "$SERVER_PID"; else exec node "$DASHBOARD/server.js"; fi
fi

echo "[entrypoint] Electron kiosk"
exec "$ELECTRON" "$DASHBOARD/electron-kiosk.js" --ozone-platform=wayland --no-sandbox
