#!/usr/bin/env bash
# PiMirror — system packages, Node.js 22+, PM2 (run as root).
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	git \
	python3 \
	python3-pip \
	python3-venv \
	libgtk-3-0 \
	libgbm1 \
	libnss3 \
	libasound2 \
	libxss1 \
	libxtst6 \
	libatk1.0-0 \
	libatk-bridge2.0-0 \
	libdrm2 \
	libxcomposite1 \
	libxdamage1 \
	libxfixes3 \
	libxrandr2 \
	xdg-utils

node_ok () {
	command -v node >/dev/null 2>&1 || return 1
	node -e '
const [maj, min] = process.version.slice(1).split(".").map(Number);
const ok = maj >= 24 || (maj === 22 && min >= 21);
process.exit(ok ? 0 : 1);
'
}

if ! node_ok; then
	echo "[install-deps] Installing Node.js 22 (NodeSource)…"
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
	echo "[install-deps] Installing PM2…"
	npm install -g pm2
fi

echo "[install-deps] node $(node -v) · npm $(npm -v) · pm2 $(pm2 -v)"
echo "[install-deps] done"
