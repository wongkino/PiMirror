#!/usr/bin/env bash
# Refresh HA media dashboard poster grid (/local/media-dash/).
# Usage: ./scripts/ha-media-dash.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
set +u; set -a; source "$ROOT/config/config.env"; set +a; set -u

: "${SONARR_BASE_URL:?}"
: "${SONARR_API_KEY:?}"
: "${RADARR_BASE_URL:?}"
: "${RADARR_API_KEY:?}"
: "${HA_URL:?}"
: "${HA_TOKEN:?}"
: "${PORTAINER_URL:?}"
: "${PORTAINER_TOKEN:?}"

python3 <<'PY'
import base64, datetime, html, io, json, os, ssl, subprocess, tarfile, urllib.parse, urllib.request
from pathlib import Path

ctx = ssl._create_unverified_context()
SONARR = os.environ["SONARR_BASE_URL"].rstrip("/")
RADARR = os.environ["RADARR_BASE_URL"].rstrip("/")
HA = os.environ["HA_URL"].rstrip("/")
P = os.environ["PORTAINER_URL"].rstrip("/")
PT = os.environ["PORTAINER_TOKEN"]
E = os.environ.get("PORTAINER_ENDPOINT_ID", "6")

def curl_json(url, headers):
    cmd = ["curl", "-sk", url]
    for k, v in headers.items():
        cmd.extend(["-H", f"{k}: {v}"])
    return json.loads(subprocess.check_output(cmd, timeout=60))

def opt_img(url, w=200, h=300):
    if not url:
        return ""
    url = url.replace("/t/p/original/", f"/t/p/w{w}/")
    if "image.tmdb.org" in url:
        return url
    enc = urllib.parse.quote(url, safe="")
    return f"https://images.weserv.nl/?url={enc}&w={w}&h={h}&fit=cover&output=webp&q=82"

def poster_from_images(images):
    if not images:
        return ""
    poster = next((i for i in images if i.get("coverType") == "poster"), images[0])
    return poster.get("remoteUrl") or ""

upcoming = curl_json(
    f"{HA}/api/states/sensor.sonarr_upcoming",
    {"Authorization": f"Bearer {os.environ['HA_TOKEN']}"},
)
skip = {"friendly_name", "icon", "attribution", "device_class", "unit_of_measurement", "state_class"}
wanted = [(k, v) for k, v in (upcoming.get("attributes") or {}).items() if k not in skip]

series_list = curl_json(f"{SONARR}/api/v3/series", {"X-Api-Key": os.environ["SONARR_API_KEY"]})
by_title = {s.get("title", "").casefold(): s for s in series_list}
sonarr_cards = []
for title, ep in wanted:
    s = by_title.get(title.casefold())
    if not s:
        s = next((x for t, x in by_title.items() if title.casefold() in t or t in title.casefold()), None)
    sonarr_cards.append({
        "title": title,
        "ep": ep,
        "poster": opt_img(poster_from_images((s or {}).get("images") or []), 200, 300),
    })

start = datetime.date.today().isoformat()
end = (datetime.date.today() + datetime.timedelta(days=21)).isoformat()
radarr_cal = curl_json(
    f"{RADARR}/api/v3/calendar?start={start}&end={end}&includeMovie=true",
    {"X-Api-Key": os.environ["RADARR_API_KEY"]},
)
movies = {}
for m in radarr_cal:
    mid = m.get("id")
    if mid in movies:
        continue
    release = m.get("digitalRelease") or m.get("physicalRelease") or m.get("inCinemas") or ""
    movies[mid] = {
        "title": m.get("title"),
        "release": (release or "")[:10],
        "poster": opt_img(poster_from_images(m.get("images") or []), 200, 300),
    }
radarr_cards = sorted(movies.values(), key=lambda x: x["release"] or "9999")

def cards_html(items):
    parts = ['<div class="grid">']
    for it in items:
        img = it["poster"]
        img_tag = (
            f'<img src="{html.escape(img)}" alt="" loading="lazy" width="200" height="300" decoding="async"/>'
            if img else '<div class="ph">無海報</div>'
        )
        meta = it.get("ep") or it.get("release") or ""
        parts.append(
            f'<article class="card"><div class="poster">{img_tag}</div>'
            f'<div class="meta"><div class="t">{html.escape(it["title"])}</div>'
            f'<div class="s">{html.escape(str(meta))}</div></div></article>'
        )
    parts.append("</div>")
    return "\n".join(parts)

CSS = """
  :root { color-scheme: dark; }
  body { margin:0; padding:4px 2px 8px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: transparent; color: #f2f2f2; }
  h2 { font-size: 1rem; font-weight: 650; margin: 0.2rem 0 0.7rem; }
  section { margin-bottom: 1rem; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  .card { background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; overflow: hidden; }
  .poster { aspect-ratio: 2/3; background: #181818; }
  .poster img { width:100%; height:100%; object-fit: cover; display:block; }
  .ph { display:flex; align-items:center; justify-content:center; height:100%; min-height:150px; color:#777; font-size:0.75rem; }
  .meta { padding: 7px 8px 9px; }
  .t { font-size: 0.74rem; font-weight: 600; line-height: 1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .s { margin-top: 3px; font-size: 0.7rem; color: #a8a8a8; }
  .empty { opacity:.65; font-size:.9rem; padding: 12px 4px; }
"""

def shell_page(body_html):
    return f"""<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>{CSS}</style></head><body>{body_html}</body></html>
"""

sonarr_body = cards_html(sonarr_cards) if sonarr_cards else '<p class="empty">暫時沒有即將推出的劇集</p>'
radarr_body = cards_html(radarr_cards) if radarr_cards else '<p class="empty">暫時沒有即將推出的電影</p>'
sonarr_page = shell_page(sonarr_body)
radarr_page = shell_page(radarr_body)
page = shell_page(
    f"<section><h2>劇集</h2>{sonarr_body}</section>"
    f"<section><h2>電影</h2>{radarr_body}</section>"
)

def portainer(method, path, data=None, raw=None, content_type=None):
    headers = {"X-API-Key": PT}
    body = None
    if raw is not None:
        body = raw
        headers["Content-Type"] = content_type or "application/octet-stream"
    elif data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(f"{P}{path}", data=body, method=method, headers=headers)
    with urllib.request.urlopen(r, context=ctx, timeout=60) as resp:
        return resp.status, resp.read()

_, containers = portainer("GET", f"/api/endpoints/{E}/docker/containers/json?all=true")
cid = next(
    c["Id"]
    for c in json.loads(containers)
    if any(n.lstrip("/") == os.environ.get("PORTAINER_HA_CONTAINER", "homeassistant") for n in (c.get("Names") or []))
)

# ensure dir
eid = json.loads(
    portainer(
        "POST",
        f"/api/endpoints/{E}/docker/containers/{cid}/exec",
        {"AttachStdout": True, "AttachStderr": True, "Cmd": ["mkdir", "-p", "/config/www/media-dash"]},
    )[1]
)["Id"]
portainer("POST", f"/api/endpoints/{E}/docker/exec/{eid}/start", {"Detach": False, "Tty": False})

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w") as tar:
    for name, content in (
        ("index.html", page),
        ("sonarr.html", sonarr_page),
        ("radarr.html", radarr_page),
    ):
        data = content.encode()
        info = tarfile.TarInfo(name=name)
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))
status, _ = portainer(
    "PUT",
    f"/api/endpoints/{E}/docker/containers/{cid}/archive?path=/config/www/media-dash",
    raw=buf.getvalue(),
    content_type="application/x-tar",
)
Path("/home/wongkino/MagicMirror/config/homeassistant/media-dash.html").write_text(page)
print(f"uploaded HTTP {status}; sonarr={len(sonarr_cards)} radarr={len(radarr_cards)}")
print("open: /local/media-dash/sonarr.html + radarr.html")
PY
