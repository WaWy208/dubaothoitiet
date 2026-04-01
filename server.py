from flask import Flask, jsonify, request
from flask_cors import CORS
import subprocess, json, threading, time, random, math
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app, origins='*')

cache = None
cache_time = 0
CACHE_DURATION = 600
cache_lock = threading.Lock()

def update_cache_loop():
    global cache, cache_time
    while True:
        try:
            result = subprocess.run(['python', 'real_time_weather.py', 'all'],
                capture_output=True, text=True, timeout=300, encoding='utf-8')
            if result.returncode == 0 and result.stdout.strip():
                new_cache = json.loads(result.stdout)
                with cache_lock:
                    cache = new_cache
                    cache_time = time.time()
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Cache: {len(new_cache.get('data',[]))} wards")
        except Exception as e:
            print(f"[ERROR] {e}")
        time.sleep(CACHE_DURATION)

threading.Thread(target=update_cache_loop, daemon=True).start()

def sinusoidal(base, amp, phase, t=None):
    t = t or time.time()
    return round(base + amp * math.sin(t / 3600 + phase), 2)

@app.route('/health')
def health():
    with cache_lock:
        c, ct = cache, cache_time
    return jsonify({'status':'ok','cache_ready':c is not None,
        'cache_age_seconds':int(time.time()-ct) if ct else None,
        'timestamp':datetime.now(timezone.utc).isoformat()})

@app.route('/api/weather')
def get_weather():
    with cache_lock:
        c, ct = cache, cache_time
    if c and time.time() - ct < CACHE_DURATION * 1.5:
        return jsonify(c)
    return jsonify({'status':'updating','message':'Cache đang cập nhật','retry_after':30}), 503

@app.route('/api/stations')
def get_stations():
    t = time.time()
    tide = math.sin(t / (6.2 * 3600))
    stations = [
        {'id':'S01','name':'Trạm Sông Đốc','type':'Thủy hải văn',
         'location':{'lat':9.0297,'lon':104.8203},
         'salinity':sinusoidal(18.5,3.5,0.0,t),'water_level':sinusoidal(1.85,0.65,0.5,t),
         'flow_rate':sinusoidal(120,40,1.0,t),'tide':'Triều lên' if tide>0 else 'Triều rút',
         'status':'alert' if sinusoidal(18.5,3.5,0,t)>22 else 'normal',
         'updated':datetime.now().strftime('%H:%M:%S')},
        {'id':'S02','name':'Trạm Gành Hào (Bạc Liêu)','type':'Triều cường & Mặn',
         'location':{'lat':9.25,'lon':105.7667},
         'salinity':sinusoidal(21.0,4.0,1.2,t),'water_level':sinusoidal(2.10,0.70,1.7,t),
         'flow_rate':sinusoidal(85,30,2.1,t),'tide':'Triều lên' if math.sin(t/(6.2*3600)+0.8)>0 else 'Triều rút',
         'status':'warning' if sinusoidal(21.0,4.0,1.2,t)>24 else 'normal',
         'updated':datetime.now().strftime('%H:%M:%S')},
        {'id':'S03','name':'Trạm Thới Bình','type':'Nước ngọt & Phèn',
         'location':{'lat':9.5167,'lon':105.0667},
         'salinity':sinusoidal(0.4,0.3,2.5,t),'water_level':sinusoidal(0.75,0.25,2.8,t),
         'ph':sinusoidal(5.8,0.6,3.0,t),'flow_rate':sinusoidal(45,15,3.2,t),
         'tide':'N/A','status':'normal','updated':datetime.now().strftime('%H:%M:%S')},
        {'id':'S04','name':'Trạm Năm Căn','type':'Thủy hải văn',
         'location':{'lat':8.75,'lon':104.9333},
         'salinity':sinusoidal(25.0,5.0,3.8,t),'water_level':sinusoidal(1.60,0.55,4.1,t),
         'flow_rate':sinusoidal(200,60,4.5,t),'tide':'Triều lên' if math.sin(t/(6.2*3600)+2.1)>0 else 'Triều rút',
         'status':'normal','updated':datetime.now().strftime('%H:%M:%S')},
        {'id':'S05','name':'Trạm Cà Mau','type':'Khí tượng thủy văn',
         'location':{'lat':9.1769,'lon':105.1505},
         'salinity':sinusoidal(1.2,0.5,5.0,t),'water_level':sinusoidal(0.90,0.30,5.3,t),
         'flow_rate':sinusoidal(65,20,5.7,t),'tide':'N/A','status':'normal',
         'updated':datetime.now().strftime('%H:%M:%S')},
    ]
    return jsonify({'status':'success','data':stations,
        'tide_phase':'Triều lên' if tide>0 else 'Triều rút',
        'tide_pct':round((tide+1)/2*100,1),'updated':datetime.now().strftime('%H:%M:%S')})

@app.route('/api/alert')
def get_alert():
    with cache_lock:
        c = cache
    alerts = []
    if c and c.get('data'):
        temps = [d['temp'] for d in c['data'] if 'temp' in d]
        winds = [d['wind'] for d in c['data'] if 'wind' in d]
        rains = [d['rain'] for d in c['data'] if 'rain' in d]
        if temps and max(temps) > 37:
            alerts.append({'level':'warning','type':'heat','title':'🌡️ Nắng nóng gay gắt',
                'message':f'Nhiệt độ cao nhất {max(temps):.1f}°C. Hạn chế ra ngoài 10:00–16:00.','icon':'☀️'})
        if winds and max(winds) > 45:
            alerts.append({'level':'danger','type':'wind','title':'💨 Gió mạnh nguy hiểm',
                'message':f'Gió mạnh {max(winds):.0f} km/h. Nguy hiểm tàu thuyền.','icon':'🌬️'})
        if rains and max(rains) > 15:
            alerts.append({'level':'warning','type':'rain','title':'🌧️ Mưa lớn',
                'message':f'Mưa {max(rains):.1f} mm/h. Cảnh báo ngập úng.','icon':'🌧️'})
    if 5 <= datetime.now().month <= 11:
        alerts.append({'level':'info','type':'seasonal','title':'🌊 Mùa mưa đang hoạt động',
            'message':'Gió mùa Tây Nam. Mưa rào và dông bất ngờ. Sóng cao 1–2m.','icon':'🌦️'})
    return jsonify({'status':'success','alerts':alerts,'count':len(alerts),
        'updated':datetime.now(timezone.utc).isoformat()})

@app.route('/api/summary')
def get_summary():
    with cache_lock:
        c = cache
    if not c or not c.get('data'):
        return jsonify({'status':'no_data'}), 503
    data = c['data']
    temps = [d['temp'] for d in data if 'temp' in d]
    winds = [d['wind'] for d in data if 'wind' in d]
    humids = [d['humidity'] for d in data if 'humidity' in d]
    rains = [d['rain'] for d in data if 'rain' in d]
    if not temps:
        return jsonify({'status':'no_data'}), 503
    return jsonify({'status':'success','province':'Cà Mau (mở rộng)','ward_count':len(data),
        'temperature':{'avg':round(sum(temps)/len(temps),1),'max':round(max(temps),1),'min':round(min(temps),1)},
        'wind':{'avg':round(sum(winds)/len(winds),1),'max':round(max(winds),1)},
        'humidity':{'avg':round(sum(humids)/len(humids),1)},
        'rain':{'avg':round(sum(rains)/len(rains),1),'max':round(max(rains),1),
            'rainy_wards':len([r for r in rains if r>1])},
        'updated':c.get('updated',datetime.now(timezone.utc).isoformat())})

@app.route('/api/sms_subscribe', methods=['POST'])
def sms_subscribe():
    data = request.json
    if not data or not data.get('phone'):
        return jsonify({'status':'error','message':'Thiếu số điện thoại'}), 400
    phone = data.get('phone','').strip()
    opts = data.get('options',[])
    print(f"[SMS] {phone} | {opts} | {datetime.now().strftime('%H:%M:%S')}")
    return jsonify({'status':'success',
        'message':f'Đăng ký thành công SĐT {phone}. Nhận cảnh báo: {", ".join(opts) or "tất cả"}.'})

@app.route('/')
def index():
    with cache_lock:
        c, ct = cache, cache_time
    age = int(time.time()-ct) if ct else 'N/A'
    count = len(c.get('data',[])) if c else 0
    return f'<h3>AeroCast API ● {count} wards · cache {age}s · <a href="/health">/health</a></h3>'

if __name__ == '__main__':
    print("🌤️  AeroCast API — http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)