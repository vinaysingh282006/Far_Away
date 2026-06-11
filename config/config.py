"""
Guardian Mesh — Central Configuration & Logger
Loads all secrets from environment variables / GitHub Secrets.
Frontend never receives raw keys — only safe public config.
"""
import json
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
load_dotenv()


# ── Paths ─────────────────────────────────────────────────────────
ROOT          = Path(__file__).parent.parent
LOG_DIR       = ROOT / "logs"
CONFIG_FILE   = Path(__file__).parent / "default_config.json"

LOG_DIR.mkdir(exist_ok=True)

# ── Logger ────────────────────────────────────────────────────────
logger = logging.getLogger("guardian_mesh")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _fh = logging.FileHandler(LOG_DIR / "system.log")
    _fh.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s"))
    logger.addHandler(_fh)
    _sh = logging.StreamHandler()
    _sh.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s"))
    logger.addHandler(_sh)

# ── Load default_config.json ──────────────────────────────────────
def _load_json() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"Could not load {CONFIG_FILE}: {e}")
        return {}

_cfg = _load_json()

# ── Secret resolver (env → config.json → None) ────────────────────
def _secret(env_key: str, cfg_path: str | None = None) -> str | None:
    val = os.environ.get(env_key)
    if val:
        return val.strip()
    if cfg_path:
        # Walk dotted path: "api_keys.gemini_api_key"
        node = _cfg
        for part in cfg_path.split("."):
            node = node.get(part, {}) if isinstance(node, dict) else {}
        if node and isinstance(node, str):
            return node.strip()
    return None

# ── AI / LLM ──────────────────────────────────────────────────────
GEMINI_API_KEY  = _secret("GEMINI_API_KEY",  "api_keys.gemini_api_key")
CLAUDE_API_KEY  = _secret("CLAUDE_API_KEY",  "api_keys.anthropic_api_key")

# ── Weather / Environment ─────────────────────────────────────────
OPENWEATHERMAP_API_KEY = _secret("OPENWEATHERMAP_API_KEY", "api_keys.openweather_api_key")
AQICN_API_KEY          = _secret("AQICN_API_KEY",          "api_keys.aqicn_api_key")
NASA_FIRMS_API_KEY     = _secret("NASA_FIRMS_API_KEY",      "api_keys.nasa_firms_api_key")

# ── Cloud / Firebase ──────────────────────────────────────────────
FIREBASE_API_KEY              = _secret("FIREBASE_API_KEY")
FIREBASE_AUTH_DOMAIN          = _secret("FIREBASE_AUTH_DOMAIN")
FIREBASE_PROJECT_ID           = _secret("FIREBASE_PROJECT_ID")
FIREBASE_STORAGE_BUCKET       = _secret("FIREBASE_STORAGE_BUCKET")
FIREBASE_MESSAGING_SENDER_ID  = _secret("FIREBASE_MESSAGING_SENDER_ID")
FIREBASE_APP_ID               = _secret("FIREBASE_APP_ID")
FIREBASE_DATABASE_URL         = _secret("FIREBASE_DATABASE_URL")

# ── Security ──────────────────────────────────────────────────────
APP_SECRET_KEY     = _secret("APP_SECRET_KEY")     or "guardian-mesh-dev-secret"
JWT_SECRET_KEY     = _secret("JWT_SECRET_KEY")     or "guardian-jwt-dev-secret"
SESSION_SECRET_KEY = _secret("SESSION_SECRET_KEY") or "guardian-session-dev"
WEBHOOK_SECRET     = _secret("WEBHOOK_SECRET")
UPLOAD_SIGNING_KEY = _secret("UPLOAD_SIGNING_KEY")

# ── Optional Integrations ─────────────────────────────────────────
MAPBOX_API_KEY  = _secret("MAPBOX_API_KEY")
SUPABASE_API_KEY = _secret("SUPABASE_API_KEY")
SUPABASE_URL    = _secret("SUPABASE_URL")
GITHUB_TOKEN    = _secret("GITHUB_TOKEN")

# ── Dashboard / Theme (safe for frontend) ─────────────────────────
_theme = _cfg.get("theme", {})
_dash  = _cfg.get("dashboard", {})

DASHBOARD_CONFIG = {
    "theme": {
        "accent_color":    _theme.get("accent_color",    "#8B1A2E"),
        "background_color": _theme.get("background_color", "#080808"),
        "animation_speed": _theme.get("animation_speed",  "normal"),
        "blur_intensity":  _theme.get("blur_intensity",   "medium"),
        "card_opacity":    _theme.get("card_opacity",     0.8),
    },
    "dashboard": {
        "sampling_interval_ms": _dash.get("sampling_interval_ms", 5000),
        "demo_mode":            _dash.get("demo_mode",             False),
    },
    # Capability flags (true = key present, no key exposed)
    "capabilities": {
        "ai_gemini":   bool(GEMINI_API_KEY),
        "ai_claude":   bool(CLAUDE_API_KEY),
        "weather":     bool(OPENWEATHERMAP_API_KEY),
        "aqi":         bool(AQICN_API_KEY),
        "nasa_firms":  bool(NASA_FIRMS_API_KEY),
        "firebase":    bool(FIREBASE_API_KEY),
        "mapbox":      bool(MAPBOX_API_KEY),
    },
}


def get_config() -> dict:
    return DASHBOARD_CONFIG


def update_config(partial: dict) -> None:
    global _cfg
    _cfg.update(partial)
    try:
        CONFIG_FILE.write_text(json.dumps(_cfg, indent=2), encoding="utf-8")
        logger.info("config updated")
    except Exception as e:
        logger.error(f"config write failed: {e}")


# ── Startup banner ────────────────────────────────────────────────
def _log_capabilities() -> None:
    caps = DASHBOARD_CONFIG["capabilities"]
    logger.info("=== Guardian Mesh ===")
    for k, v in caps.items():
        logger.info(f"  {k:<22} {'✓ enabled' if v else '— missing (fallback active)'}")

_log_capabilities()
