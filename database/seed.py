import time
import json
from config.config import logger

def seed_data(conn):
    cursor = conn.cursor()
    now_ts = int(time.time())
    
    nodes_info = [
        ("GROUND", "Ground Station Core", 5, 10, "all", 0, 100, 0, "GROUND", "v1.2.4"),
        ("NODE_A", "North Ridge Watch", 10, 30, "all", 0, 78, -62, "NODE_B->GROUND", "v1.2.4"),
        ("NODE_B", "Forest Edge Beacon", 10, 30, "all", 0, 45, -74, "GROUND", "v1.2.4"),
        ("NODE_C", "Canyon Sentinel", 10, 30, "all", 0, 91, -58, "GROUND", "v1.2.4"),
        ("NODE_D", "West Meadow Guard", 15, 60, "all", 0, 0, -100, "", "v1.2.4"),
        ("HANDHELD_01", "Ranger Patrol Unit 1", 5, 10, "all", 0, 62, -69, "NODE_A->NODE_B->GROUND", "v1.2.4")
    ]
    
    for nid, name, s_rate, tx_int, sens, sleep, bat, rssi, relay, fw in nodes_info:
        cursor.execute("""
        INSERT INTO node_config (node_id, custom_name, sampling_rate, tx_interval, enabled_sensors, sleep_mode)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (nid, name, s_rate, tx_int, sens, sleep))
        
        health_status = 'Excellent' if bat > 80 else 'Good' if bat > 40 else 'Warning' if bat > 0 else 'Offline'
        health_score = max(0, bat)
        
        cursor.execute("""
        INSERT INTO nodes (node_id, last_seen, battery, rssi, relay_path, firmware, health_score, health_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (nid, now_ts if nid != "NODE_D" else 0, bat, rssi, relay, fw, health_score, health_status))

    active_nodes = ["NODE_A", "NODE_B", "NODE_C", "HANDHELD_01"]
    
    base_sensors = {
        "NODE_A": {"temp": 28.5, "hum": 60.0, "pres": 1011.0, "aqi": 45.0, "rain": 0.0, "wind": 12.0, "bat": 85},
        "NODE_B": {"temp": 29.0, "hum": 62.0, "pres": 1010.5, "aqi": 50.0, "rain": 0.1, "wind": 15.0, "bat": 50},
        "NODE_C": {"temp": 27.2, "hum": 58.0, "pres": 1012.0, "aqi": 38.0, "rain": 0.0, "wind": 10.0, "bat": 95},
        "HANDHELD_01": {"temp": 30.1, "hum": 65.0, "pres": 1010.0, "aqi": 55.0, "rain": 0.5, "wind": 18.0, "bat": 70}
    }

    logger.info("Seeding database with 24 hours of mock telemetry data...")
    for i in range(48):
        offset_seconds = (48 - i) * 1800 
        ts = now_ts - offset_seconds
        anomaly_period = (i >= 38 and i <= 41)
        
        for nid in active_nodes:
            base = base_sensors[nid]
            time_drift = 3.0 * (1.0 - abs(12 - (i % 24)) / 12.0)
            
            temp = base["temp"] + time_drift + (0.5 * (i % 3))
            hum = max(10, min(100, base["hum"] - time_drift + (1.0 * (i % 2))))
            pres = base["pres"] - (0.1 * i)
            aqi = base["aqi"] + (1.5 * (i % 4))
            rain = base["rain"] + (0.05 * (i % 5))
            wind = base["wind"] + (0.8 * (i % 3))
            
            if nid == "NODE_A" and anomaly_period:
                temp += 12.5 
                aqi += 110.0 
                
            battery = max(1, base["bat"] - int(i * 0.15))
            rssi = -60 - (i % 15)
            relay_path = "NODE_B->GROUND" if nid == "NODE_A" else ("NODE_A->NODE_B->GROUND" if nid == "HANDHELD_01" else "GROUND")
            
            cursor.execute("""
            INSERT INTO sensor_data (node_id, timestamp, temperature, humidity, pressure, aqi, rainfall, wind_speed, battery, rssi, relay_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (nid, ts, temp, hum, pres, aqi, rain, wind, battery, rssi, relay_path))

            if i >= 40:
                p_id = f"PKT-{ts}-{nid}"
                payload = json.dumps({"temp": round(temp, 1), "hum": round(hum, 1), "pres": round(pres, 1)})
                hop_count = len(relay_path.split("->"))
                tx_time = 0.12 * hop_count
                
                cursor.execute("""
                INSERT INTO packets (packet_id, node_id, payload, relay_path, hop_count, transmission_time, rssi, status, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (p_id, nid, payload, relay_path, hop_count, tx_time, rssi, "DELIVERED", ts))

    events = [
        (now_ts - 86400, "SYSTEM", "Guardian Mesh system initialized.", "{}"),
        (now_ts - 80000, "NODE", "Node NODE_A established connection with relay NODE_B.", '{"node_id": "NODE_A"}'),
        (now_ts - 70000, "NODE", "Node HANDHELD_01 connected via rangers-patrol protocol.", '{"node_id": "HANDHELD_01"}'),
        (now_ts - 36000, "NETWORK", "Scheduled self-diagnostic network map complete.", '{"status": "nominal"}'),
        (now_ts - 7200, "ANOMALY", "Temperature alert triggered on Node NODE_A (Value: 41.2°C).", '{"node_id": "NODE_A", "value": 41.2}'),
        (now_ts - 7000, "AI", "AI Incident Report generated for rapid temperature swing.", '{"source": "guardian-ai"}')
    ]
    for ts, ev_type, msg, meta in events:
        cursor.execute("INSERT INTO events (timestamp, event_type, message, metadata) VALUES (?, ?, ?, ?)", (ts, ev_type, msg, meta))

    conn.commit()
    conn.close()
