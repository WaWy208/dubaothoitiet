from flask import Flask, jsonify
from flask_cors import CORS
import subprocess
import json
import threading
import time
from datetime import datetime

app = Flask(__name__)
CORS(app)

cache = None
cache_time = 0
CACHE_DURATION = 600  # 10 min

def update_cache():
  global cache, cache_time
  while True:
    try:
      result = subprocess.run(['python', 'real_time_weather.py', 'all'], capture_output=True, text=True, timeout=30)
      if result.returncode == 0:
        cache = json.loads(result.stdout)
        cache_time = time.time()
        print(f"Updated cache: {len(cache['data'])} cities at {datetime.now()}")
    except Exception as e:
      print(f"Cache update error: {e}")
    time.sleep(CACHE_DURATION)

threading.Thread(target=update_cache, daemon=True).start()

@app.route('/api/weather')
def get_weather():
  if cache and time.time() - cache_time < CACHE_DURATION * 1.5:
    return jsonify(cache)
  return jsonify({'status': 'error', 'message': 'Cache updating'})

@app.route('/')
def index():
  return 'Weather API Server running. /api/weather'

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=5000, debug=False)
