#!/usr/bin/env bash
# PiMirror — project setup: npm, optional GPIO venv, PM2 app (run as target user).
set -euo pipefail

PI_USER="${PIMIRROR_USER:-$(id -un)}"
PI_HOME="${PIMIRROR_HOME:-$(eval echo "~$PI_USER")}"
PIMIRROR_DIR="${PIMIRROR_DIR:-$PI_HOME/PiMirror}"
INSTALL_GPIO="${INSTALL_GPIO:-1}"
SETUP_PM2="${SETUP_PM2:-1}"

if [[ ! -d "$PIMIRROR_DIR" ]]; then
	echo "ERROR: PiMirror not found at $PIMIRROR_DIR" >&2
	echo "Clone or copy the repo before bootstrap." >&2
	exit 1
fi

cd "$PIMIRROR_DIR"

echo "[bootstrap] npm install in $PIMIRROR_DIR"
npm install --omit=dev --no-audit --no-fund

if [[ "$INSTALL_GPIO" == "1" ]] && [[ -d "$PIMIRROR_DIR/gpio" ]]; then
	VENV="$PIMIRROR_DIR/gpio/.venv"
	if [[ ! -x "$VENV/bin/python" ]]; then
		echo "[bootstrap] GPIO Python venv…"
		python3 -m venv "$VENV"
		"$VENV/bin/pip" install -q --upgrade pip
		"$VENV/bin/pip" install -q adafruit-circuitpython-dht adafruit-blinka
	fi
fi

if [[ ! -f "$PIMIRROR_DIR/config/config.env" ]]; then
	cp "$PIMIRROR_DIR/config/config.env.sample" "$PIMIRROR_DIR/config/config.env"
	echo "[bootstrap] created config/config.env from sample — edit secrets before deploy"
fi

chmod +x "$PIMIRROR_DIR/scripts/"*.sh

if [[ "$SETUP_PM2" != "1" ]]; then
	echo "[bootstrap] SETUP_PM2=0 — skipped PM2"
	exit 0
fi

export PM2_HOME="${PM2_HOME:-$PI_HOME/.pm2}"
mkdir -p "$PM2_HOME"

pm2 delete PiMirrorKiosk 2>/dev/null || true
pm2 start "$PIMIRROR_DIR/ecosystem.config.cjs"
pm2 save

echo "[bootstrap] done — PiMirrorKiosk saved to PM2 dump"
