import time
import json
from fastapi import APIRouter, HTTPException, Query
from database.database import get_db, run_query
from api.websocket import manager
from config.config import logger

router = APIRouter()

# Structured Response Wrapper
def success_response(data, message="Success"):
    return {
        "success": True,
        "message": message,
        "timestamp": int(time.time()),
        "data": data
    }

def error_response(error_msg, code=500):
    return {
        "success": False,
        "error": error_msg,
        "code": code
    }

ground_station_online = True

@router.get("/config.json")
async def get_config_json():
    from config.config import get_config
    return success_response(get_config(), "Config loaded")

@router.get("/history/json")
async def get_history_json():
    try:
        rows = run_query("SELECT * FROM sensor_data ORDER BY timestamp ASC")
        return success_response(rows, "History loaded")
    except Exception as e:
        return error_response(str(e))

@router.post("/data")
async def receive_data(payload: dict):
    global ground_station_online
    
    node_id = payload.get("node_id", "UNKNOWN")
    ts = payload.get("timestamp", int(time.time()))
    temp = payload.get("temperature", 0.0)
    hum = payload.get("humidity", 0.0)
    pres = payload.get("pressure", 0.0)
    aqi = payload.get("aqi", 0.0)
    rain = payload.get("rainfall", 0.0)
    wind = payload.get("wind_speed", 0.0)
    battery = payload.get("battery", 100)
    rssi = payload.get("rssi", -50)
    relay_path = payload.get("relay_path", "GROUND")
    
    packet_id = payload.get("packet_id", f"PKT-{ts}-{node_id}")
    hop_count = len(relay_path.split("->")) if relay_path else 1
    tx_time = round(0.08 * hop_count + (abs(rssi) / 1000.0), 3)

    conn = get_db()
    cursor = conn.cursor()

    try:
        status = "DELIVERED" if ground_station_online else "PENDING"
        
        cursor.execute("""
        INSERT OR IGNORE INTO packets (packet_id, node_id, payload, relay_path, hop_count, transmission_time, rssi, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (packet_id, node_id, json.dumps({
            "temp": temp, "hum": hum, "pres": pres, "aqi": aqi, "rain": rain, "wind": wind
        }), relay_path, hop_count, tx_time, rssi, status, ts))

        if not ground_station_online:
            conn.commit()
            cursor.execute("""
            INSERT INTO events (timestamp, event_type, message, metadata)
            VALUES (?, 'OFFLINE_QUEUE', ?, ?)
            """, (ts, f"Ground station offline. Caching packet {packet_id} from {node_id}.", json.dumps({"packet_id": packet_id})))
            conn.commit()
            
            pending_count = cursor.execute("SELECT COUNT(*) FROM packets WHERE status = 'PENDING'").fetchone()[0]
            await manager.broadcast({
                "type": "queue_update",
                "pending_count": pending_count,
                "latest_pending_packet": {
                    "packet_id": packet_id, "node_id": node_id, "hop_count": hop_count,
                    "transmission_time": tx_time, "rssi": rssi, "status": "PENDING"
                }
            })
            return success_response({"status": "queued"}, "Ground Station offline. Packet queued.")

        cursor.execute("""
        INSERT INTO sensor_data (node_id, timestamp, temperature, humidity, pressure, aqi, rainfall, wind_speed, battery, rssi, relay_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (node_id, ts, temp, hum, pres, aqi, rain, wind, battery, rssi, relay_path))

        health_status = 'Excellent' if battery > 80 else 'Good' if battery > 40 else 'Warning' if battery > 0 else 'Offline'
        cursor.execute("""
        INSERT INTO nodes (node_id, last_seen, battery, rssi, relay_path, firmware, health_score, health_status)
        VALUES (?, ?, ?, ?, ?, 'v1.2.4', ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
          last_seen=excluded.last_seen,
          battery=excluded.battery,
          rssi=excluded.rssi,
          relay_path=excluded.relay_path,
          health_score=excluded.health_score,
          health_status=excluded.health_status
        """, (node_id, ts, battery, rssi, relay_path, battery, health_status))

        cursor.execute("""
        INSERT INTO events (timestamp, event_type, message, metadata)
        VALUES (?, 'TELEMETRY', ?, ?)
        """, (ts, f"Telemetry received from node {node_id}.", json.dumps({"node_id": node_id})))
        conn.commit()

        await manager.broadcast({
            "type": "sensor_update",
            "data": {
                "node_id": node_id, "timestamp": ts, "temperature": temp, "humidity": hum, "pressure": pres,
                "aqi": aqi, "rainfall": rain, "wind_speed": wind, "battery": battery, "rssi": rssi, "relay_path": relay_path
            }
        })
        
        await manager.broadcast({
            "type": "packet_update",
            "packet": {
                "packet_id": packet_id, "node_id": node_id, "hop_count": hop_count,
                "transmission_time": tx_time, "rssi": rssi, "status": "DELIVERED",
                "relay_path": relay_path, "timestamp": ts
            }
        })

    except Exception as e:
        logger.error(f"Error in receive_data: {e}")
        return error_response(str(e))
    finally:
        conn.close()

    return success_response({"status": "delivered"}, "Telemetry written and broadcasted.")

@router.post("/panic")
async def trigger_panic(payload: dict):
    node_id = payload.get("node_id", "UNKNOWN")
    message_type = payload.get("message_type", "🆘 NEED ASSISTANCE")
    ts = payload.get("timestamp", int(time.time()))
    relay_path = payload.get("relay_path", "GROUND")

    try:
        alert_id = run_query("""
        INSERT INTO panic_alerts (node_id, message_type, timestamp, relay_path, status)
        VALUES (?, ?, ?, ?, 'INCOMING')
        """, (node_id, message_type, ts, relay_path), commit=True)
        
        run_query("""
        INSERT INTO events (timestamp, event_type, message, metadata)
        VALUES (?, 'PANIC', ?, ?)
        """, (ts, f"CRITICAL: Emergency Alert '{message_type}' issued by {node_id}!", json.dumps({"alert_id": alert_id, "node_id": node_id})), commit=True)

        alert_data = {
            "id": alert_id, "node_id": node_id, "message_type": message_type,
            "timestamp": ts, "relay_path": relay_path, "status": "INCOMING"
        }

        await manager.broadcast({"type": "panic", "data": alert_data})
        logger.warning(f"Panic triggered: {node_id} - {message_type}")
        return success_response(alert_data, "Panic alert triggered")
    except Exception as e:
        return error_response(str(e))

@router.get("/latest")
async def get_latest():
    try:
        rows = run_query("SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 1")
        if not rows:
            return error_response("No telemetry found", 404)
        return success_response(rows[0], "Latest telemetry fetched")
    except Exception as e:
        return error_response(str(e))

@router.get("/history")
async def get_history(range_param: str = Query("24h", alias="range")):
    now_ts = int(time.time())
    ranges = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800, "30d": 2592000}
    cutoff = now_ts - ranges.get(range_param, 86400)
    try:
        rows = run_query("SELECT * FROM sensor_data WHERE timestamp >= ? ORDER BY timestamp ASC", (cutoff,))
        return success_response(rows, "History fetched")
    except Exception as e:
        return error_response(str(e))

@router.get("/nodes")
async def get_nodes():
    try:
        nodes = run_query("SELECT * FROM nodes")
        configs = run_query("SELECT * FROM node_config")
        config_map = {c["node_id"]: c for c in configs}
        for n in nodes:
            n["config"] = config_map.get(n["node_id"], {})
        return success_response(nodes, "Nodes fetched")
    except Exception as e:
        return error_response(str(e))

@router.get("/alerts")
async def get_alerts():
    try:
        rows = run_query("SELECT * FROM panic_alerts ORDER BY timestamp DESC")
        return success_response(rows, "Alerts fetched")
    except Exception as e:
        return error_response(str(e))

@router.post("/simulation/network-toggle")
async def toggle_network():
    global ground_station_online
    ground_station_online = not ground_station_online
    now_ts = int(time.time())
    try:
        run_query("""
        INSERT INTO events (timestamp, event_type, message, metadata)
        VALUES (?, 'SYSTEM', ?, ?)
        """, (now_ts, f"Ground Station link set to {'ONLINE' if ground_station_online else 'OFFLINE'}.", json.dumps({"online": ground_station_online})), commit=True)
        
        await manager.broadcast({
            "type": "network_status_toggle",
            "online": ground_station_online
        })
        return success_response({"online": ground_station_online}, "Network toggled")
    except Exception as e:
        return error_response(str(e))

@router.get("/events")
async def get_events():
    try:
        rows = run_query("SELECT * FROM events ORDER BY timestamp DESC LIMIT 50")
        return success_response(rows, "Events fetched")
    except Exception as e:
        return error_response(str(e))

@router.get("/packets")
async def get_packets():
    try:
        rows = run_query("SELECT * FROM packets ORDER BY timestamp DESC LIMIT 50")
        return success_response(rows, "Packets fetched")
    except Exception as e:
        return error_response(str(e))

@router.post("/alerts/{alert_id}/ack")
async def ack_alert(alert_id: int):
    now_ts = int(time.time())
    try:
        run_query("UPDATE panic_alerts SET status='ACKNOWLEDGED', acknowledged_at=? WHERE id=?", (now_ts, alert_id), commit=True)
        await manager.broadcast({"type": "alert_state_change", "alert_id": alert_id, "status": "ACKNOWLEDGED"})
        return success_response({"alert_id": alert_id}, "Alert acknowledged")
    except Exception as e:
        return error_response(str(e))

@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int):
    now_ts = int(time.time())
    try:
        run_query("UPDATE panic_alerts SET status='RESOLVED', resolved_at=? WHERE id=?", (now_ts, alert_id), commit=True)
        await manager.broadcast({"type": "alert_state_change", "alert_id": alert_id, "status": "RESOLVED"})
        return success_response({"alert_id": alert_id}, "Alert resolved")
    except Exception as e:
        return error_response(str(e))

@router.post("/simulation/fire")
async def simulate_fire():
    import random
    now_ts = int(time.time())
    node_id = "NODE_A"
    fire_data = {
        "node_id": node_id, "timestamp": now_ts,
        "temperature": 54.2 + random.uniform(-2, 4),
        "humidity": 18.5, "pressure": 1007.3, "aqi": 285.0,
        "rainfall": 0.0, "wind_speed": 34.0, "battery": 72, "rssi": -65,
        "relay_path": "NODE_B->GROUND"
    }
    try:
        run_query("""
        INSERT INTO sensor_data (node_id, timestamp, temperature, humidity, pressure, aqi, rainfall, wind_speed, battery, rssi, relay_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (node_id, now_ts, fire_data["temperature"], fire_data["humidity"], fire_data["pressure"],
              fire_data["aqi"], fire_data["rainfall"], fire_data["wind_speed"], fire_data["battery"],
              fire_data["rssi"], fire_data["relay_path"]), commit=True)

        await manager.broadcast({"type": "sensor_update", "data": fire_data})

        alert_id = run_query("""
        INSERT INTO panic_alerts (node_id, message_type, timestamp, relay_path, status)
        VALUES (?, '🔥 WILDFIRE SIGNATURE', ?, ?, 'INCOMING')
        """, (node_id, now_ts, fire_data["relay_path"]), commit=True)

        await manager.broadcast({"type": "panic", "data": {
            "id": alert_id, "node_id": node_id,
            "message_type": "🔥 WILDFIRE SIGNATURE",
            "timestamp": now_ts, "relay_path": fire_data["relay_path"], "status": "INCOMING"
        }})
        logger.warning("Fire simulation triggered via dashboard")
        return success_response(fire_data, "Fire simulation triggered")
    except Exception as e:
        return error_response(str(e))


# ── AI Analysis Endpoint ──────────────────────────────────────────

@router.post("/ai/analyze")
async def ai_analyze(payload: dict):
    """Run AI incident analysis using Gemini → Claude → mock fallback."""
    from services.ai_service import generate_incident_report
    scenario  = payload.get("scenario", "").strip()
    if not scenario:
        return error_response("scenario field is required", 400)

    # Attach latest telemetry context
    try:
        rows = run_query("SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 1")
        telemetry = rows[0] if rows else {}
    except Exception:
        telemetry = {}

    report = generate_incident_report(scenario, telemetry)
    await manager.broadcast({"type": "ai_report", "data": report})
    return success_response(report, "AI analysis complete")


@router.get("/ai/reports")
async def get_ai_reports():
    """Return all stored AI reports."""
    try:
        rows = run_query("SELECT * FROM ai_reports ORDER BY timestamp DESC LIMIT 20")
        return success_response(rows, "AI reports fetched")
    except Exception as e:
        return error_response(str(e))


# ── Weather & AQI Endpoints ───────────────────────────────────────

@router.get("/weather")
async def get_weather(lat: float = 12.9716, lon: float = 77.5946):
    """Live weather from OpenWeatherMap or mock fallback."""
    from services.weather_service import get_weather as _gw
    data = _gw(lat, lon)
    return success_response(data, "Weather fetched")


@router.get("/aqi")
async def get_aqi(lat: float = 12.9716, lon: float = 77.5946):
    """Live AQI from AQICN or mock fallback."""
    from services.weather_service import get_aqi as _ga
    data = _ga(lat, lon)
    return success_response(data, "AQI fetched")


@router.get("/fire-hotspots")
async def fire_hotspots(lat: float = 12.9716, lon: float = 77.5946):
    """NASA FIRMS fire hotspots near coordinates."""
    from services.weather_service import get_fire_hotspots
    data = get_fire_hotspots(lat, lon)
    return success_response(data, "Fire hotspots fetched")


# ── Demo Mode ─────────────────────────────────────────────────────

@router.post("/demo/run")
async def run_demo_sequence():
    """
    Triggers a full guided demo sequence:
    sensor update → anomaly escalation → fire alert → AI report
    """
    import asyncio, random
    now = int(time.time())

    async def _broadcast_step(delay, msg):
        await asyncio.sleep(delay)
        await manager.broadcast(msg)

    # Step 1: normal telemetry
    await manager.broadcast({"type": "sensor_update", "data": {
        "node_id": "NODE_A", "timestamp": now, "temperature": 29.2,
        "humidity": 64.0, "pressure": 1012.0, "aqi": 48.0,
        "rainfall": 0.0, "wind_speed": 13.0, "battery": 87, "rssi": -60,
        "relay_path": "NODE_B->GROUND"
    }})

    # Step 2: temperature rising
    await asyncio.sleep(1.5)
    await manager.broadcast({"type": "sensor_update", "data": {
        "node_id": "NODE_A", "timestamp": now + 30, "temperature": 38.8,
        "humidity": 38.0, "pressure": 1009.0, "aqi": 128.0,
        "rainfall": 0.0, "wind_speed": 24.0, "battery": 86, "rssi": -63,
        "relay_path": "NODE_B->GROUND"
    }})

    # Step 3: fire signature
    await asyncio.sleep(1.5)
    fire_temp = 54.2 + random.uniform(-1, 3)
    run_query(
        "INSERT INTO sensor_data (node_id,timestamp,temperature,humidity,pressure,aqi,rainfall,wind_speed,battery,rssi,relay_path) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ("NODE_A", now + 60, fire_temp, 18.0, 1007.0, 285.0, 0.0, 34.0, 85, -65, "NODE_B->GROUND"),
        commit=True,
    )
    await manager.broadcast({"type": "sensor_update", "data": {
        "node_id": "NODE_A", "timestamp": now + 60, "temperature": fire_temp,
        "humidity": 18.0, "pressure": 1007.0, "aqi": 285.0,
        "rainfall": 0.0, "wind_speed": 34.0, "battery": 85, "rssi": -65,
        "relay_path": "NODE_B->GROUND"
    }})

    # Step 4: panic alert
    await asyncio.sleep(0.8)
    alert_id = run_query(
        "INSERT INTO panic_alerts (node_id,message_type,timestamp,relay_path,status) VALUES (?,?,?,?,'INCOMING')",
        ("NODE_A", "🔥 WILDFIRE SIGNATURE DETECTED", now + 62, "NODE_B->GROUND"),
        commit=True,
    )
    await manager.broadcast({"type": "panic", "data": {
        "id": alert_id, "node_id": "NODE_A",
        "message_type": "🔥 WILDFIRE SIGNATURE DETECTED",
        "timestamp": now + 62, "relay_path": "NODE_B->GROUND", "status": "INCOMING"
    }})

    # Step 5: AI report
    await asyncio.sleep(1.0)
    from services.ai_service import generate_incident_report
    report = generate_incident_report(
        "Wildfire detected — temperature 54°C, AQI 285, humidity 18%, NE wind 34 km/h at NODE_A",
        {"temperature": fire_temp, "humidity": 18.0, "pressure": 1007.0, "aqi": 285.0, "wind_speed": 34.0}
    )
    await manager.broadcast({"type": "ai_report", "data": report})

    logger.info("Demo sequence completed")
    return success_response({"steps_completed": 5}, "Demo sequence complete")


# ── Handheld Message Endpoints ─────────────────────────────────────

@router.post("/message")
async def receive_handheld_message(payload: dict):
    device_id = payload.get("device_id", "UNKNOWN_HANDHELD")
    message = payload.get("message", "")
    priority = payload.get("priority", "NORMAL").upper()
    timestamp_val = payload.get("timestamp")
    
    # Resolve timestamp
    if not timestamp_val or timestamp_val == "auto-generated":
        ts = int(time.time())
    else:
        try:
            ts = int(timestamp_val)
        except (ValueError, TypeError):
            ts = int(time.time())
            
    wifi_rssi = payload.get("wifi_rssi", -50)
    uptime_ms = payload.get("uptime_ms", 0)
    status = payload.get("status", "sent")
    
    try:
        # Store in handheld_messages
        msg_id = run_query("""
        INSERT INTO handheld_messages (device_id, message, priority, timestamp, wifi_rssi, uptime_ms, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (device_id, message, priority, ts, wifi_rssi, uptime_ms, status), commit=True)
        
        # Add to events table
        event_msg = f"[{device_id}] Handheld Event: {message} ({priority})"
        run_query("""
        INSERT INTO events (timestamp, event_type, message, metadata)
        VALUES (?, 'HANDHELD', ?, ?)
        """, (ts, event_msg, json.dumps(payload)), commit=True)
        
        # If priority is HIGH or CRITICAL, add to panic_alerts table
        if priority in ("HIGH", "CRITICAL"):
            alert_id = run_query("""
            INSERT INTO panic_alerts (node_id, message_type, timestamp, relay_path, status)
            VALUES (?, ?, ?, 'DIRECT', 'INCOMING')
            """, (device_id, f"{priority} Handheld: {message}", ts), commit=True)
            
        # Update nodes table to show handheld as online
        run_query("""
        INSERT INTO nodes (node_id, last_seen, battery, rssi, relay_path, firmware, health_score, health_status)
        VALUES (?, ?, 100, ?, 'DIRECT', 'v1.2.4', 100, 'Excellent')
        ON CONFLICT(node_id) DO UPDATE SET
          last_seen=excluded.last_seen,
          rssi=excluded.rssi,
          health_status='Excellent'
        """, (device_id, ts, wifi_rssi), commit=True)
        
        # Broadcast message over WebSocket
        websocket_payload = {
            "type": "handheld_message",
            "data": {
                "id": msg_id,
                "device_id": device_id,
                "message": message,
                "priority": priority,
                "timestamp": ts,
                "wifi_rssi": wifi_rssi,
                "uptime_ms": uptime_ms,
                "status": status
            }
        }
        await manager.broadcast(websocket_payload)
        
        # If HIGH or CRITICAL, also broadcast panic event to update alerts count/overlay immediately
        if priority in ("HIGH", "CRITICAL"):
            await manager.broadcast({
                "type": "panic",
                "data": {
                    "id": alert_id if 'alert_id' in locals() else msg_id,
                    "node_id": device_id,
                    "message_type": f"{priority} Handheld: {message}",
                    "timestamp": ts,
                    "relay_path": "DIRECT",
                    "status": "INCOMING"
                }
            })
            
        return {
            "success": True,
            "message": "Event received",
            "data": {
                "device_id": device_id,
                "message": message,
                "priority": priority
            }
        }
    except Exception as e:
        logger.error(f"Error in receive_handheld_message: {e}")
        return error_response(str(e))


@router.get("/latest_message")
async def get_latest_message():
    try:
        rows = run_query("SELECT * FROM handheld_messages ORDER BY id DESC LIMIT 1")
        if not rows:
            return error_response("No handheld messages found", 404)
        return success_response(rows[0], "Latest handheld message fetched")
    except Exception as e:
        return error_response(str(e))
