# PiMirror

Raspberry Pi 智慧鏡面儀表板（基於 MagicMirror² 核心 + 自訂 HTML dashboard kiosk）。

## 模式（`config/config.env` → `MM_MODE`）

| 模式 | 說明 |
|------|------|
| **`local` / `realtime`** | 本機完整 MagicMirror（server + Electron + `node_helper`），GPIO（DHT11 / laser）可用 |
| **`client`** | 僅 Electron UI；設定與 helper 來自遠端伺服器（`MM_SERVER_*`） |

本機預設：**`local`**。開機預設：**PiMirrorKiosk**（dashboard server + Electron 全螢幕）。

## 設定

```bash
cp config/config.env.sample config/config.env
# 編輯 secrets / 行事曆 / HA / UniFi 等
```

## 啟動（PM2）

```bash
pm2 start dashboard/ecosystem.config.cjs
pm2 save
```

手動啟動 kiosk：

```bash
./dashboard/start-kiosk.sh
```

## GPIO

- DHT11 腳本：`GPIO/`
- 室內溫溼度模組：`modules/MMM-DHT11`（感測器不存在時自動隱藏）

## 遠端

- `origin`：`wongkino/PiMirror`
- `upstream`：`MagicMirrorOrg/MagicMirror`（僅參考，不 push）
