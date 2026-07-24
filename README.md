# PiMirror

Raspberry Pi 橫向 HTML 儀表板（1480×320），Electron kiosk 全螢幕。

## Docker（推薦：pull 即用）

Image 已內建 Node、Electron、Python/DHT11 依賴與 dashboard，**無需 npm install**。

### 1. 準備設定

```bash
git clone https://github.com/wongkino/PiMirror.git
cd PiMirror
cp .env.example .env
# 編輯 .env（UID/GID、HA_TOKEN、CALENDAR_URL 等）
```

### 2. 建置或拉取 image

```bash
# 方式 A：pull GHCR（push master 後 Actions 自動 build arm64）
# .env 已預設 PIMIRROR_IMAGE=ghcr.io/wongkino/pimirror:latest
docker compose pull

# 方式 B：本機建置
docker build -t pimirror:latest .
# .env 設 PIMIRROR_IMAGE=pimirror:latest
```

### 3. 啟動 kiosk（Pi + 螢幕）

```bash
docker compose up -d
```

Compose 以 **`environment:`** 從 `.env` 注入設定；僅掛載 Wayland runtime。

### 4. 僅 API（無螢幕 / 開發）

```bash
docker compose -f docker-compose.server.yml up -d
# 瀏覽器開 http://<host>:8090/
```

### 5. 開機自啟（host systemd）

```bash
sudo cp systemd/pimirror-docker.service /etc/systemd/system/
# 編輯 WorkingDirectory、UID
sudo systemctl enable --now pimirror-docker.service
```

### Docker 環境變數（`.env`）

| 變數 | 預設 | 說明 |
|------|------|------|
| `UID` / `GID` | `1000` | 容器使用者（`id -u` / `id -g`） |
| `PIMIRROR_IMAGE` | `ghcr.io/.../pimirror:latest` | Docker image |
| `DASHBOARD_PORT` | `8090` | API 埠 |
| `HKO_STATION` | `元朗公園` | 天文台天氣站 |
| `CALENDAR_URL` | — | 個人 ICS |
| `HA_URL` / `HA_TOKEN` | — | Home Assistant |
| `WAYLAND_DISPLAY` | `wayland-0` | kiosk 用 |
| `XDG_RUNTIME_DIR` | `/run/user/1000` | kiosk 用 |

---

## 原生安裝（PM2）

```bash
git clone https://github.com/wongkino/PiMirror.git
cd PiMirror

cp config/config.env.sample config/config.env
# 編輯 HA token、行事曆 URL 等

npm install
pm2 start ecosystem.config.cjs && pm2 save
```

## Image 自動安裝（建議）

建 Pi image 時，先把本 repo 放進 rootfs（例如 `/home/pi/PiMirror`），在 **chroot** 內執行：

```bash
# pi-gen / 自訂 rootfs 內（以 root）
export CHROOT=1
export PIMIRROR_USER=pi
export PIMIRROR_DIR=/home/pi/PiMirror
./PiMirror/scripts/image-install.sh
```

會自動安裝：

| 項目 | 腳本 |
|------|------|
| apt 依賴、Node 22+、PM2 | `scripts/install-deps.sh` |
| `npm install`、GPIO venv、PM2 app | `scripts/bootstrap.sh` |
| 以上合併 | `scripts/image-install.sh` |

**CHROOT=1** 時會啟用 `pimirror-firstboot.service`，首次開機完成 PM2 systemd 註冊。

### 已開機的 Pi（非 chroot）

```bash
sudo ./scripts/image-install.sh
# 或只裝系統套件：
sudo ./scripts/install-deps.sh
# 再以一般使用者裝專案：
./scripts/bootstrap.sh
```

### 環境變數

| 變數 | 預設 | 說明 |
|------|------|------|
| `PIMIRROR_USER` | `pi` | 執行使用者 |
| `PIMIRROR_DIR` | `~/PiMirror` | 專案路徑 |
| `INSTALL_GPIO` | `1` | 建立 DHT11 Python venv |
| `CHROOT` | `0` | image build 模式 |

## 指令

| 指令 | 說明 |
|------|------|
| `npm start` | kiosk（API + Electron） |
| `npm run server` | 僅 dashboard API |
| `pm2 restart PiMirrorKiosk` | 重啟 kiosk |

## 結構

```
├── Dockerfile / docker-compose.yml
├── .env                    Docker 設定（compose environment，不 commit）
├── config/config.env       原生 PM2 安裝用（不 commit）
├── dashboard/
│   ├── public/             前端
│   ├── server.js           API
│   └── electron-kiosk.js   Electron
├── gpio/                   DHT11（選用）
├── scripts/                啟動、Docker、image 安裝
├── systemd/                開機 unit
└── ecosystem.config.cjs    PM2（原生安裝用）
```

## 硬體需求（摘要）

- Raspberry Pi 4/5，4GB+ RAM，32GB+ 儲存
- 1480×320 橫向螢幕（或自行調整 CSS）
- Raspberry Pi OS 64-bit + Wayland（labwc）
- 網路（HKO 天氣、ICS 行事曆）
- 選用：DHT11、Home Assistant（同網段）

## 設定（config.env）

| 變數 | 說明 |
|------|------|
| `DASHBOARD_PORT` | API 埠，預設 8090 |
| `HKO_STATION` | 天文台天氣站 |
| `CALENDAR_URL` | 個人 ICS 行事曆 |
| `HOLIDAYS_ICS_URL` | 公眾假期 ICS |
| `HA_URL` / `HA_TOKEN` | Home Assistant |

## API

`GET /api/health` · `/api/weather` · `/api/calendar` · `/api/dht` · `/api/ha/*`

前端：`http://127.0.0.1:8090/`
