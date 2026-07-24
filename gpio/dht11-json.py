#!/usr/bin/env python3
"""Emit one DHT11 reading as JSON on stdout. Exit 0 on success."""

from __future__ import annotations

import json
import sys
import time

import adafruit_dht
import board

PIN = board.D17  # physical pin 11
TRIES = 6


def main() -> int:
	dht = adafruit_dht.DHT11(PIN, use_pulseio=False)
	try:
		for _ in range(TRIES):
			try:
				temp = dht.temperature
				hum = dht.humidity
				if temp is None or hum is None:
					raise RuntimeError("None")
				print(json.dumps({"ok": True, "temperature": float(temp), "humidity": float(hum)}))
				return 0
			except Exception:
				time.sleep(1.1)
		print(json.dumps({"ok": False, "error": "read_failed"}))
		return 1
	finally:
		dht.exit()


if __name__ == "__main__":
	sys.exit(main())
