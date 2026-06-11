"""
Guardian Mesh — AI Service
Supports: Gemini (primary), Claude (secondary), Mock fallback
"""
import json
import time
import random
import urllib.request
import urllib.error
from config.config import GEMINI_API_KEY, CLAUDE_API_KEY, logger
from database.database import run_query


# ── Fallback responses ────────────────────────────────────────────
_FALLBACK_REPORTS = [
    {
        "incident_title": "Wildfire Signature Detected",
        "severity": "Critical",
        "confidence": "94%",
        "response_type": "Dispatch",
        "probable_cause": (
            "Temperature and AQI readings significantly exceed safe thresholds. "
            "Wind pattern and rapid humidity drop suggest active combustion nearby. "
            "Cross-referencing with historical baseline confirms this is not a sensor fault."
        ),
        "recommended_action": (
            "Dispatch ground unit immediately to Grid 7-North. "
            "Initiate evacuation protocol for settlements within 5 km radius."
        ),
        "related_sensors": ["NODE_A", "NODE_B"],
        "data_source": "mock_fallback",
    },
    {
        "incident_title": "Mesh Relay Failure",
        "severity": "High",
        "confidence": "88%",
        "response_type": "Investigate",
        "probable_cause": (
            "Critical relay node has disconnected, creating a coverage gap. "
            "Battery depletion is the most probable root cause based on last known charge level. "
            "Downstream nodes are accumulating unsent packets in local cache."
        ),
        "recommended_action": (
            "Send field technician to inspect NODE_B. "
            "Enable extended store-and-forward on adjacent nodes to prevent data loss."
        ),
        "related_sensors": ["NODE_B", "GROUND"],
        "data_source": "mock_fallback",
    },
    {
        "incident_title": "Gas Anomaly — Night Hours",
        "severity": "Moderate",
        "confidence": "76%",
        "response_type": "Monitor",
        "probable_cause": (
            "MQ-135 readings elevated above baseline during night hours. "
            "Thermal inversion layer may be trapping ground-level pollutants. "
            "Single node affected, suggesting a localized source."
        ),
        "recommended_action": (
            "Increase sampling frequency to every 60 seconds for 2 hours. "
            "Alert nearest environmental agency if readings exceed 200 AQI."
        ),
        "related_sensors": ["NODE_A"],
        "data_source": "mock_fallback",
    },
    {
        "incident_title": "Rapid Pressure Drop",
        "severity": "Moderate",
        "confidence": "82%",
        "response_type": "Monitor",
        "probable_cause": (
            "Pressure has dropped 8 hPa in under 30 minutes — well above the 5 hPa alert threshold. "
            "Meteorological data suggests an approaching frontal system. "
            "Rainfall probability elevated significantly in the next 2–4 hours."
        ),
        "recommended_action": (
            "Issue rainfall preparedness advisory. "
            "Check all sensor waterproofing and enclosure seals before precipitation arrives."
        ),
        "related_sensors": ["NODE_A", "NODE_C", "HANDHELD_01"],
        "data_source": "mock_fallback",
    },
]


def _build_prompt(scenario: str, telemetry: dict) -> str:
    return f"""You are Guardian Mesh AI — an environmental incident analysis system for a low-cost IoT disaster monitoring network.

Analyze this scenario and current telemetry, then respond with ONLY valid JSON (no markdown fences, no extra text):

SCENARIO: {scenario}

CURRENT SENSOR CONTEXT:
- Temperature: {telemetry.get('temperature', 'N/A')}°C
- Humidity: {telemetry.get('humidity', 'N/A')}%
- Pressure: {telemetry.get('pressure', 'N/A')} hPa
- AQI: {telemetry.get('aqi', 'N/A')}
- Wind: {telemetry.get('wind_speed', 'N/A')} km/h
- Rainfall: {telemetry.get('rainfall', 'N/A')} mm/h

Respond ONLY with this JSON schema:
{{
  "incident_title": "concise title (max 8 words)",
  "severity": "Low|Moderate|High|Critical",
  "confidence": "XX%",
  "response_type": "Monitor|Investigate|Dispatch|Evacuate",
  "probable_cause": "2-3 sentence technical explanation",
  "recommended_action": "1-2 sentence clear directive",
  "related_sensors": ["NODE_X"]
}}"""


def _call_gemini(prompt: str) -> dict | None:
    """Call Gemini 1.5 Flash via REST."""
    if not GEMINI_API_KEY:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 512},
        }).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = json.loads(resp.read())
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
        match = __import__("re").search(r"\{[\s\S]*\}", text)
        result = json.loads(match.group()) if match else {}
        result["data_source"] = "gemini"
        return result if result.get("severity") else None
    except Exception as e:
        logger.warning(f"Gemini call failed: {e}")
        return None


def _call_claude(prompt: str) -> dict | None:
    """Call Claude claude-sonnet-4-5 via REST."""
    if not CLAUDE_API_KEY:
        return None
    try:
        body = json.dumps({
            "model": "claude-sonnet-4-5",
            "max_tokens": 512,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = json.loads(resp.read())
        text = raw["content"][0]["text"]
        match = __import__("re").search(r"\{[\s\S]*\}", text)
        result = json.loads(match.group()) if match else {}
        result["data_source"] = "claude"
        return result if result.get("severity") else None
    except Exception as e:
        logger.warning(f"Claude call failed: {e}")
        return None


def generate_incident_report(scenario: str, telemetry: dict | None = None) -> dict:
    """
    Try Gemini → Claude → Mock fallback.
    Always returns a valid report dict.
    """
    if telemetry is None:
        telemetry = {}

    prompt = _build_prompt(scenario, telemetry)

    report = _call_gemini(prompt) or _call_claude(prompt)

    if not report:
        report = random.choice(_FALLBACK_REPORTS).copy()
        report["incident_title"] = report["incident_title"] if len(scenario) < 40 else "Environmental Anomaly Assessment"
        logger.info("AI report generated via mock fallback")
    else:
        logger.info(f"AI report generated via {report.get('data_source', 'api')}")

    # Persist to DB
    ts = int(time.time())
    try:
        run_query(
            "INSERT INTO ai_reports (incident, recommendation, confidence, timestamp, node_id) VALUES (?,?,?,?,?)",
            (
                report.get("incident_title", ""),
                report.get("recommended_action", ""),
                float(report.get("confidence", "0%").replace("%", "")) / 100,
                ts,
                ", ".join(report.get("related_sensors", [])),
            ),
            commit=True,
        )
    except Exception as e:
        logger.error(f"Failed to persist AI report: {e}")

    report["timestamp"] = ts
    return report
