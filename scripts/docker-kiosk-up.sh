#!/usr/bin/env bash
# Wait for host XDG_RUNTIME_DIR, then start kiosk compose stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

read_env_var () {
	local key="$1"
	local file="$2"
	[[ -f "$file" ]] || return 1
	grep -E "^${key}=" "$file" | tail -1 | cut -d= -f2- || true
}

host_uid="$(id -u)"
host_gid="$(id -g)"
xdg_runtime_dir="/run/user/$host_uid"

env_uid="$(read_env_var UID .env)"
env_xdg="$(read_env_var XDG_RUNTIME_DIR .env)"

if [[ -n "$env_uid" ]]; then
	host_uid="$env_uid"
fi
if [[ -n "$env_xdg" ]]; then
	xdg_runtime_dir="$env_xdg"
elif [[ -n "$env_uid" ]]; then
	xdg_runtime_dir="/run/user/$env_uid"
fi

wait_for_runtime () {
	local dir="$1"
	local max="${2:-120}"
	local i
	for ((i = 1; i <= max; i++)); do
		if [[ -d "$dir" ]]; then
			return 0
		fi
		echo "[docker-kiosk-up] waiting for $dir ($i/${max})..."
		sleep 1
	done
	echo "[docker-kiosk-up] ERROR: bind source does not exist: $dir" >&2
	echo "  Fix .env: XDG_RUNTIME_DIR=/run/user/\$(id -u)" >&2
	echo "  Or enable linger: loginctl enable-linger \$(whoami) && sudo reboot" >&2
	echo "  Or API only: docker compose -f docker-compose.server.yml up -d" >&2
	exit 1
}

wait_for_runtime "$xdg_runtime_dir" "${WAIT_RUNTIME_SEC:-120}"
exec docker compose up -d "$@"
