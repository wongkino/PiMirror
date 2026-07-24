# DHT11 感測器（選用）

Dashboard 透過 `/api/dht` 呼叫 `dht11-json.py` 讀取溫溼度。

## 接線

| 實體腳位 | 連接 |
|---------|------|
| 1 | 3.3V |
| 9 | GND |
| 11 | GPIO17（資料） |

## 安裝

```bash
cd gpio
python3 -m venv .venv
.venv/bin/pip install adafruit-circuitpython-dht adafruit-blinka
```

## 手動測試

```bash
.venv/bin/python dht11-json.py
# {"ok": true, "temperature": 26.0, "humidity": 65.0}
```

感測器未接或讀取失敗時，dashboard UI 仍可正常運作。
