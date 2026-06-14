/*
 * ============================================================
 *  Guardian Pocket Terminal — ESP32 Firmware
 *  Version: 1.0  (local-demo build)
 * ============================================================
 *
 *  HARDWARE CONNECTIONS
 *  --------------------
 *  OLED SDA  → GPIO 21
 *  OLED SCL  → GPIO 22
 *  OLED VCC  → 3.3 V
 *  OLED GND  → GND
 *
 *  Button UP   → GPIO 14  (other leg → GND)
 *  Button DOWN → GPIO 27  (other leg → GND)
 *  Button SEND → GPIO 26  (other leg → GND)
 *
 *  LIBRARY REQUIREMENTS (install via Arduino Library Manager)
 *  ----------------------------------------------------------
 *  - Adafruit SSD1306
 *  - Adafruit GFX Library
 *  - ArduinoJson  (v6.x)
 *  (WiFi.h and HTTPClient.h are bundled with the ESP32 core)
 *
 *  NETWORK ARCHITECTURE
 *  --------------------
 *  Laptop creates a WiFi hotspot  →  ESP32 joins as a client
 *  ESP32 HTTP-POSTs to FastAPI backend on the laptop
 *  Backend stores message + broadcasts via WebSocket
 *  Web dashboard shows popup/toast
 *
 *  BACKEND INTEGRATION NOTES
 *  -------------------------
 *  POST /message  (JSON body shown below)
 *  Backend should:
 *    1. Parse JSON body
 *    2. INSERT into SQLite messages table
 *    3. Broadcast same JSON over WebSocket to dashboard clients
 *    4. Dashboard JS shows a toast / popup on receipt
 *  Expected HTTP 200 on success (any 2xx is treated as success).
 *
 *  JSON PAYLOAD EXAMPLE
 *  --------------------
 *  {
 *    "device_id":  "HANDHELD_01",
 *    "message":    "Fire Alert",
 *    "priority":   "HIGH",
 *    "timestamp":  12345678,
 *    "wifi_rssi":  -48,
 *    "uptime_ms":  12345678
 *  }
 * ============================================================
 */

// ── LIBRARIES ────────────────────────────────────────────────
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// ── USER-EDITABLE CONFIGURATION ──────────────────────────────
const char* WIFI_SSID      = "Airtel_Vinay@Wifi";          // ← laptop hotspot SSID
const char* WIFI_PASSWORD  = "Vinay@Singh12";       // ← hotspot password
const char* BACKEND_URL    = "http://192.168.1.5:8000/message"; // ← laptop IP
const char* DEVICE_ID      = "HANDHELD_01";

// ── PIN DEFINITIONS ──────────────────────────────────────────
#define PIN_BTN_UP    14
#define PIN_BTN_DOWN  27
#define PIN_BTN_SEND  26

// ── OLED CONFIG ──────────────────────────────────────────────
#define OLED_WIDTH   128
#define OLED_HEIGHT   64
#define OLED_RESET    -1   // no dedicated reset pin
#define OLED_ADDRESS 0x3C

// ── TIMING CONSTANTS ─────────────────────────────────────────
#define DEBOUNCE_MS          50
#define HTTP_TIMEOUT_MS    5000
#define POST_RESULT_DELAY  2000   // ms to show SUCCESS / ERROR before going HOME
#define WIFI_RETRY_MS      5000   // background WiFi reconnect interval
#define SENDING_ANIM_MS     300   // dot animation period

// ── PRESET MESSAGES ──────────────────────────────────────────
const char* PRESETS[] = {
  "Need Help",
  "Fire Alert",
  "Medical Emergency",
  "Flood Alert",
  "Evacuate Area",
  "Battery Low",
  "System Check",
  "All Clear"
};
const int PRESET_COUNT = sizeof(PRESETS) / sizeof(PRESETS[0]);

// ── STATE MACHINE ─────────────────────────────────────────────
enum AppState {
  STATE_BOOT,
  STATE_CONNECTING_WIFI,
  STATE_HOME,
  STATE_MENU,
  STATE_SENDING,
  STATE_SUCCESS,
  STATE_ERROR
};

AppState currentState = STATE_BOOT;

// ── RUNTIME VARS ─────────────────────────────────────────────
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
bool oledOk = false;

int  selectedIndex = 0;       // currently highlighted preset
int  menuOffset    = 0;       // scroll offset for menu list
String lastError   = "";      // reason shown on error screen

unsigned long stateEnteredAt  = 0;   // when did we enter current state?
unsigned long lastWifiRetry   = 0;   // for background reconnect
unsigned long animTick        = 0;   // sending animation tick
int           animDots        = 0;

// button debounce timestamps
unsigned long lastUpPress   = 0;
unsigned long lastDownPress = 0;
unsigned long lastSendPress = 0;

// ── FORWARD DECLARATIONS ─────────────────────────────────────
void enterState(AppState s);
void handleButtons();
void updateDisplay();
void drawBoot();
void drawConnecting();
void drawHome();
void drawMenu();
void drawSending();
void drawSuccess();
void drawError();
void sendMessage();
void tryReconnectWifi();
bool isWifiUp();

// ─────────────────────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("[Guardian] Boot started");

  // Buttons
  pinMode(PIN_BTN_UP,   INPUT_PULLUP);
  pinMode(PIN_BTN_DOWN, INPUT_PULLUP);
  pinMode(PIN_BTN_SEND, INPUT_PULLUP);

  // OLED
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("[OLED] Init FAILED — continuing without display");
    oledOk = false;
  } else {
    oledOk = true;
    Serial.println("[OLED] Initialized OK");
  }

  enterState(STATE_BOOT);
}

// ─────────────────────────────────────────────────────────────
//  MAIN LOOP — non-blocking state machine
// ─────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── Background WiFi reconnect ─────────────────────────────
  if (!isWifiUp() &&
      currentState != STATE_CONNECTING_WIFI &&
      currentState != STATE_BOOT &&
      (now - lastWifiRetry > WIFI_RETRY_MS)) {
    lastWifiRetry = now;
    Serial.println("[WiFi] Attempting reconnect...");
    WiFi.reconnect();
  }

  // ── Per-state logic ───────────────────────────────────────
  switch (currentState) {

    case STATE_BOOT:
      // Brief splash, then start WiFi connect
      if (now - stateEnteredAt > 1500) {
        WiFi.mode(WIFI_STA);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        Serial.print("[WiFi] Connecting to ");
        Serial.println(WIFI_SSID);
        enterState(STATE_CONNECTING_WIFI);
      }
      break;

    case STATE_CONNECTING_WIFI:
      if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[WiFi] Connected — IP: ");
        Serial.println(WiFi.localIP());
        enterState(STATE_HOME);
      } else if (now - stateEnteredAt > 15000) {
        // Timed out — go HOME anyway, show offline status
        Serial.println("[WiFi] Connection timeout — going HOME offline");
        enterState(STATE_HOME);
      }
      break;

    case STATE_HOME:
      handleButtons();
      break;

    case STATE_MENU:
      handleButtons();
      break;

    case STATE_SENDING:
      // Animation tick
      if (now - animTick > SENDING_ANIM_MS) {
        animTick = now;
        animDots = (animDots + 1) % 4;
      }
      break;

    case STATE_SUCCESS:
      if (now - stateEnteredAt > POST_RESULT_DELAY) {
        enterState(STATE_HOME);
      }
      break;

    case STATE_ERROR:
      if (now - stateEnteredAt > POST_RESULT_DELAY) {
        enterState(STATE_HOME);
      }
      break;
  }

  // ── Always refresh display ────────────────────────────────
  updateDisplay();
}

// ─────────────────────────────────────────────────────────────
//  STATE TRANSITION
// ─────────────────────────────────────────────────────────────
void enterState(AppState s) {
  currentState   = s;
  stateEnteredAt = millis();
  animDots       = 0;
  animTick       = millis();
}

// ─────────────────────────────────────────────────────────────
//  BUTTON HANDLING  (polling + millis debounce)
// ─────────────────────────────────────────────────────────────
void handleButtons() {
  unsigned long now = millis();

  bool upPressed   = (digitalRead(PIN_BTN_UP)   == LOW);
  bool downPressed = (digitalRead(PIN_BTN_DOWN) == LOW);
  bool sendPressed = (digitalRead(PIN_BTN_SEND) == LOW);

  if (upPressed && (now - lastUpPress > DEBOUNCE_MS)) {
    lastUpPress = now;
    selectedIndex = (selectedIndex - 1 + PRESET_COUNT) % PRESET_COUNT;
    Serial.print("[Btn] UP → ");
    Serial.println(PRESETS[selectedIndex]);
    if (currentState == STATE_HOME) enterState(STATE_MENU);
  }

  if (downPressed && (now - lastDownPress > DEBOUNCE_MS)) {
    lastDownPress = now;
    selectedIndex = (selectedIndex + 1) % PRESET_COUNT;
    Serial.print("[Btn] DOWN → ");
    Serial.println(PRESETS[selectedIndex]);
    if (currentState == STATE_HOME) enterState(STATE_MENU);
  }

  if (sendPressed && (now - lastSendPress > DEBOUNCE_MS)) {
    lastSendPress = now;
    Serial.print("[Btn] SEND → ");
    Serial.println(PRESETS[selectedIndex]);
    sendMessage();
  }
}

// ─────────────────────────────────────────────────────────────
//  MESSAGE SENDING  (blocking only during HTTP call,
//                    protected by a timeout)
// ─────────────────────────────────────────────────────────────
void sendMessage() {
  if (!isWifiUp()) {
    lastError = "WiFi down";
    Serial.println("[Send] Aborted — WiFi down");
    enterState(STATE_ERROR);
    return;
  }

  enterState(STATE_SENDING);
  updateDisplay();   // show "Sending..." immediately

  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["device_id"]  = DEVICE_ID;
  doc["message"]    = PRESETS[selectedIndex];
  doc["priority"]   = "HIGH";
  doc["timestamp"]  = (unsigned long)(millis() / 1000);
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["uptime_ms"]  = millis();

  String payload;
  serializeJson(doc, payload);
  Serial.print("[Send] Payload: ");
  Serial.println(payload);

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT_MS);

  int httpCode = http.POST(payload);
  http.end();

  Serial.print("[Send] HTTP response: ");
  Serial.println(httpCode);

  if (httpCode >= 200 && httpCode < 300) {
    Serial.println("[Send] Message sent OK");
    enterState(STATE_SUCCESS);
  } else if (httpCode == HTTPC_ERROR_CONNECTION_REFUSED) {
    lastError = "Server refused";
    Serial.println("[Send] Server refused connection");
    enterState(STATE_ERROR);
  } else if (httpCode == HTTPC_ERROR_READ_TIMEOUT ||
             httpCode == HTTPC_ERROR_CONNECTION_LOST) {
    lastError = "Timeout";
    Serial.println("[Send] Request timed out");
    enterState(STATE_ERROR);
  } else {
    lastError = "HTTP " + String(httpCode);
    Serial.print("[Send] Failed, code: ");
    Serial.println(httpCode);
    enterState(STATE_ERROR);
  }
}

// ─────────────────────────────────────────────────────────────
//  WIFI HELPERS
// ─────────────────────────────────────────────────────────────
bool isWifiUp() {
  return WiFi.status() == WL_CONNECTED;
}

// ─────────────────────────────────────────────────────────────
//  DISPLAY ROUTER
// ─────────────────────────────────────────────────────────────
void updateDisplay() {
  if (!oledOk) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.cp437(true);

  switch (currentState) {
    case STATE_BOOT:            drawBoot();       break;
    case STATE_CONNECTING_WIFI: drawConnecting(); break;
    case STATE_HOME:            drawHome();       break;
    case STATE_MENU:            drawMenu();       break;
    case STATE_SENDING:         drawSending();    break;
    case STATE_SUCCESS:         drawSuccess();    break;
    case STATE_ERROR:           drawError();      break;
  }

  display.display();
}

// ─────────────────────────────────────────────────────────────
//  OLED DRAW FUNCTIONS
// ─────────────────────────────────────────────────────────────

// 1. BOOT splash
void drawBoot() {
  display.setTextSize(1);
  display.setCursor(8, 8);
  display.println("Guardian Pocket");
  display.setCursor(8, 20);
  display.println("  Terminal");

  display.drawLine(0, 32, 127, 32, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(8, 40);
  display.println("Initializing...");
  display.setCursor(8, 52);
  display.print("Device: ");
  display.println(DEVICE_ID);
}

// 2. Connecting to WiFi
void drawConnecting() {
  display.setTextSize(1);
  display.setCursor(4, 4);
  display.println("Guardian Pocket");

  display.drawLine(0, 14, 127, 14, SSD1306_WHITE);

  display.setCursor(4, 20);
  display.println("Connecting WiFi");
  display.setCursor(4, 32);
  display.print("SSID: ");
  display.println(WIFI_SSID);

  // Animated dots
  unsigned long elapsed = (millis() - stateEnteredAt) / 500 % 4;
  display.setCursor(4, 48);
  display.print("Please wait");
  for (unsigned long i = 0; i < elapsed; i++) display.print(".");
}

// 3. HOME screen
void drawHome() {
  // Header
  display.setTextSize(1);
  display.setCursor(4, 2);
  display.println("Guardian Pocket");
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  // Status row
  display.setCursor(4, 15);
  display.print("WiFi:");
  display.print(isWifiUp() ? " OK  " : " OFF ");
  display.print("ID:");
  display.println(DEVICE_ID);

  display.drawLine(0, 24, 127, 24, SSD1306_WHITE);

  // Selected message
  display.setCursor(4, 28);
  display.print("Msg: ");

  // Truncate if too long for one line
  String msg = String(PRESETS[selectedIndex]);
  if (msg.length() > 14) msg = msg.substring(0, 13) + ".";
  display.println(msg);

  display.setCursor(4, 40);
  display.print("RSSI:");
  if (isWifiUp()) {
    display.print(WiFi.RSSI());
    display.println(" dBm");
  } else {
    display.println("--");
  }

  display.drawLine(0, 52, 127, 52, SSD1306_WHITE);

  // Footer hint
  display.setCursor(4, 55);
  display.println("[U/D] nav  [S] send");
}

// 4. MENU — scrollable preset list
void drawMenu() {
  display.setTextSize(1);
  display.setCursor(4, 2);
  display.println("Select Message:");
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  // Show up to 4 entries, scroll to keep selectedIndex visible
  const int visibleRows = 4;
  // Recalculate scroll offset
  if (selectedIndex < menuOffset) menuOffset = selectedIndex;
  if (selectedIndex >= menuOffset + visibleRows) menuOffset = selectedIndex - visibleRows + 1;

  for (int i = 0; i < visibleRows; i++) {
    int idx = menuOffset + i;
    if (idx >= PRESET_COUNT) break;

    int y = 15 + i * 12;

    if (idx == selectedIndex) {
      // Highlight bar
      display.fillRect(0, y - 1, 127, 11, SSD1306_WHITE);
      display.setTextColor(SSD1306_BLACK);
    } else {
      display.setTextColor(SSD1306_WHITE);
    }

    display.setCursor(4, y);
    String label = String(PRESETS[idx]);
    if (label.length() > 19) label = label.substring(0, 18) + ".";
    display.println(label);
  }

  display.setTextColor(SSD1306_WHITE);
  display.setCursor(4, 57);
  display.println("[U/D] scroll  [S] OK");
}

// 5. SENDING
void drawSending() {
  display.setTextSize(1);
  display.setCursor(4, 4);
  display.println("Sending...");
  display.drawLine(0, 14, 127, 14, SSD1306_WHITE);

  display.setCursor(4, 20);
  String msg = String(PRESETS[selectedIndex]);
  display.println(msg);

  // Animated progress dots
  display.setCursor(4, 38);
  display.print("Progress");
  for (int i = 0; i < animDots; i++) display.print(".");

  display.setCursor(4, 52);
  display.println("Please wait...");
}

// 6. SUCCESS
void drawSuccess() {
  display.setTextSize(2);
  display.setCursor(10, 4);
  display.println("* SENT *");

  display.setTextSize(1);
  display.drawLine(0, 24, 127, 24, SSD1306_WHITE);
  display.setCursor(4, 28);
  String msg = String(PRESETS[selectedIndex]);
  if (msg.length() > 19) msg = msg.substring(0, 18) + ".";
  display.println(msg);

  display.setCursor(4, 44);
  display.println("Alert dispatched!");
  display.setCursor(4, 55);
  display.println("Returning home...");
}

// 7. ERROR
void drawError() {
  display.setTextSize(2);
  display.setCursor(4, 4);
  display.println("X FAILED");

  display.setTextSize(1);
  display.drawLine(0, 24, 127, 24, SSD1306_WHITE);

  display.setCursor(4, 28);
  display.print("Reason: ");
  display.println(lastError);

  display.setCursor(4, 44);
  display.println("Check WiFi/server.");
  display.setCursor(4, 55);
  display.println("Returning home...");
}

/*
 * ============================================================
 *  FASTAPI BACKEND INTEGRATION NOTES
 * ============================================================
 *
 *  Required endpoint:   POST /message
 *  Content-Type:        application/json
 *
 *  Minimal FastAPI example (main.py):
 *
 *    from fastapi import FastAPI, WebSocket
 *    from fastapi.middleware.cors import CORSMiddleware
 *    import json, sqlite3
 *    from datetime import datetime
 *
 *    app = FastAPI()
 *    app.add_middleware(CORSMiddleware, allow_origins=["*"],
 *                       allow_methods=["*"], allow_headers=["*"])
 *
 *    connected_clients: list[WebSocket] = []
 *
 *    @app.websocket("/ws")
 *    async def ws_endpoint(ws: WebSocket):
 *        await ws.accept()
 *        connected_clients.append(ws)
 *        try:
 *            while True:
 *                await ws.receive_text()   # keep alive
 *        except Exception:
 *            connected_clients.remove(ws)
 *
 *    @app.post("/message")
 *    async def receive_message(payload: dict):
 *        # 1. Store in SQLite
 *        con = sqlite3.connect("guardian.db")
 *        con.execute("""CREATE TABLE IF NOT EXISTS messages
 *                       (device_id TEXT, message TEXT,
 *                        priority TEXT, timestamp INTEGER,
 *                        wifi_rssi INTEGER, uptime_ms INTEGER,
 *                        received_at TEXT)""")
 *        con.execute("INSERT INTO messages VALUES (?,?,?,?,?,?,?)",
 *                    (payload["device_id"], payload["message"],
 *                     payload["priority"], payload["timestamp"],
 *                     payload["wifi_rssi"], payload["uptime_ms"],
 *                     datetime.utcnow().isoformat()))
 *        con.commit(); con.close()
 *
 *        # 2. Broadcast to dashboard WebSocket clients
 *        dead = []
 *        for ws in connected_clients:
 *            try:
 *                await ws.send_text(json.dumps(payload))
 *            except Exception:
 *                dead.append(ws)
 *        for ws in dead:
 *            connected_clients.remove(ws)
 *
 *        return {"status": "ok"}
 *
 *  Dashboard JS (popup on receipt):
 *
 *    const ws = new WebSocket("ws://192.168.137.1:8000/ws");
 *    ws.onmessage = (e) => {
 *        const data = JSON.parse(e.data);
 *        showToast(`[${data.device_id}] ${data.message}`);
 *    };
 *
 *  Run server:
 *    uvicorn main:app --host 0.0.0.0 --port 8000
 * ============================================================
 */
