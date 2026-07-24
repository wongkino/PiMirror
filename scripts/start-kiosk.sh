#!/usr/bin/env bash
# PiMirror kiosk: dashboard API + Electron fullscreen shell.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
PI_ROOT="$(cd "$SCRIPTS/.." && pwd)"
DASHBOARD="$PI_ROOT/dashboard"
cd "$PI_ROOT"

# shellcheck source=load-config-env.sh
. "$SCRIPTS/load-config-env.sh"
_pi_load_config_env "$PI_ROOT/config/config.env"

export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:=wayland-0}"
export DISPLAY="${DISPLAY:=:0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"
export DASHBOARD_PORT="${DASHBOARD_PORT:-8090}"

SERVER_PID=""
cleanup () {
	if [[ -n "$SERVER_PID" ]]; then
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
}
trap cleanup EXIT INT TERM

wait_for_wayland () {
	local sock="${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}"
	for _ in $(seq 1 120); do
		[[ -S "$sock" ]] && return 0
		sleep 1
	done
	echo "Wayland socket not ready: $sock" >&2
	return 1
}

health_url="http://127.0.0.1:${DASHBOARD_PORT}/api/health"
if ! curl -sf "$health_url" >/dev/null 2>&1; then
	node "$DASHBOARD/server.js" &
	SERVER_PID=$!
	for _ in $(seq 1 40); do
		curl -sf "$health_url" >/dev/null 2>&1 && break
		sleep 0.25
	done
	if ! curl -sf "$health_url" >/dev/null 2>&1; then
		echo "Dashboard server failed on port ${DASHBOARD_PORT}" >&2
		exit 1
	fi
fi

wait_for_wayland

ELECTRON="$PI_ROOT/node_modules/.bin/electron"
if [[ ! -x "$ELECTRON" ]]; then
	echo "Electron not found — run: npm install" >&2
	exit 1
fi

exec "$ELECTRON" "$DASHBOARD/electron-kiosk.js" --ozone-platform=wayland
