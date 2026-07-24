#!/bin/bash
# MagicMirror launcher — local (realtime) or remote client.
cd "$(dirname "$0")/.." || exit 1

# shellcheck source=load-config-env.sh
. "$(dirname "$0")/load-config-env.sh"
_mm_load_config_env "$(pwd)/config/config.env"

mode="$(printf '%s' "${MM_MODE:-local}" | tr '[:upper:]' '[:lower:]')"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:=wayland-0}"
export DISPLAY="${DISPLAY:=:0}"

case "$mode" in
	client|remote)
		addr="${MM_SERVER_ADDRESS:-}"
		port="${MM_SERVER_PORT:-8080}"
		tls="$(printf '%s' "${MM_SERVER_TLS:-false}" | tr '[:upper:]' '[:lower:]')"
		if [ -z "$addr" ]; then
			echo "MM_SERVER_ADDRESS is empty. Edit config/config.env then restart."
			exit 1
		fi
		export ADDRESS="$addr"
		export PORT="$port"
		echo "MagicMirror client → ${addr}:${port} (tls=${tls})"
		if [ "$tls" = "true" ] || [ "$tls" = "1" ] || [ "$tls" = "yes" ]; then
			exec node clientonly --address "$addr" --port "$port" --use-tls
		fi
		exec node clientonly --address "$addr" --port "$port"
		;;
	local|realtime|server|*)
		echo "MagicMirror local/realtime (WAYLAND_DISPLAY=${WAYLAND_DISPLAY})"
		# Full Electron app: server + UI + node_helpers on this Pi (GPIO OK)
		exec ./node_modules/.bin/electron js/electron.js --ozone-platform=wayland
		;;
esac
