# Guardian Mesh — API Documentation

All endpoints return a structured JSON envelope:

```json
// Success
{ "success": true, "message": "...", "timestamp": 1234567890, "data": {...} }

// Error
{ "success": false, "error": "...", "code": 500 }
```

---

## Endpoints

### `GET /`
Returns the main dashboard HTML page.

---

### `GET /latest`
Returns the most recent sensor reading from the database.

**Response `data`:**
```json
{
  "node_id": "NODE_A",
  "timestamp": 1700000000,
  "temperature": 28.5,
  "humidity": 65.0,
  "pressure": 1012.0,
  "aqi": 55.0,
  "rainfall": 0.1,
  "wind_speed": 14.0,
  "battery": 85,
  "rssi": -62,
  "relay_path": "NODE_B->GROUND"
}
```

---

### `POST /data`
Ingest telemetry from a sensor node.

**Request body** (all fields optional except `node_id`):
```json
{
  "node_id": "NODE_A",
  "timestamp": 1700000000,
  "temperature": 28.5,
  "humidity": 65.0,
  "pressure": 1012.0,
  "aqi": 55.0,
  "rainfall": 0.1,
  "wind_speed": 14.0,
  "battery": 85,
  "rssi": -62,
  "relay_path": "NODE_B->GROUND",
  "packet_id": "PKT-1700000000-NODE_A"
}
```

**Behavior:**
- If ground station is **online**: writes to DB, broadcasts via WebSocket
- If ground station is **offline**: caches packet with `PENDING` status

---

### `GET /history?range=24h`
Returns historical sensor readings.

**Query params:**
- `range`: `1h` | `6h` | `24h` | `7d` | `30d`

---

### `GET /history/json`
Returns all sensor data as JSON (for full export).

---

### `GET /nodes`
Returns all registered nodes with their config and health status.

---

### `GET /alerts`
Returns all panic alerts.

---

### `POST /panic`
Trigger an emergency alert from a node.

**Request:**
```json
{
  "node_id": "NODE_A",
  "message_type": "🔥 WILDFIRE DETECTED",
  "timestamp": 1700000000,
  "relay_path": "NODE_B->GROUND"
}
```

---

### `POST /alerts/{id}/ack`
Acknowledge an alert.

### `POST /alerts/{id}/resolve`
Mark an alert as resolved.

---

### `GET /packets`
Returns last 50 transmitted packets.

---

### `GET /events`
Returns last 50 system events (logs).

---

### `GET /config.json`
Returns current configuration (without secrets).

---

### `POST /simulation/network-toggle`
Toggles the ground station online/offline state.

---

### `POST /simulation/fire`
Triggers a wildfire sensor simulation on NODE_A. Broadcasts live via WebSocket.

---

## WebSocket

**Endpoint:** `ws://localhost:8080/ws`

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `sensor_update` | Server→Client | New telemetry reading |
| `panic` | Server→Client | Emergency alert |
| `packet_update` | Server→Client | New mesh packet |
| `network_status_toggle` | Server→Client | Ground station online/offline |
| `queue_update` | Server→Client | Pending packet count |
| `alert_state_change` | Server→Client | Alert acknowledged or resolved |

---

## Required API Keys

| Key | Purpose | Where to configure |
|-----|---------|-------------------|
| `anthropic_api_key` | Claude AI incident reports | `config/default_config.json` or `ANTHROPIC_API_KEY` env var |
| `openweather_api_key` | Live weather overlay | `config/default_config.json` |
| `aqicn_api_key` | Air quality data | `config/default_config.json` |

**For GitHub CI:** add as repository secrets named `ANTHROPIC_API_KEY`, `OPENWEATHER_API_KEY`, `AQICN_API_KEY`.
