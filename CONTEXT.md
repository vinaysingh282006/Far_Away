# Project Context: Guardian Mesh Environmental Ground Station

This document serves as a complete history, technical specification, and operational guide for **Guardian Mesh**—a professional, offline-resilient environmental monitoring ground station dashboard.

---

## 1. Project Evolution & User Requests

### Stage 1: The Initial Specification
The project was originally designed as a high-density, futuristic environmental dashboard inspired by Japanese design philosophies ("ma" for negative space, "shibui" for understated sophistication) with a neon-blue glassmorphism cyberpunk style. Key tech specs:
- **Backend:** Python + FastAPI + SQLite + WebSockets (`main.py`).
- **Frontend:** Single-page grid layout (`index.html`) using Tailwind, Chart.js, and Vanilla JS.
- **Client-Side Claude Assistant:** Streams response blocks from the Anthropic Claude API (`claude-sonnet-4-20250514`) directly from the browser.
- **Telemetry Cards:** 6 monitoring cards (Temperature, Humidity, Pressure, Air Quality, Rainfall, Wind Speed) with smooth counter rolling, sparklines, and border updates flashes.
- **Visualizer Map:** 2D Canvas showing node topology, signal strengths, and relay pathways.
- **Sound Alarms:** Synthesized beeps (440Hz / 880Hz) on emergency panic alerts with full-screen overlays.

### Stage 2: Hackathon Improvements
The user requested 11 specific visual and architectural enhancements to elevate the project for live demonstrations:
1.  **Packet Journey Visualization:** dedicated logs panel showing hops, latency, and path, with a "Replay Path" canvas animation.
2.  **Store-and-Forward Cache:** offline queueing when ground station link drops; automatic syncing when reconnected.
3.  **Node Health Scoring:** computed health index dynamically using battery, signal, and telemetry metrics.
4.  **Digital Twin Map:** plotting nodes on geographic canvas layouts with click configurations.
5.  **AI Incident Reports:** automated crisis briefs (cause, dispatch coordinates, confidence scores) generated on panic alerts.
6.  **Trend Predictions:** offline-safe estimators showing future risk factors.
7.  **Event Timeline Log:** scrollable diagnostics ledger.
8.  **Node Configuration Panel:** settings controls to modify intervals, sample rates, and enable/disable sensors.
9.  **Deployment Analytics:** coverage area calculations and budget cost sheets.
10. **Offline-First Resilience:** external APIs (NASA FIRMS, AQICN, Open-Meteo) function as optional enhancements with full local fallbacks.
11. **One-Click Fire Demo:** a single "Simulate Forest Fire" button to run the complete end-to-end alert pipeline.

### Stage 3: Corporate Redesign (Current Phase)
The user requested a complete overhaul of the theme, typography, and page structure to create a professional, clutter-free application suitable for corporate environments:
- **Simplified Theme:** Replaced the neon cyberpunk styling with a clean Maroon (`#800020`) and Black (`#0B0B0D`) color palette with Soft Pink (`#F5C2C9`) highlights.
- **Typography:** Changed all fonts to standard Microsoft system fonts (`Segoe UI` / `Arial`).
- **7-Page Structure:** Restructured the single-page layout into 7 distinct pages:
  1.  *Introduction:* Overview, core goals, and block diagram.
  2.  *3D Simulation:* 3D wireframe network canvas with drag rotation controls.
  3.  *Real Data:* Telemetry grids and registry logs.
  4.  *Analytics:* Wave curve, bar, stacked line, and pie charts.
  5.  *AI & Scenario Creator:* AI chat terminal and custom scenario inputs.
  6.  *CSV Exporter:* Telemetry log view and export options.
  7.  *Thanks:* Concluding credits screen.
- **Drawer Settings Menu:** Moved configuration forms and simulation buttons into a right-aligned sliding panel.
- **JSON File Telemetry Caching:** Written incoming broadcasts directly to `telemetry_history.json` on the server.
- **API config.json Loader:** Excluded environment variable queries from the backend code. The frontend loads keys via `/config.json`, which can be populated dynamically from GitHub Secrets during build steps.
- **Startup 3D Presentation Map:** Integrated an auto-rotating 3D network digital twin canvas into Page 1 (Introduction) to replace the text-heavy block diagram and provide an immediate, premium visual presentation upon application load.
- **SQLite JSON Telemetry History Sync:** Integrated startup synchronization logic in `main.py` that populates `telemetry_history.json` directly from SQLite if the JSON file is missing or empty.

---

## 2. Technical Architecture & File Layout

### Codebase Components
1.  **[main.py](file:///c:/Users/Vinay%20Singh/Desktop/Far_Away/main.py):**
    - SQLite database initialization (`guardian.db`) containing telemetry and alert structures.
    - Automatic seeding of 24h historical telemetry and anomaly thresholds.
    - JSON logger: appends telemetry updates directly to `telemetry_history.json`.
    - REST endpoints for node configs, alert logs, and simulation controls.
    - WebSocket broadcasting channel.
2.  **[index.html](file:///c:/Users/Vinay%20Singh/Desktop/Far_Away/index.html):**
    - Client-side navigation routing across 7 pages.
    - Interactive 3D Canvas visualizer supporting custom ortho projections and rotation drag handlers.
    - Chart.js graph engines.
    - Direct Claude API calling using configuration files keys.
    - Audio alarm synthesizer using Web Audio API.
    - Sliding controls drawer.
3.  **[config.json](file:///c:/Users/Vinay%20Singh/Desktop/Far_Away/config.json):**
    - Static JSON configuration template used to securely pass API keys from GitHub Secrets to the client.

### Environment Requirements
- Python 3.10+
- Dependencies listed in `requirements.txt`: `fastapi`, `uvicorn`, `httpx`, `aiofiles`, `websockets`.

---

## 3. Operational Guide & Demonstration Flows

### Local Setup
1.  Configure credentials in `config.json` (optional: AI Assistant defaults to simulation mode if keys are empty):
    ```json
    {
      "anthropic_api_key": "your-api-key-here"
    }
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Run the application:
    ```bash
    python main.py
    ```
4.  Access the dashboard:
    Open `http://127.0.0.1:8000/` in a web browser.

### Key Workflows
-   **Run AI Scenarios:** Go to *05 AI & SCENARIO*, select a scenario template, customize sensor values, and click *Run Scenario Analysis*.
-   **Test Fire Simulation:** Open the *Control Interface* drawer on the right and click *Simulate Forest Fire*. Page 3 will update with anomalous data, and the emergency alarm will trigger.
-   **Acknowledge Alerts:** Click the ACK button on active alert cards to silence the alarm.
-   **Export Data:** Go to *06 CSV EXPORTER* to download the collected JSON history.
