"""
Guardian Mesh — Backend API Tests
"""
import pytest
import json
import sqlite3
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────

def assert_success(response, status_code=200):
    assert response.status_code == status_code, f"Expected {status_code}, got {response.status_code}: {response.text}"
    data = response.json()
    assert data.get("success") is True, f"Expected success=True, got: {data}"
    return data


def assert_error(response):
    data = response.json()
    assert data.get("success") is False
    assert "error" in data or "code" in data
    return data


# ── Homepage ──────────────────────────────────────────────────────

class TestHomepage:
    def test_index_returns_html(self):
        r = client.get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]
        assert "Guardian Mesh" in r.text

    def test_static_css_served(self):
        r = client.get("/static/css/styles.css")
        assert r.status_code == 200

    def test_static_js_served(self):
        r = client.get("/static/js/app.js")
        assert r.status_code == 200


# ── Config ────────────────────────────────────────────────────────

class TestConfig:
    def test_config_json_endpoint(self):
        r = client.get("/config.json")
        data = assert_success(r)
        assert "data" in data


# ── Latest Telemetry ──────────────────────────────────────────────

class TestLatestTelemetry:
    def test_latest_returns_data(self):
        r = client.get("/latest")
        assert r.status_code == 200
        data = r.json()
        # Either success with data or error with 404 if DB empty
        assert "success" in data

    def test_latest_structure(self):
        r = client.get("/latest")
        data = r.json()
        if data.get("success"):
            entry = data["data"]
            for field in ["node_id", "temperature", "humidity", "pressure", "aqi"]:
                assert field in entry, f"Missing field: {field}"


# ── Data Ingestion ────────────────────────────────────────────────

class TestDataIngestion:
    def test_post_valid_telemetry(self):
        payload = {
            "node_id": "TEST_NODE",
            "timestamp": int(time.time()),
            "temperature": 28.5,
            "humidity": 65.0,
            "pressure": 1012.0,
            "aqi": 45.0,
            "rainfall": 0.1,
            "wind_speed": 12.0,
            "battery": 85,
            "rssi": -62,
            "relay_path": "GROUND"
        }
        r = client.post("/data", json=payload)
        data = assert_success(r)
        assert data["data"]["status"] in ("delivered", "queued")

    def test_post_missing_optional_fields(self):
        payload = {"node_id": "MIN_NODE"}
        r = client.post("/data", json=payload)
        assert r.status_code == 200
        assert r.json().get("success") is not None

    def test_post_telemetry_appears_in_history(self):
        ts = int(time.time())
        client.post("/data", json={
            "node_id": "HIST_TEST_NODE",
            "timestamp": ts,
            "temperature": 30.0,
            "humidity": 70.0,
            "pressure": 1010.0,
            "aqi": 55.0,
            "rainfall": 0.0,
            "wind_speed": 8.0,
            "battery": 90,
            "rssi": -58,
            "relay_path": "GROUND"
        })
        r = client.get("/history?range=1h")
        data = assert_success(r)
        node_ids = [d["node_id"] for d in data["data"]]
        assert "HIST_TEST_NODE" in node_ids


# ── History ───────────────────────────────────────────────────────

class TestHistory:
    def test_history_1h(self):
        r = client.get("/history?range=1h")
        data = assert_success(r)
        assert isinstance(data["data"], list)

    def test_history_24h(self):
        r = client.get("/history?range=24h")
        data = assert_success(r)
        assert isinstance(data["data"], list)

    def test_history_json_endpoint(self):
        r = client.get("/history/json")
        data = assert_success(r)
        assert isinstance(data["data"], list)

    def test_history_contains_timestamps(self):
        r = client.get("/history?range=24h")
        data = assert_success(r)
        records = data["data"]
        if records:
            assert "timestamp" in records[0]
            assert "node_id" in records[0]


# ── Nodes ─────────────────────────────────────────────────────────

class TestNodes:
    def test_get_nodes(self):
        r = client.get("/nodes")
        data = assert_success(r)
        assert isinstance(data["data"], list)

    def test_node_has_required_fields(self):
        r = client.get("/nodes")
        data = assert_success(r)
        nodes = data["data"]
        if nodes:
            n = nodes[0]
            for field in ["node_id", "battery", "rssi"]:
                assert field in n, f"Missing node field: {field}"

    def test_nodes_include_config(self):
        r = client.get("/nodes")
        data = assert_success(r)
        nodes = data["data"]
        if nodes:
            assert "config" in nodes[0]


# ── Panic Alerts ──────────────────────────────────────────────────

class TestPanicAlerts:
    def test_trigger_panic(self):
        payload = {
            "node_id": "TEST_NODE",
            "message_type": "🆘 TEST ALERT",
            "timestamp": int(time.time()),
            "relay_path": "GROUND"
        }
        r = client.post("/panic", json=payload)
        data = assert_success(r)
        assert data["data"]["node_id"] == "TEST_NODE"
        assert "id" in data["data"]

    def test_alerts_appear_in_list(self):
        ts = int(time.time())
        client.post("/panic", json={
            "node_id": "ALERT_TEST_NODE",
            "message_type": "🧪 UNIT TEST ALERT",
            "timestamp": ts,
            "relay_path": "GROUND"
        })
        r = client.get("/alerts")
        data = assert_success(r)
        msgs = [a["message_type"] for a in data["data"]]
        assert "🧪 UNIT TEST ALERT" in msgs

    def test_ack_alert(self):
        r = client.post("/panic", json={"node_id": "ACK_TEST", "message_type": "🆘 ACK TEST", "timestamp": int(time.time())})
        alert_id = r.json()["data"]["id"]
        r2 = client.post(f"/alerts/{alert_id}/ack")
        data = assert_success(r2)
        assert data["data"]["alert_id"] == alert_id

    def test_resolve_alert(self):
        r = client.post("/panic", json={"node_id": "RESOLVE_TEST", "message_type": "🆘 RESOLVE TEST", "timestamp": int(time.time())})
        alert_id = r.json()["data"]["id"]
        r2 = client.post(f"/alerts/{alert_id}/resolve")
        data = assert_success(r2)
        assert data["data"]["alert_id"] == alert_id


# ── Packets ───────────────────────────────────────────────────────

class TestPackets:
    def test_get_packets(self):
        r = client.get("/packets")
        data = assert_success(r)
        assert isinstance(data["data"], list)


# ── Events ────────────────────────────────────────────────────────

class TestEvents:
    def test_get_events(self):
        r = client.get("/events")
        data = assert_success(r)
        assert isinstance(data["data"], list)

    def test_events_have_structure(self):
        r = client.get("/events")
        data = assert_success(r)
        events = data["data"]
        if events:
            assert "timestamp" in events[0]
            assert "event_type" in events[0]
            assert "message" in events[0]


# ── Simulations ───────────────────────────────────────────────────

class TestSimulations:
    def test_fire_simulation(self):
        r = client.post("/simulation/fire")
        data = assert_success(r)
        fire = data["data"]
        assert fire["node_id"] == "NODE_A"
        assert fire["temperature"] > 40

    def test_network_toggle(self):
        r = client.post("/simulation/network-toggle")
        data = assert_success(r)
        assert "online" in data["data"]
        # Toggle back
        client.post("/simulation/network-toggle")


# ── Response Envelope ─────────────────────────────────────────────

class TestResponseEnvelope:
    """Verify all endpoints return the structured success/error envelope."""

    def test_envelope_has_success_field(self):
        for ep in ["/latest", "/nodes", "/alerts", "/packets", "/events"]:
            r = client.get(ep)
            data = r.json()
            assert "success" in data, f"Endpoint {ep} missing 'success' field"

    def test_envelope_has_timestamp(self):
        r = client.get("/nodes")
        data = r.json()
        assert "timestamp" in data

    def test_envelope_has_message(self):
        r = client.get("/nodes")
        data = r.json()
        assert "message" in data


# ── Database Integrity ────────────────────────────────────────────

class TestDatabaseIntegrity:
    def test_db_tables_exist(self):
        from database.database import get_db
        conn = get_db()
        cursor = conn.cursor()
        tables = {r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        required = {"sensor_data", "panic_alerts", "nodes", "node_config", "events", "packets", "ai_reports"}
        missing = required - tables
        assert not missing, f"Missing tables: {missing}"
        conn.close()

    def test_sensor_data_columns(self):
        from database.database import get_db
        conn = get_db()
        cursor = conn.cursor()
        cols = {r[1] for r in cursor.execute("PRAGMA table_info(sensor_data)").fetchall()}
        required = {"id", "node_id", "timestamp", "temperature", "humidity", "pressure", "aqi", "rainfall", "wind_speed", "battery", "rssi"}
        missing = required - cols
        assert not missing, f"Missing columns: {missing}"
        conn.close()

    def test_seeded_data_present(self):
        from database.database import run_query
        rows = run_query("SELECT COUNT(*) as cnt FROM sensor_data")
        assert rows[0]["cnt"] > 0, "Database appears empty — seeding may have failed"

    def test_nodes_seeded(self):
        from database.database import run_query
        rows = run_query("SELECT COUNT(*) as cnt FROM nodes")
        assert rows[0]["cnt"] > 0, "No nodes found in DB"


# ── CSV Export Simulation ─────────────────────────────────────────

class TestCSVExport:
    def test_history_json_exportable(self):
        r = client.get("/history/json")
        data = r.json()
        assert data.get("success") is True
        rows = data["data"]
        assert isinstance(rows, list)
        # Verify fields needed for CSV export
        if rows:
            for field in ["node_id", "timestamp", "temperature", "humidity"]:
                assert field in rows[0], f"Field {field} missing from export data"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
