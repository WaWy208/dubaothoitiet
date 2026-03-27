import requests
import json
import sys
from datetime import datetime

API_KEY = '7f318ae139397881686e5acd8dce296c'
CITIES = [
    'Ca Mau,VN', 'Bac Lieu,VN', 'U Minh,VN', 'Thoi Binh,VN', 'Tran Van Thoi,VN',
    'Cai Nuoc,VN', 'Dam Doi,VN', 'Nam Can,VN', 'Phu Tan,VN', 'Ngoc Hien,VN'
]

def get_weather(city):
    url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={API_KEY}&units=metric"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return {
                'city': data['name'],
                'temp': round(data['main']['temp']),
                'feels': round(data['main']['feels_like']),
                'rain': data.get('rain', {}).get('1h', 0) or 0,
                'humidity': data['main']['humidity'],
                'wind': data['wind']['speed'],
                'desc': data['weather'][0]['description'].title(),
                'updated': datetime.now().strftime('%H:%M %d/%m')
            }
        return None
    except:
        return None

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    results = []
    for city in CITIES:
        data = get_weather(city)
        if data:
            results.append(data)
    
    print(json.dumps({
        'status': 'success',
        'data': results,
        'count': len(results)
    }))
