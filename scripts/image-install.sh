#!/usr/bin/env bash
# PiMirror — full image install (root). Use during pi-gen chroot or first boot.
#
# Usage:
#   sudo ./scripts/image-install.sh
#   sudo PIMIRROR_USER=pi PIMIRROR_DIR=/home/pi/PiMirror ./scripts/image-install.sh
#   sudo CHROOT=1 ./scripts/image-install.sh          # pi-gen (no pm2 startup)
#
# Environment:
#   PIMIRROR_USER   target user (default: pi)
#   PIMIRROR_DIR    repo path (default: ~user/PiMirror)
#   INSTALL_GPIO    1 = DHT11 venv (default: 1)
#   CHROOT          1 = image build chroot mode
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
	echo "Run as root: sudo $0" >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_USER="${PIMIRROR_USER:-pi}"
PI_HOME="${PIMIRROR_HOME:-/home/$PI_USER}"
PIMIRROR_DIR="${PIMIRROR_DIR:-$PI_HOME/PiMirror}"

echo "=== PiMirror image-install ==="
echo "  user=$PI_USER  dir=$PIMIRROR_DIR  CHROOT=${CHROOT:-0}"

bash "$SCRIPT_DIR/install-deps.sh"

if [[ ! -d "$PIMIRROR_DIR" ]]; then
	echo "ERROR: $PIMIRROR_DIR missing — copy PiMirror into image before this script." >&2
	exit 1
fi

chown -R "$PI_USER:$PI_USER" "$PIMIRROR_DIR"

sudo -u "$PI_USER" env \
	PIMIRROR_USER="$PI_USER" \
	PIMIRROR_HOME="$PI_HOME" \
	PIMIRROR_DIR="$PIMIRROR_DIR" \
	INSTALL_GPIO="${INSTALL_GPIO:-1}" \
	SETUP_PM2=1 \
	HOME="$PI_HOME" \
	bash "$SCRIPT_DIR/bootstrap.sh"

if [[ "${CHROOT:-0}" == "1" ]]; then
	install -D -m 0644 "$PIMIRROR_DIR/systemd/pimirror-firstboot.service" /etc/systemd/system/pimirror-firstboot.service
	sed -i "s|User=pi|User=$PI_USER|g; s|/home/pi|$PI_HOME|g" /etc/systemd/system/pimirror-firstboot.service
	systemctl enable pimirror-firstboot.service
	echo "[image-install] enabled pimirror-firstboot.service (runs once on first boot)"
else
	STARTUP_CMD=$(sudo -u "$PI_USER" env HOME="$PI_HOME" pm2 startup systemd -u "$PI_USER" --hp "$PI_HOME" 2>&1 | grep "^sudo" | tail -1 || true)
	if [[ -n "$STARTUP_CMD" ]]; then
		eval "$STARTUP_CMD" || true
		sudo -u "$PI_USER" env HOME="$PI_HOME" pm2 save
	fi
fi

echo "=== PiMirror image-install complete ==="
