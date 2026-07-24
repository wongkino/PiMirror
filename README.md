# PiMirror

Raspberry Pi 橫向 HTML 儀表板（1480×320），含 Electron 全螢幕 kiosk。

功能：HKO 天氣／警告、ICS 行事曆、Home Assistant 媒體控制、DHT11 溫溼度（選用）。

---

## 選擇部署方式

| 方式 | 適合 | 設定檔 |
|------|------|--------|
| **Docker** | 新機快速部署、多台複製 | `.env` |
| **PM2（原生）** | 專用鏡面 Pi，Wayland 最穩 | `config/config.env` |
| **Image 建置** | 自訂 Pi OS image（pi-gen） | `scripts/image-install.sh` |

> 同一台 Pi **不要** 同時跑 Docker kiosk 與 PM2 kiosk（會搶 port 8090 與螢幕）。

---

## 硬體需求

- Raspberry Pi 4/5，**4GB+ RAM**，32GB+ 儲存
- **1480×320** 橫向螢幕（UI 針對此比例設計）
- Raspberry Pi OS 64-bit + **Wayland**（labwc）
- 網路（天文台 API、ICS 行事曆）
- 選用：DHT11（GPIO17）、Home Assistant（同網段）

---

## Docker 部署

Image：`ghcr.io/wongkino/pimirror:latest`（GitHub Actions 自動 build **arm64**）

### 快速開始

```bash
git clone https://github.com/wongkino/PiMirror.git
cd PiMirror
cp .env.example .env
# 編輯 .env

docker compose pull    # 或 docker build -t pimirror:latest .
docker compose up -d
```

### 模式

| 指令 | 說明 |
|------|------|
| `docker compose up -d` | Kiosk（API + Electron 全螢幕） |
| `docker compose -f docker-compose.server.yml up -d` | 僅 API（port 8090） |

### `.env` 主要變數

| 變數 | 說明 |
|------|------|
| `UID` / `GID` | 容器使用者（`id -u` / `id -g`） |
| `PIMIRROR_IMAGE` | Docker image 名稱 |
| `DASHBOARD_PORT` | API 埠（預設 8090） |
| `HKO_STATION` | 天文台天氣站 |
| `CALENDAR_URL` | 個人 ICS 行事曆 |
| `HA_URL` / `HA_TOKEN` | Home Assistant |
| `WAYLAND_DISPLAY` | Kiosk 用（預設 `wayland-0`） |
| `XDG_RUNTIME_DIR` | Kiosk 用（預設 `/run/user/1000`） |

Kiosk 模式會掛載 host 的 `$XDG_RUNTIME_DIR`，讓容器內 Electron 使用 Wayland 顯示。

### 開機自啟

```bash
sudo cp systemd/pimirror-docker.service /etc/systemd/system/
# 編輯 WorkingDirectory
sudo systemctl enable --now pimirror-docker.service
```

---

## PM2 部署（原生，推薦鏡面機）

```bash
git clone https://github.com/wongkino/PiMirror.git
cd PiMirror

cp config/config.env.sample config/config.env
# 編輯 config/config.env

npm install
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # 依提示設定開機
```

| 指令 | 說明 |
|------|------|
| `npm start` | Kiosk（API + Electron） |
| `npm run server` | 僅 API |
| `pm2 restart PiMirrorKiosk` | 重啟 |

### `config/config.env` 主要變數

| 變數 | 說明 |
|------|------|
| `DASHBOARD_PORT` | API 埠 |
| `HKO_STATION` | 天文台天氣站 |
| `CALENDAR_URL` / `HOLIDAYS_ICS_URL` | 行事曆 |
| `HA_URL` / `HA_TOKEN` | Home Assistant |

---

## Pi Image 建置（選用）

將 repo 放入 rootfs 後，在 chroot 以 root 執行：

```bash
export CHROOT=1
export PIMIRROR_USER=pi
export PIMIRROR_DIR=/home/pi/PiMirror
./scripts/image-install.sh
```

詳見 `scripts/install-deps.sh`、`scripts/bootstrap.sh`。

---

## 專案結構

```
PiMirror/
├── .env.example              Docker 設定範本
├── docker-compose.yml        Kiosk
├── docker-compose.server.yml API only
├── Dockerfile
├── ecosystem.config.cjs      PM2
├── config/
│   └── config.env.sample     PM2 設定範本
├── dashboard/
│   ├── public/               HTML / CSS / JS
│   ├── server.js             API
│   └── electron-kiosk.js
├── gpio/                     DHT11（見 gpio/README.md）
├── scripts/                  啟動與安裝腳本
└── systemd/
```

---

## API

| 端點 | 說明 |
|------|------|
| `GET /api/health` | 健康檢查 |
| `GET /api/weather` | HKO 天氣 |
| `GET /api/calendar` | 行事曆 |
| `GET /api/dht` | DHT11 溫溼度 |
| `GET /api/ha/*` | Home Assistant |

前端：`http://127.0.0.1:8090/`

---

## 授權

MIT
