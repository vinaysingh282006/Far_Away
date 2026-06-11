# Guardian Mesh — Application Constants

APP_NAME    = "Guardian Mesh Environmental Station"
APP_VERSION = "1.0.0"
APP_PORT    = 8080

# ── Sensor Thresholds ──────────────────────────────────────────────
TEMP_ALERT          = 40.0    # °C
HUMIDITY_MIN        = 10.0    # %
AQI_HAZARDOUS       = 200.0   # AQI
AQI_ALERT           = 150.0   # AQI
RAINFALL_ALERT      = 50.0    # mm/h
WIND_ALERT          = 60.0    # km/h
PRESSURE_DROP_ALERT = 5.0     # hPa / 30 min
BATTERY_WARNING     = 20      # %
RSSI_WEAK           = -80     # dBm

# ── Node Health Labels ─────────────────────────────────────────────
HEALTH_EXCELLENT = "Excellent"
HEALTH_GOOD      = "Good"
HEALTH_WARNING   = "Warning"
HEALTH_CRITICAL  = "Critical"
HEALTH_OFFLINE   = "Offline"

# ── File Paths ─────────────────────────────────────────────────────
DB_FILE          = "guardian.db"
LOG_FILE         = "logs/system.log"

# ── History Ranges (seconds) ───────────────────────────────────────
HISTORY_RANGES = {
    "1h":  3600,
    "6h":  21600,
    "24h": 86400,
    "7d":  604800,
    "30d": 2592000,
}

# ── Event Types ────────────────────────────────────────────────────
EV_SYSTEM   = "SYSTEM"
EV_TELEMETRY= "TELEMETRY"
EV_PANIC    = "PANIC"
EV_ANOMALY  = "ANOMALY"
EV_AI       = "AI"
EV_NODE     = "NODE"
EV_NETWORK  = "NETWORK"
EV_QUEUE    = "OFFLINE_QUEUE"

# ── AI Provider Preference ─────────────────────────────────────────
AI_PROVIDERS_ORDER = ["gemini", "claude", "mock"]

# ── Default Location (for weather APIs) ───────────────────────────
DEFAULT_LAT  = 12.9716
DEFAULT_LON  = 77.5946
DEFAULT_CITY = "Bengaluru"
