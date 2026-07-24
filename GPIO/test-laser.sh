#!/usr/bin/env bash
# Laser module — 3 long, 2 short blink pattern
# Physical pins: 2=5V, 14=GND, 16=GPIO23 (signal)

set -euo pipefail

GPIO=23
LONG_ON=0.8
LONG_OFF=0.3
SHORT_ON=0.2
SHORT_OFF=0.2
GAP=0.8   # pause between pattern cycles
LOOPS=0   # 0 = forever; set e.g. 5 for finite runs

echo "=== Laser: 3 long + 2 short ==="
echo "Physical 2  -> 5V"
echo "Physical 14 -> GND"
echo "Physical 16 -> GPIO${GPIO} (signal)"
echo "Ctrl+C to stop (leaves laser OFF)"
echo

if ! command -v pinctrl >/dev/null 2>&1; then
	echo "ERROR: pinctrl not found"
	exit 1
fi

cleanup() {
	pinctrl set "$GPIO" op dl
	echo
	echo "=== Stopped — GPIO${GPIO} LOW (laser OFF) ==="
	pinctrl get "$GPIO"
}
trap cleanup EXIT INT TERM

blink() {
	local on="$1" off="$2"
	pinctrl set "$GPIO" op dh
	sleep "$on"
	pinctrl set "$GPIO" op dl
	sleep "$off"
}

n=0
while true; do
	n=$((n + 1))
	echo "--- cycle $n ---"
	echo "  long 1/3"
	blink "$LONG_ON" "$LONG_OFF"
	echo "  long 2/3"
	blink "$LONG_ON" "$LONG_OFF"
	echo "  long 3/3"
	blink "$LONG_ON" "$LONG_OFF"
	echo "  short 1/2"
	blink "$SHORT_ON" "$SHORT_OFF"
	echo "  short 2/2"
	blink "$SHORT_ON" "$SHORT_OFF"
	sleep "$GAP"

	if [[ "$LOOPS" -gt 0 && "$n" -ge "$LOOPS" ]]; then
		break
	fi
done
