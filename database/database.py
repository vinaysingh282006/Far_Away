import sqlite3
import os
from config.config import logger

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "guardian.db")

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT,
      timestamp INTEGER,
      temperature REAL,
      humidity REAL,
      pressure REAL,
      aqi REAL,
      rainfall REAL,
      wind_speed REAL,
      battery INTEGER,
      rssi INTEGER,
      relay_path TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS panic_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT,
      message_type TEXT,
      timestamp INTEGER,
      relay_path TEXT,
      status TEXT DEFAULT 'INCOMING',
      acknowledged_at INTEGER,
      resolved_at INTEGER
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS nodes (
      node_id TEXT PRIMARY KEY,
      last_seen INTEGER,
      battery INTEGER,
      rssi INTEGER,
      relay_path TEXT,
      firmware TEXT,
      health_score INTEGER DEFAULT 100,
      health_status TEXT DEFAULT 'Excellent'
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS node_config (
      node_id TEXT PRIMARY KEY,
      custom_name TEXT,
      sampling_rate INTEGER,
      tx_interval INTEGER,
      enabled_sensors TEXT,
      sleep_mode INTEGER DEFAULT 0
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER,
      event_type TEXT,
      message TEXT,
      metadata TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS packets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id TEXT UNIQUE,
      node_id TEXT,
      payload TEXT,
      relay_path TEXT,
      hop_count INTEGER,
      transmission_time REAL,
      rssi INTEGER,
      status TEXT,
      timestamp INTEGER
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident TEXT,
      recommendation TEXT,
      confidence REAL,
      timestamp INTEGER,
      node_id TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS handheld_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      message TEXT,
      priority TEXT,
      timestamp INTEGER,
      wifi_rssi INTEGER,
      uptime_ms INTEGER,
      status TEXT
    )
    """)

    # Check migrations/existing table updates
    try:
        cursor.execute("PRAGMA table_info(nodes)")
        cols = [r[1] for r in cursor.fetchall()]
        if "health_score" not in cols:
            cursor.execute("ALTER TABLE nodes ADD COLUMN health_score INTEGER DEFAULT 100")
        if "health_status" not in cols:
            cursor.execute("ALTER TABLE nodes ADD COLUMN health_status TEXT DEFAULT 'Excellent'")
    except Exception as em:
        logger.warning(f"Nodes table migration warning: {em}")

    conn.commit()
    
    # Check seeding
    cursor.execute("SELECT COUNT(*) FROM sensor_data")
    if cursor.fetchone()[0] == 0:
        from database.seed import seed_data
        seed_data(conn)
        logger.info("Database seeded.")
    else:
        conn.close()

def run_query(query, params=(), commit=False):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(query, params)
        if commit:
            conn.commit()
            return cursor.lastrowid
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        logger.error(f"Database error: {e} - Query: {query}")
        raise e
    finally:
        conn.close()
