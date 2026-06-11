# Guardian Mesh Environmental Station

> **Low-cost autonomous environmental and disaster monitoring network.**  
> Real-time sensor telemetry · AI-powered incident analysis · Resilient mesh relay

---

## What is Guardian Mesh?

Guardian Mesh is a distributed sensor network built on low-cost ESP32 microcontrollers. It monitors temperature, humidity, air quality, rainfall, wind speed, pressure, and more — relaying data through a self-healing mesh network to this web-based command station.

When a hazard event occurs, the system:
1. Detects the anomaly via threshold comparison and trend analysis
2. Relays the alert packet through available mesh nodes
3. Logs it persistently in SQLite
4. Broadcasts live to all connected dashboards via WebSocket
5. Generates an AI incident report via Claude AI

---

## Quick Start

### Prerequisites
- Python 3.10+
- pip

### Installation

```bash
git clone https://github.com/your-repo/guardian-mesh.git
cd guardian-mesh
pip install -r requirements.txt
```

### Configuration

Copy `config/default_config.json` and add your API keys:

```json
{
  "api_keys": {
    "anthropic_api_key": "sk-ant-...",
    "openweather_api_key": "...",
    "aqicn_api_key": "..."
  }
}
```

> **Never commit real API keys to source control.** Use GitHub Secrets for CI/CD.

### Run

```bash
uvicorn main:app --reload --port 8080
```

Open **http://localhost:8080** in your browser.

---

## Project Structure

```
/
├── main.py                  # FastAPI entry point
├── requirements.txt
│
├── config/
│   ├── config.py            # Config loader + logger setup
│   ├── constants.py         # App-wide constants
│   └── default_config.json  # Theme, thresholds, API key slots
│
├── api/
│   ├── routes.py            # REST endpoint handlers
│   └── websocket.py         # WebSocket connection manager
│
├── database/
│   ├── database.py          # SQLite schema, init, query helper
│   └── seed.py              # 24h mock data seeder
│
├── services/
│   ├── ai_service.py        # Claude AI integration
│   ├── weather_service.py   # Weather API integration
│   └── report_service.py    # PDF report generation
│
├── static/
│   ├── css/styles.css       # Premium UI styles
│   └── js/app.js            # All frontend logic
│
├── templates/
│   └── index.html           # 7-page dashboard
│
├── assets/                  # Photos, icons, models, lottie
├── logs/system.log          # Runtime event log
├── tests/test_backend.py    # Pytest test suite
├── .github/workflows/ci.yml # GitHub Actions CI
└── docs/                    # Full documentation
```

---

## Running Tests

```bash
pip install pytest httpx pytest-cov
pytest tests/ -v --cov=. --cov-report=term-missing
```

---

## Hardware Setup

See [HARDWARE_SETUP.md](HARDWARE_SETUP.md) for ESP32 wiring and firmware flashing instructions.

---

## API Reference

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for full endpoint documentation.

---

## License

MIT License — open source for education, disaster response, and environmental monitoring.
