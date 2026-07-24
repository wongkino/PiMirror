#!/usr/bin/env bash
# DHT11: physical 1=3.3V, 9=GND, 11=GPIO17 (data)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$DIR/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
	echo "ERROR: missing $PY — run: python3 -m venv $DIR/.venv && $DIR/.venv/bin/pip install adafruit-circuitpython-dht Adafruit-Blinka"
	exit 1
fi
exec "$PY" "$DIR/read-dht11.py" "$@"
