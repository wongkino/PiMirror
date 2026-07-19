#!/usr/bin/env bash
# Control Home Assistant container via Portainer API.
# Usage:
#   ./scripts/portainer-ha.sh status
#   ./scripts/portainer-ha.sh restart
#   ./scripts/portainer-ha.sh logs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/config/config.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
# Avoid set -u breaking on $ in hashes (e.g. ADMIN_PASSWORD_HASH)
set +u
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
set -u

: "${PORTAINER_URL:?PORTAINER_URL missing in config.env}"
: "${PORTAINER_TOKEN:?PORTAINER_TOKEN missing in config.env}"
ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-6}"
CONTAINER="${PORTAINER_HA_CONTAINER:-homeassistant}"

api() {
  local method="$1" path="$2"
  shift 2
  curl -sk -X "$method" -H "X-API-Key: $PORTAINER_TOKEN" \
    "${PORTAINER_URL}${path}" "$@"
}

resolve_id() {
  api GET "/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
    | python3 -c "
import sys, json
name = '''${CONTAINER}'''
for c in json.load(sys.stdin):
    names = [n.lstrip('/') for n in (c.get('Names') or [])]
    if name in names:
        print(c['Id'])
        break
else:
    raise SystemExit(f'container not found: {name}')
"
}

cmd="${1:-status}"
case "$cmd" in
  status)
    api GET "/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
      | python3 -c "
import sys, json
name = '''${CONTAINER}'''
for c in json.load(sys.stdin):
    names = [n.lstrip('/') for n in (c.get('Names') or [])]
    if name in names:
        print('name:', name)
        print('id:', c['Id'][:12])
        print('state:', c.get('State'))
        print('status:', c.get('Status'))
        print('image:', c.get('Image'))
        break
else:
    raise SystemExit('not found')
"
    ;;
  restart)
    CID="$(resolve_id)"
    echo "Restarting ${CONTAINER} (${CID:0:12}) on endpoint ${ENDPOINT_ID}..."
    code="$(curl -sk -o /tmp/portainer-ha-restart.json -w '%{http_code}' -X POST \
      -H "X-API-Key: $PORTAINER_TOKEN" \
      "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/containers/${CID}/restart")"
    echo "HTTP $code"
    if [[ "$code" != "204" && "$code" != "200" ]]; then
      cat /tmp/portainer-ha-restart.json; echo
      exit 1
    fi
    echo "OK"
    ;;
  logs)
    CID="$(resolve_id)"
    api GET "/api/endpoints/${ENDPOINT_ID}/docker/containers/${CID}/logs?stdout=true&stderr=true&tail=80" \
      | tr -d '\000' | sed 's/[^[:print:]\t]//g'
    ;;
  *)
    echo "Usage: $0 {status|restart|logs}" >&2
    exit 1
    ;;
esac
