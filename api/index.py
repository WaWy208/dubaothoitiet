from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)

def init_db():
    conn_str = os.environ.get('POSTGRES_URL')
    if not conn_str: return
    try:
        conn = psycopg2.connect(conn_str)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS weather_history (
                id SERIAL PRIMARY KEY,
                location_name VARCHAR(255) NOT NULL,
                temperature FLOAT,
                humidity INT,
                rainfall FLOAT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Database init error: {e}")

def get_db_connection():
    # Tự động khởi tạo bảng nếu chưa có
    init_db()
    
    conn_str = os.environ.get('POSTGRES_URL')
    if not conn_str:
        return psycopg2.connect(
            host="localhost",
            user="postgres",
            password="",
            database="weather_db"
        )
    return psycopg2.connect(conn_str)

@app.route('/api/weather', methods=['POST'])
def save_weather():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        sql = """INSERT INTO weather_history 
                 (location_name, temperature, humidity, rainfall) 
                 VALUES (%s, %s, %s, %s)"""
        val = (
            data.get('location', 'Unknown'),
            data.get('temperature', 0),
            data.get('humidity', 0),
            data.get('rainfall', 0)
        )
        
        cursor.execute(sql, val)
        conn.commit()
        
        cursor.close()
        conn.close()
        return jsonify({"message": "Data saved successfully"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

import vercel_blob
import json

@app.route('/api/save-report', methods=['POST'])
def save_report():
    data = request.json
    try:
        # Lấy ngày hiện tại để đặt tên file
        date_str = datetime.now().strftime('%Y-%m-%d')
        filename = f"weather_report_{date_str}.json"
        
        # Chuyển dữ liệu sang dạng binary
        content = json.dumps(data, indent=2).encode('utf-8')
        
        # Lưu vào Vercel Blob
        # Token tự động được lấy từ biến môi trường BLOB_READ_WRITE_TOKEN
        resp = vercel_blob.put(filename, content, options={'access': 'public'})
        
        return jsonify({"message": "Report saved to Blob", "url": resp['url']}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    period = request.args.get('period', 'week')
    
    try:
        conn = get_db_connection()
        # RealDictCursor helps return rows as dictionaries similar to MySQL dictionary=True
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        interval = '7 days' if period == 'week' else '30 days'
        sql = f"""
            SELECT 
                recorded_at::date as date,
                AVG(temperature) as avg_temp,
                AVG(humidity) as avg_hum,
                SUM(rainfall) as total_rain
            FROM weather_history
            WHERE recorded_at >= (NOW() - INTERVAL '{interval}')
            GROUP BY recorded_at::date
            ORDER BY date ASC
        """
            
        cursor.execute(sql)
        records = cursor.fetchall()
        
        # Convert date objects to string for JSON
        for r in records:
            r['date'] = r['date'].strftime('%Y-%m-%d')
            
        cursor.close()
        conn.close()
        return jsonify(records), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/raw-data', methods=['GET'])
def get_raw_data():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Lấy 50 bản ghi mới nhất
        sql = """
            SELECT recorded_at, location_name, temperature, humidity, rainfall 
            FROM weather_history 
            ORDER BY recorded_at DESC 
            LIMIT 50
        """
        cursor.execute(sql)
        records = cursor.fetchall()
        
        for r in records:
            r['recorded_at'] = r['recorded_at'].strftime('%Y-%m-%d %H:%M:%S')
            
        cursor.close()
        conn.close()
        return jsonify(records), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Required for Vercel
app.debug = False

if __name__ == '__main__':
    app.run()
