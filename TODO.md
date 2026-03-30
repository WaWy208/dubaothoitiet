# Weather App Enhancement TODO
Approved Plan: Realistic Earth globe (Three.js), full GPS integration, 24h data, farmer alerts CRUD, UI optimizations, remove SMS/CSV.

## Steps (Complete as done, strike-through when finished)

### 1. Create wards_coords.json [x]
   - Extract WARDS_DATA from script.js to JSON for backend.

### 2. Update script.js - Globe [x]
   - Add Three.js CDN.
   - Replace init3DEarth() with realistic textured rotating Earth (NASA texture).
   - Mouse/touch rotate, GPS highlight.

### 3. Enhance GPS & OWM One Call [ ]
   - initGPSButton(): Fetch OWM One Call at exact GPS coords (24h hourly/details).
   - Fallback nearest ward.
   - Update all renders to use GPS data.

### 4. Extend 24h Hourly & Temp Chart [ ]
   - renderHourly(): 24 today items.
   - renderDailyChart(): Full 24h.

### 5. New Farmer/Civilian Alerts CRUD [ ]
   - localStorage list (add/delete).
   - UI container near top-bar.
   - Auto-generate: rain>5mm -> "Nhớ áo mưa", UV>6 -> "Kem chống nắng".

### 6. Optimize Location Search [ ]
   - Autocomplete, dist to GPS.

### 7. Details/Radar/Sun-Tide-Hydro GPS-Driven [ ]
   - Hydro: Sort by GPS dist, real-ish data.
   - Radar: GPS center.
   - Tide: Enhance mock/chart.

### 8. Themes/UI Polish & Removals [ ]
   - Smooth theme switch.
   - Remove SMS (initSMSModal/HTML), CSV (exportCSV).

### 9. Backend Proxy for GPS One Call [ ]
   - server.py: /gps/:lat/:lon -> OWM One Call.
   - real_time_weather.py: Support.

### 10. Test & Complete [ ]
   - python server.py
   - GPS test, globe rotate, 24h charts, alerts CRUD.

**Progress: 2/10** | Next: Step 3

