#!/bin/bash
cd "$(dirname "$0")/.." || exit 1

# config.env must win over stale PM2-injected environment variables
# shellcheck source=load-config-env.sh
. "$(dirname "$0")/load-config-env.sh"
_mm_load_config_env "$(pwd)/config/config.env"

if [ "$(ps -ef | grep -v grep | grep -i -e xway -e labwc | wc -l)" -ne 0 ]; then
	# if WAYLAND_DISPLAY is set, use it, else set to -0
	export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:=wayland-0}"
	npm run start:wayland
else
	DISPLAY=:0 npm run start:x11
fi
