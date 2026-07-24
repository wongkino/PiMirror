# PiMirror — dashboard API + optional Electron kiosk (arm64 / amd64)
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
	PI_ROOT=/app \
	DASHBOARD_PORT=8090 \
	RUN_MODE=kiosk

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
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
	xdg-utils \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY dashboard ./dashboard
COPY config/config.env.sample ./config/config.env.sample
COPY gpio ./gpio
COPY scripts/load-config-env.sh scripts/docker-entrypoint.sh ./scripts/

RUN chmod +x /app/scripts/*.sh \
	&& cp /app/config/config.env.sample /app/config/config.env \
	&& python3 -m venv /app/gpio/.venv \
	&& /app/gpio/.venv/bin/pip install -q --upgrade pip \
	&& /app/gpio/.venv/bin/pip install -q adafruit-circuitpython-dht adafruit-blinka

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
	CMD curl -sf "http://127.0.0.1:${DASHBOARD_PORT}/api/health" || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
