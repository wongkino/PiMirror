#!/usr/bin/env python3
"""Read DHT11 on physical pins: 1=3.3V, 9=GND, 11=GPIO17 (data)."""

from __future__ import annotations

import sys
import time

import adafruit_dht
import board

DATA_PIN = board.D17  # physical pin 11
MAX_TRIES = 10


def main() -> int:
	print("=== DHT11 ===")
	print("Physical 1  -> 3.3V")
	print("Physical 9  -> GND")
	print("Physical 11 -> GPIO17 (data)")
	print()

	dht = adafruit_dht.DHT11(DATA_PIN, use_pulseio=False)
	last_err: Exception | None = None
	try:
		for attempt in range(1, MAX_TRIES + 1):
			try:
				temp = dht.temperature
				hum = dht.humidity
				if temp is None or hum is None:
					raise RuntimeError("None reading")
				print(f"attempt {attempt}: OK")
				print(f"temperature: {temp:.1f} °C")
				print(f"humidity:    {hum:.1f} %")
				return 0
			except Exception as exc:  # noqa: BLE001 — DHT bus is noisy
				last_err = exc
				print(f"attempt {attempt}: {exc}", file=sys.stderr)
				time.sleep(1.2)
	finally:
		dht.exit()

	print(f"ERROR: failed after {MAX_TRIES} tries: {last_err}", file=sys.stderr)
	return 1


if __name__ == "__main__":
	sys.exit(main())
