#!/usr/bin/env bash
# Electron kiosk for HTML dashboard (server + fullscreen shell).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
MM_ROOT="$(cd "$ROOT/.." && pwd)"
cd "$MM_ROOT"

# shellcheck source=../installers/load-config-env.sh
. "$MM_ROOT/installers/load-config-env.sh"
_mm_load_config_env "$MM_ROOT/config/config.env"

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
		if [[ -S "$sock" ]]; then
			return 0
		fi
		sleep 1
	done
	echo "Wayland socket not ready: $sock" >&2
	return 1
}

health_url="http://127.0.0.1:${DASHBOARD_PORT}/api/health"
if ! curl -sf "$health_url" >/dev/null 2>&1; then
	node "$ROOT/server.js" &
	SERVER_PID=$!
	for _ in $(seq 1 40); do
		if curl -sf "$health_url" >/dev/null 2>&1; then
			break
		fi
		sleep 0.25
	done
	if ! curl -sf "$health_url" >/dev/null 2>&1; then
		echo "Dashboard server failed to start on port ${DASHBOARD_PORT}" >&2
		exit 1
	fi
fi

wait_for_wayland

ELECTRON="$MM_ROOT/node_modules/.bin/electron"
if [[ ! -x "$ELECTRON" ]]; then
	echo "Electron not found at $ELECTRON" >&2
	exit 1
fi

exec "$ELECTRON" "$ROOT/electron-kiosk.js" --ozone-platform=wayland
