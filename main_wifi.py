from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ============================================================
# Guardian Mesh - Local FastAPI Backend
# Handheld -> POST /message -> SQLite -> WebSocket -> Dashboard
# ============================================================

APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "guardian.db"
STATIC_DIR = APP_DIR / "static"
TEMPLATE_PATH = APP_DIR / "index.html"

app = FastAPI(title="Guardian Mesh Local Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ----------------------------
# Models
# ----------------------------
class MessagePayload(BaseModel):
    device_id: str = Field(default="HANDHELD_01")
    message: str
    priority: str = Field(default="HIGH")
    timestamp: Optional[int] = None
    wifi_rssi: Optional[int] = None
    uptime_ms: Optional[int] = None


class TelemetryPayload(BaseModel):
    device_id: str = Field(default="MAIN_NODE_01")
    temperature_dht: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    mq135_raw: Optional[float] = None
    mq135_filtered: Optional[float] = None
    accel_x: Optional[float] = None
    accel_y: Optional[float] = None
    accel_z: Optional[float] = None
    gyro_x: Optional[float] = None
    gyro_y: Optional[float] = None
    gyro_z: Optional[float] = None
    ir_state: Optional[int] = None
    wifi_rssi: Optional[int] = None
    uptime_ms: Optional[int] = None


# ----------------------------
# WebSocket manager
# ----------------------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: Dict[str, Any]) -> None:
        if not self.active_connections:
            return

        dead_connections: List[WebSocket] = []
        payload = json.dumps(data, ensure_ascii=False)

        for ws in self.active_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_connections.append(ws)

        for ws in dead_connections:
            self.disconnect(ws)


manager = ConnectionManager()

# ----------------------------
# Database helpers
# ----------------------------
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                message TEXT NOT NULL,
                priority TEXT NOT NULL,
                timestamp INTEGER,
                wifi_rssi INTEGER,
                uptime_ms INTEGER,
                received_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                temperature_dht REAL,
                humidity REAL,
                pressure REAL,
                mq135_raw REAL,
                mq135_filtered REAL,
                accel_x REAL,
                accel_y REAL,
                accel_z REAL,
                gyro_x REAL,
                gyro_y REAL,
                gyro_z REAL,
                ir_state INTEGER,
                wifi_rssi INTEGER,
                uptime_ms INTEGER,
                received_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                message TEXT NOT NULL,
                priority TEXT NOT NULL,
                timestamp INTEGER,
                received_at TEXT NOT NULL,
                acknowledged INTEGER DEFAULT 0
            )
            """
        )

        conn.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_insert_message(payload: MessagePayload) -> Dict[str, Any]:
    received_at = now_iso()
    row = {
        "device_id": payload.device_id,
        "message": payload.message,
        "priority": payload.priority,
        "timestamp": payload.timestamp,
        "wifi_rssi": payload.wifi_rssi,
        "uptime_ms": payload.uptime_ms,
        "received_at": received_at,
    }

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO messages (
                device_id, message, priority, timestamp, wifi_rssi, uptime_ms, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["device_id"],
                row["message"],
                row["priority"],
                row["timestamp"],
                row["wifi_rssi"],
                row["uptime_ms"],
                row["received_at"],
            ),
        )

        if payload.priority.upper() in {"HIGH", "CRITICAL"}:
            conn.execute(
                """
                INSERT INTO alerts (
                    device_id, message, priority, timestamp, received_at, acknowledged
                ) VALUES (?, ?, ?, ?, ?, 0)
                """,
                (
                    row["device_id"],
                    row["message"],
                    row["priority"],
                    row["timestamp"],
                    row["received_at"],
                ),
            )

        conn.commit()

    return row


def db_insert_telemetry(payload: TelemetryPayload) -> Dict[str, Any]:
    received_at = now_iso()
    row = {
        "device_id": payload.device_id,
        "temperature_dht": payload.temperature_dht,
        "humidity": payload.humidity,
        "pressure": payload.pressure,
        "mq135_raw": payload.mq135_raw,
        "mq135_filtered": payload.mq135_filtered,
        "accel_x": payload.accel_x,
        "accel_y": payload.accel_y,
        "accel_z": payload.accel_z,
        "gyro_x": payload.gyro_x,
        "gyro_y": payload.gyro_y,
        "gyro_z": payload.gyro_z,
        "ir_state": payload.ir_state,
        "wifi_rssi": payload.wifi_rssi,
        "uptime_ms": payload.uptime_ms,
        "received_at": received_at,
    }

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO telemetry (
                device_id, temperature_dht, humidity, pressure, mq135_raw, mq135_filtered,
                accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, ir_state, wifi_rssi,
                uptime_ms, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["device_id"],
                row["temperature_dht"],
                row["humidity"],
                row["pressure"],
                row["mq135_raw"],
                row["mq135_filtered"],
                row["accel_x"],
                row["accel_y"],
                row["accel_z"],
                row["gyro_x"],
                row["gyro_y"],
                row["gyro_z"],
                row["ir_state"],
                row["wifi_rssi"],
                row["uptime_ms"],
                row["received_at"],
            ),
        )
        conn.commit()

    return row


def fetch_latest_message() -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT device_id, message, priority, timestamp, wifi_rssi, uptime_ms, received_at
            FROM messages
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    return dict(row) if row else None


def fetch_latest_telemetry() -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM telemetry
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    return dict(row) if row else None


def fetch_history(limit: int = 100) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT device_id, message, priority, timestamp, wifi_rssi, uptime_ms, received_at
            FROM messages
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(r) for r in rows]


def fetch_alerts(limit: int = 100) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, device_id, message, priority, timestamp, received_at, acknowledged
            FROM alerts
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(r) for r in rows]


# ----------------------------
# Routes
# ----------------------------
@app.on_event("startup")
def on_startup() -> None:
    init_db()
    print(f"[Guardian] Database ready at: {DB_PATH}")


@app.get("/", response_class=HTMLResponse)
def root() -> HTMLResponse:
    """
    Serve index.html if it exists, otherwise show a minimal status page.
    """
    if TEMPLATE_PATH.exists():
        return HTMLResponse(TEMPLATE_PATH.read_text(encoding="utf-8"))

    return HTMLResponse(
        """
        <html>
        <head><title>Guardian Mesh</title></head>
        <body style="font-family:Arial,sans-serif;background:#0b0b0d;color:#fff;padding:24px;">
            <h1>Guardian Mesh Backend Running</h1>
            <p>Dashboard file not found.</p>
            <p>Use:</p>
            <ul>
                <li>GET /health</li>
                <li>POST /message</li>
                <li>POST /data</li>
                <li>GET /latest</li>
                <li>GET /history</li>
                <li>GET /alerts</li>
                <li>GET /ws</li>
            </ul>
        </body>
        </html>
        """
    )


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"success": True, "status": "ok", "time": now_iso()}


@app.get("/status")
def status() -> Dict[str, Any]:
    return {
        "success": True,
        "backend": "online",
        "messages": len(fetch_history(1000)),
        "alerts": len(fetch_alerts(1000)),
        "telemetry": 1 if fetch_latest_telemetry() else 0,
        "time": now_iso(),
    }


@app.post("/message")
async def receive_message(payload: MessagePayload) -> JSONResponse:
    msg = db_insert_message(payload)
    event = {
        "type": "new_message",
        "device_id": msg["device_id"],
        "message": msg["message"],
        "priority": msg["priority"],
        "timestamp": msg["timestamp"],
        "wifi_rssi": msg["wifi_rssi"],
        "uptime_ms": msg["uptime_ms"],
        "received_at": msg["received_at"],
    }

    print(f"[MESSAGE] {event['device_id']} | {event['priority']} | {event['message']}")

    await manager.broadcast(event)

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Message received",
            "data": event,
        },
    )


@app.post("/data")
async def receive_telemetry(payload: TelemetryPayload) -> JSONResponse:
    row = db_insert_telemetry(payload)
    event = {
        "type": "new_telemetry",
        "data": row,
    }

    print(f"[DATA] {payload.device_id} | telemetry received")

    await manager.broadcast(event)

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Telemetry received",
            "data": row,
        },
    )


@app.post("/panic")
async def panic(payload: MessagePayload) -> JSONResponse:
    # Treat panic like a high-priority message
    payload.priority = "CRITICAL"
    msg = db_insert_message(payload)
    event = {
        "type": "panic",
        "device_id": msg["device_id"],
        "message": msg["message"],
        "priority": msg["priority"],
        "timestamp": msg["timestamp"],
        "wifi_rssi": msg["wifi_rssi"],
        "uptime_ms": msg["uptime_ms"],
        "received_at": msg["received_at"],
    }

    print(f"[PANIC] {event['device_id']} | {event['message']}")

    await manager.broadcast(event)

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Panic received",
            "data": event,
        },
    )


@app.get("/latest")
def latest() -> Dict[str, Any]:
    return {
        "success": True,
        "latest_message": fetch_latest_message(),
        "latest_telemetry": fetch_latest_telemetry(),
    }


@app.get("/history")
def history(limit: int = 100) -> Dict[str, Any]:
    return {
        "success": True,
        "items": fetch_history(limit),
    }


@app.get("/alerts")
def alerts(limit: int = 100) -> Dict[str, Any]:
    return {
        "success": True,
        "items": fetch_alerts(limit),
    }


@app.get("/messages")
def messages(limit: int = 100) -> Dict[str, Any]:
    return {
        "success": True,
        "items": fetch_history(limit),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    print(f"[WS] Client connected. Total: {len(manager.active_connections)}")
    try:
        while True:
            # Keep the connection alive and allow optional client pings
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"[WS] Client disconnected. Total: {len(manager.active_connections)}")
    except Exception as e:
        manager.disconnect(websocket)
        print(f"[WS] Error: {e}")


# ----------------------------
# Main
# ----------------------------
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )