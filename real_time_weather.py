"""
Fetch real-time weather for all wards using OpenWeatherMap (per-ward lat/lon).

Usage:
  python real_time_weather.py          # fetch all wards from wards_coords.json
  python real_time_weather.py 55       # fetch only ward with id=55 (debug)

Output (stdout, UTF-8):
{
  "status": "ok",
  "count": 147,
  "updated": "2026-03-28T16:05:00Z",
  "data": [{...successful wards...}],
  "errors": [{...failed wards...}]
}
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

try:
    import requests
except ImportError:
    requests = None  # type: ignore

OWM_API_KEY = os.getenv("OWM_API_KEY") or "7f318ae139397881686e5acd8dce296c"
COORD_FILE = "wards_coords.json"
RATE_SLEEP = 1.2  # seconds between calls to avoid rate limit (≈50 req/min)


def kmh(speed_ms: float) -> float:
    return round(speed_ms * 3.6, 1)


def emoji(code: int) -> str:
    if 200 <= code < 300:
        return "⛈️"
    if 300 <= code < 600:
        return "🌧️"
    if 600 <= code < 700:
        return "❄️"
    if 700 <= code < 800:
        return "🌫️"
    if code == 800:
        return "☀️"
    if 801 <= code <= 802:
        return "🌤️"
    return "☁️"


def fetch_point(lat: float, lon: float) -> Dict[str, Any]:
    if requests is None:
        return {"error": "requests not installed"}

    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        "lat": lat,
        "lon": lon,
        "appid": OWM_API_KEY,
        "units": "metric",
        "lang": "vi",
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        d = resp.json()
        w = d["weather"][0]
        m = d["main"]
        wind = d.get("wind", {})
        rain = d.get("rain", {})
        rain_mm = rain.get("1h") or rain.get("3h") or 0
        return {
            "temp": round(m.get("temp", 0), 1),
            "feels": round(m.get("feels_like", m.get("temp", 0)), 1),
            "desc": w.get("description", "").capitalize(),
            "humidity": m.get("humidity", 0),
            "wind": kmh(wind.get("speed", 0)),
            "rain": round(rain_mm, 1),
            "icon": emoji(w.get("id", 800)),
            "updated": datetime.fromtimestamp(d.get("dt", 0), tz=timezone.utc).strftime(
                "%H:%M UTC"
            ),
        }
    except Exception as e:  # pragma: no cover
        return {"error": str(e)}


def load_coords() -> List[Dict[str, Any]]:
    with open(COORD_FILE, "r", encoding="utf-8") as f:
        wards = json.load(f)
    return wards


def main() -> None:
    if not OWM_API_KEY:
        print(json.dumps({"status": "error", "message": "Missing OWM_API_KEY"}, ensure_ascii=False))
        sys.exit(1)

    try:
        wards = load_coords()
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Cannot read {COORD_FILE}: {e}"}, ensure_ascii=False))
        sys.exit(1)

    # Optional: only one ward id passed for quick test
    target_id = sys.argv[1] if len(sys.argv) >= 2 and sys.argv[1].lower() != "all" else None
    if target_id:
        wards = [w for w in wards if str(w.get("id")) == str(target_id)]

    results: List[Dict[str, Any]] = []
    for idx, w in enumerate(wards, 1):
        lat, lon = w.get("lat"), w.get("lon")
        label = f"{w.get('name','?')} ({w.get('district','?')})"
        if lat is None or lon is None:
            results.append({**w, "label": label, "error": "missing lat/lon"})
            continue
        res = fetch_point(float(lat), float(lon))
        res.update({"id": w.get("id"), "name": w.get("name"), "district": w.get("district"), "label": label})
        results.append(res)
        # Throttle to stay under free tier limits
        if idx < len(wards):
            time.sleep(RATE_SLEEP)

    ok = [r for r in results if "error" not in r]
    out = {
        "status": "ok" if ok else "error",
        "count": len(results),
        "updated": datetime.now(timezone.utc).isoformat(),
        "data": ok,
        "errors": [r for r in results if "error" in r],
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
