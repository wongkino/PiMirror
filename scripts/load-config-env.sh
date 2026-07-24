#!/bin/bash
# Load config/config.env into the current shell (overrides stale PM2 env).

_pi_load_config_env () {
	local env_file="$1"
	[ -f "$env_file" ] || return 0
	eval "$(python3 - "$env_file" <<'PY'
import shlex
import sys
from pathlib import Path

path = Path(sys.argv[1])
for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    eq = line.find("=")
    if eq <= 0:
        continue
    key = line[:eq].strip()
    val = line[eq + 1 :].strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
        val = val[1:-1]
        val = val.replace("\\\"", '"').replace("\\\\", "\\")
    if not key or not key.replace("_", "").isalnum():
        continue
    print(f"export {key}={shlex.quote(val)}")
PY
)"
}
