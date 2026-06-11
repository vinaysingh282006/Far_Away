"""
Guardian Mesh — Weather & Air Quality Service
Providers: OpenWeatherMap (primary) → AQICN (secondary) → Mock fallback
"""
import json
import time
import random
import urllib.request
from config.config import OPENWEATHERMAP_API_KEY, AQICN_API_KEY, NASA_FIRMS_API_KEY, logger

# Default location (can be overridden via API param)
DEFAULT_LAT = 12.9716
DEFAULT_LON = 77.5946
DEFAULT_CITY = "Bengaluru"


def _mock_weather() -> dict:
    """Realistic mock weather data with gentle variation."""
    base = time.time()
    hour = int(time.strftime("%H"))
    temp_offset = -3 + 6 * (hour / 12) if hour <= 12 else 3 - 4 * ((hour - 12) / 12)
    return {
        "temperature": round(28.5 + temp_offset + random.uniform(-1, 1), 1),
        "feels_like": round(30.0 + temp_offset, 1),
        "humidity": round(62 + random.uniform(-5, 8)),
        "pressure": round(1012 + random.uniform(-3, 3), 1),
        "wind_speed": round(14 + random.uniform(-4, 6), 1),
        "wind_deg": random.randint(0, 360),
        "rainfall": round(max(0, random.gauss(0.1, 0.3)), 2),
        "description": random.choice(["Partly cloudy", "Clear sky", "Light haze", "Scattered clouds"]),
        "icon": "04d",
        "city": DEFAULT_CITY,
        "data_source": "mock_fallback",
        "timestamp": int(base),
    }


def _mock_aqi() -> dict:
    return {
        "aqi": round(45 + random.uniform(-10, 30)),
        "dominant_pollutant": "pm25",
        "pm25": round(12 + random.uniform(-3, 8), 1),
        "pm10": round(22 + random.uniform(-5, 10), 1),
        "o3": round(18 + random.uniform(-3, 5), 1),
        "no2": round(8 + random.uniform(-2, 4), 1),
        "city": DEFAULT_CITY,
        "data_source": "mock_fallback",
        "timestamp": int(time.time()),
    }


def get_weather(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> dict:
    """Fetch weather from OpenWeatherMap or fall back to mock."""
    if not OPENWEATHERMAP_API_KEY:
        logger.debug("No OPENWEATHERMAP_API_KEY — using mock weather")
        return _mock_weather()
    try:
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?lat={lat}&lon={lon}&appid={OPENWEATHERMAP_API_KEY}&units=metric"
        )
        with urllib.request.urlopen(url, timeout=8) as resp:
            raw = json.loads(resp.read())
        rain_1h = raw.get("rain", {}).get("1h", 0)
        return {
            "temperature": raw["main"]["temp"],
            "feels_like": raw["main"]["feels_like"],
            "humidity": raw["main"]["humidity"],
            "pressure": raw["main"]["pressure"],
            "wind_speed": raw["wind"]["speed"] * 3.6,  # m/s → km/h
            "wind_deg": raw["wind"].get("deg", 0),
            "rainfall": rain_1h,
            "description": raw["weather"][0]["description"].title(),
            "icon": raw["weather"][0]["icon"],
            "city": raw.get("name", DEFAULT_CITY),
            "data_source": "openweathermap",
            "timestamp": int(time.time()),
        }
    except Exception as e:
        logger.warning(f"OpenWeatherMap failed: {e} — using mock")
        return _mock_weather()


def get_aqi(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> dict:
    """Fetch AQI from AQICN or fall back to mock."""
    if not AQICN_API_KEY:
        return _mock_aqi()
    try:
        url = f"https://api.waqi.info/feed/geo:{lat};{lon}/?token={AQICN_API_KEY}"
        with urllib.request.urlopen(url, timeout=8) as resp:
            raw = json.loads(resp.read())
        if raw.get("status") != "ok":
            raise ValueError("AQICN status not ok")
        data = raw["data"]
        iaqi = data.get("iaqi", {})
        return {
            "aqi": data.get("aqi", 0),
            "dominant_pollutant": data.get("dominentpol", "pm25"),
            "pm25": iaqi.get("pm25", {}).get("v", 0),
            "pm10": iaqi.get("pm10", {}).get("v", 0),
            "o3":   iaqi.get("o3",   {}).get("v", 0),
            "no2":  iaqi.get("no2",  {}).get("v", 0),
            "city": data.get("city", {}).get("name", DEFAULT_CITY),
            "data_source": "aqicn",
            "timestamp": int(time.time()),
        }
    except Exception as e:
        logger.warning(f"AQICN failed: {e} — using mock")
        return _mock_aqi()


def get_fire_hotspots(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> list:
    """Fetch NASA FIRMS fire hotspots or return empty list."""
    if not NASA_FIRMS_API_KEY:
        return []
    try:
        area = f"{lon-2},{lat-2},{lon+2},{lat+2}"
        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_API_KEY}/VIIRS_SNPP_NRT/{area}/1"
        with urllib.request.urlopen(url, timeout=10) as resp:
            lines = resp.read().decode().strip().split("\n")
        hotspots = []
        if len(lines) > 1:
            headers = lines[0].split(",")
            for line in lines[1:6]:  # max 5
                vals = line.split(",")
                if len(vals) >= 3:
                    hotspots.append({
                        "lat": float(vals[0]) if vals[0].replace(".", "").replace("-", "").isdigit() else 0,
                        "lon": float(vals[1]) if vals[1].replace(".", "").replace("-", "").isdigit() else 0,
                        "confidence": vals[8] if len(vals) > 8 else "N",
                    })
        return hotspots
    except Exception as e:
        logger.warning(f"NASA FIRMS failed: {e}")
        return []
