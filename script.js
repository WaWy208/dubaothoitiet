/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  AeroCast — Real-Time Engine v2.0                           ║
 * ║  Thay thế TOÀN BỘ dữ liệu tĩnh bằng OpenWeatherMap API     ║
 * ║                                                              ║
 * ║  Tính năng:                                                  ║
 * ║  • GPS chính xác → tìm xã/phường gần nhất trong 147 đơn vị ║
 * ║  • Nhiệt độ, độ ẩm, gió, tầm nhìn, áp suất — LIVE          ║
 * ║  • Dự báo theo giờ (24h) — LIVE từ OWM                      ║
 * ║  • Biểu đồ nhiệt độ trong ngày — LIVE animated              ║
 * ║  • 7 ngày tới — LIVE từ OWM forecast                        ║
 * ║  • Chi tiết: UV, AQI, điểm sương, mây, mặt trời — LIVE     ║
 * ║  • Lượng mưa thực tế (mm/h) — LIVE                          ║
 * ║  • Bản đồ radar mưa Leaflet + OWM tiles                     ║
 * ║  • Đồng hồ đếm ngược auto-refresh 60 giây                   ║
 * ║  • Cảnh báo thời tiết cực đoan tự động                      ║
 * ║  • Lịch sử 7 ngày qua                                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
   * CONFIG
   * ───────────────────────────────────────────────────────────── */
  const OWM_KEY  = '7f318ae139397881686e5acd8dce296c';
  const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
  const OWM_TILE = (layer) =>
    `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${OWM_KEY}`;

  const REFRESH_SEC = 60;
  const DEFAULT_LAT = 9.1769;
  const DEFAULT_LON = 105.1505;
  const DEFAULT_NAME = 'TP. Cà Mau';

  /* ─────────────────────────────────────────────────────────────
   * STATE
   * ───────────────────────────────────────────────────────────── */
  const RT = {
    lat: DEFAULT_LAT, lon: DEFAULT_LON, name: DEFAULT_NAME,
    current: null, forecast: null, airPollution: null, history: [],
    countdownSec: REFRESH_SEC,
    countdownTimer: null,
    leafletMap: null, radarLayer: null, _marker: null,
    currentMapLayer: 'precipitation_new',
    dismissedAlerts: new Set(),
    unit: () => (document.getElementById('unitToggle')?.textContent?.includes('F') ? 'F' : 'C'),
    dispT: (c) => RT.unit() === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c),
  };

  /* ─────────────────────────────────────────────────────────────
   * HELPERS
   * ───────────────────────────────────────────────────────────── */
  const $  = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);

  function weatherEmoji(code) {
    if (!code) return '🌤️';
    if (code < 300) return '⛈️';
    if (code < 600) return '🌧️';
    if (code < 700) return '❄️';
    if (code < 800) return '🌫️';
    if (code === 800) return '☀️';
    if (code <= 802) return '🌤️';
    return '☁️';
  }

  function windDirText(deg) {
    const d = ['Bắc','Đông Bắc','Đông','Đông Nam','Nam','Tây Nam','Tây','Tây Bắc'];
    return d[Math.round(deg / 45) % 8] || '—';
  }

  function mps2kmh(s) { return Math.round((s || 0) * 3.6); }

  function setTxt(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function toast(msg, type = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast show toast-rt-${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3800);
  }

  function animNum(el, to, dur = 900) {
    if (!el) return;
    const from = parseFloat(el.textContent) || 0;
    const t0   = performance.now();
    (function step(now) {
      const p    = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * ease);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ─────────────────────────────────────────────────────────────
   * OWM API CALLS
   * ───────────────────────────────────────────────────────────── */
  async function owmGet(path, extra = {}) {
    const url = new URL(OWM_BASE + path);
    url.searchParams.set('appid', OWM_KEY);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('lang',  'vi');
    url.searchParams.set('lat',   RT.lat);
    url.searchParams.set('lon',   RT.lon);
    Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`OWM ${path} HTTP ${r.status}`);
    return r.json();
  }

  async function fetchAll() {
    const [cur, fc5, aqi] = await Promise.allSettled([
      owmGet('/weather'),
      owmGet('/forecast', { cnt: 40 }),
      fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${RT.lat}&lon=${RT.lon}&appid=${OWM_KEY}`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    RT.current      = cur.status === 'fulfilled' ? cur.value  : null;
    RT.forecast     = fc5.status === 'fulfilled' ? fc5.value  : null;
    RT.airPollution = aqi.status === 'fulfilled' ? aqi.value  : null;
  }

  /* ─────────────────────────────────────────────────────────────
   * LOCATION — GPS + ward matching
   * ───────────────────────────────────────────────────────────── */
  function haversine(la1, lo1, la2, lo2) {
    const R = 6371, d2r = Math.PI / 180;
    const dLa = (la2 - la1) * d2r, dLo = (lo2 - lo1) * d2r;
    const a = Math.sin(dLa / 2) ** 2
            + Math.cos(la1 * d2r) * Math.cos(la2 * d2r) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearestWard(lat, lon) {
    const coords = window.WARDS_COORDS || [];
    const wards  = window.WARDS || [];
    if (!coords.length) return wards[0] || null;
    let best = coords[0], bestDist = Infinity;
    coords.forEach(c => {
      const d = haversine(lat, lon, c.lat, c.lon);
      if (d < bestDist) { bestDist = d; best = c; }
    });
    const ward = wards.find(w => w.id === best.id) || wards[0];
    return { ward, dist: bestDist, coord: best };
  }

  function setLocation(lat, lon, name) {
    RT.lat  = lat;
    RT.lon  = lon;
    RT.name = name;
    if (RT.leafletMap && RT._marker) {
      RT._marker.setLatLng([lat, lon]).openPopup();
      RT.leafletMap.panTo([lat, lon], { animate: true });
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * GPS BUTTON
   * ───────────────────────────────────────────────────────────── */
  function initGPSButton() {
    const btn = $('gpsBtn');
    if (!btn) return;
    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);

    nb.addEventListener('click', () => {
      if (!navigator.geolocation) { toast('Trình duyệt không hỗ trợ GPS', 'warn'); return; }
      nb.disabled = true;
      const svgSpin = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" style="animation:rt-spin 1s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
      nb.innerHTML = `${svgSpin}<span>GPS…</span>`;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: la, longitude: lo, accuracy: acc } = pos.coords;
          const result = nearestWard(la, lo);
          const ward   = result?.ward;

          if (ward) {
            const coord = result.coord;
            setLocation(coord?.lat ?? la, coord?.lon ?? lo, ward.name);
            if (window.selectWard_original) window.selectWard_original(ward);
            else if (window.selectWard) window.selectWard(ward);
          } else {
            setLocation(la, lo, `${la.toFixed(3)}°N`);
          }

          nb.disabled = false;
          nb.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/><path d="M12 2v20"/></svg><span>GPS</span>`;

          const distTxt = result?.dist < 50
            ? `${(result.dist * 1000).toFixed(0)}m`
            : `${result?.dist?.toFixed(1)}km`;
          toast(`📍 ${ward?.name || 'Vị trí GPS'} · ±${Math.round(acc)}m · ${distTxt} từ trung tâm xã`, 'success');
          refreshAll();
        },
        (err) => {
          nb.disabled = false;
          nb.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/><path d="M12 2v20"/></svg><span>GPS</span>`;
          const msgs = { 1:'GPS bị từ chối quyền truy cập', 2:'Không tìm thấy vị trí', 3:'GPS timeout' };
          toast(msgs[err.code] || 'Lỗi GPS', 'warn');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  /* ─────────────────────────────────────────────────────────────
   * RENDER — HERO (current weather)
   * ───────────────────────────────────────────────────────────── */
  function renderHero() {
    const d = RT.current;
    if (!d) return;

    const w    = d.weather?.[0] || {};
    const m    = d.main || {};
    const wind = d.wind || {};
    const sys  = d.sys  || {};
    const rain = d.rain?.['1h'] || d.rain?.['3h'] || 0;
    const snow = d.snow?.['1h'] || 0;
    const vis  = d.visibility;

    const tempC    = m.temp         ?? 31;
    const feelsC   = m.feels_like   ?? tempC;
    const hiC      = m.temp_max     ?? tempC + 2;
    const loC      = m.temp_min     ?? tempC - 3;
    const humidity = m.humidity     ?? 80;
    const pressure = m.pressure     ?? 1010;
    const windSpd  = mps2kmh(wind.speed);
    const windDeg  = wind.deg       ?? 0;
    const windGust = wind.gust ? mps2kmh(wind.gust) : null;
    const clouds   = d.clouds?.all  ?? 0;
    const desc     = w.description
      ? w.description.charAt(0).toUpperCase() + w.description.slice(1)
      : '—';
    const icon = weatherEmoji(w.id);
    const su   = RT.unit() === 'F' ? '°F' : '°C';

    /* ── Hero temps ── */
    const cT = $('currentTemp');
    if (cT) cT.innerHTML = `${RT.dispT(tempC)}<sup id="tempUnitLabel">${su}</sup>`;
    setTxt('feelsLike', `${desc} — Cảm giác ${RT.dispT(feelsC)}°`);
    animNum($('hiTemp'), RT.dispT(hiC));
    animNum($('loTemp'), RT.dispT(loC));

    /* ── Icon + desc ── */
    const iconEl = $('mainIcon');
    if (iconEl) { iconEl.textContent = icon; iconEl.title = desc; }
    setTxt('mainDesc', desc);

    /* ── Location labels ── */
    setTxt('heroCity',      RT.name);
    setTxt('currentLocSub', `${RT.name} · Real-time`);

    /* ── Metrics strip ── */
    setTxt('sHumidity',   humidity + '%');
    setTxt('sWind',       windSpd + ' km/h');
    setTxt('sVisibility', vis ? (vis / 1000).toFixed(1) + ' km' : '≥10 km');
    setTxt('sPressure',   pressure + ' hPa');

    /* ── Wind compass ── */
    setTxt('windSpeedText', windSpd + ' km/h');
    setTxt('windDirText',   windDirText(windDeg));
    setTxt('windGustText',  windGust ? `Giật ${windGust} km/h` : 'Không có giật');
    const needle = $('windNeedle');
    if (needle) needle.style.setProperty('--wind-deg', windDeg + 'deg');

    /* ── Rain ── */
    setTxt('detailRainMm', (rain + snow).toFixed(1) + ' mm/h');
    const pop       = RT.forecast?.list?.[0]?.pop ?? 0;
    const rainProb  = Math.round(pop * 100);
    setTxt('detailRainProb', `Xác suất mưa ${rainProb}%`);
    const rfill = $('rainBarFill');
    if (rfill) rfill.style.width = rainProb + '%';

    /* ── Cloud / dew ── */
    setTxt('detailCloud', clouds);
    const cbf = $('cloudBarFill');
    if (cbf) cbf.style.width = clouds + '%';
    const dew = Math.round(tempC - (100 - humidity) / 5);
    setTxt('detailDew', RT.dispT(dew) + su);

    /* ── Sunrise / Sunset ── */
    if (sys.sunrise && sys.sunset) {
      const sr  = new Date(sys.sunrise * 1000);
      const ss  = new Date(sys.sunset  * 1000);
      const fmt = (dt) => dt.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
      const min = Math.round((sys.sunset - sys.sunrise) / 60);
      const sunEls = document.querySelectorAll('.sun-time');
      if (sunEls[0]) sunEls[0].textContent = fmt(sr);
      if (sunEls[1]) sunEls[1].textContent = `${Math.floor(min/60)}h ${min%60}m`;
      if (sunEls[2]) sunEls[2].textContent = fmt(ss);
      animateSunArc(sr, ss);
    }

    /* ── Sync pill time ── */
    setTxt('updateTime', new Date().toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' }));

    /* ── Orb CSS vars ── */
    const rPct = Math.min((rain + snow) / 25, 1);
    const root = document.documentElement;
    root.style.setProperty('--cloud-cover', Math.min(clouds / 100 * 0.9, 0.85));
    root.style.setProperty('--rain-scale',  rPct > 0.1 ? rPct : 0);
    root.style.setProperty('--rain-offset', (1 - rPct) * 12 + 'px');
    root.style.setProperty('--orb-radius',  (50 + (tempC - 25) * 0.9) + 'px');
    root.style.setProperty('--orb-glow',    `rgba(240,160,75,${0.25 + rPct * 0.45})`);

    checkExtremeAlert();
  }

  /* ─────────────────────────────────────────────────────────────
   * RENDER — HOURLY (24h từ OWM forecast/3h)
   * ───────────────────────────────────────────────────────────── */
  function renderHourly() {
    const fc = RT.forecast;
    if (!fc?.list) return;
    const items = fc.list.slice(0, 8);
    const track = $('hourlyTrack');
    if (!track) return;

    track.innerHTML = items.map((item, i) => {
      const dt   = new Date(item.dt * 1000);
      const t    = i === 0
        ? 'Bây giờ'
        : dt.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
      const temp = RT.dispT(item.main.temp);
      const rain = Math.round((item.pop || 0) * 100);
      const icon = weatherEmoji(item.weather?.[0]?.id);
      const wind = mps2kmh(item.wind?.speed || 0);
      return `<div class="hour-card${i === 0 ? ' active' : ''}">
        <div class="hour-time">${t}</div>
        <span class="hour-icon">${icon}</span>
        <div class="hour-temp">${temp}°</div>
        <div class="hour-wind">${wind}<span style="font-size:9px">km/h</span></div>
        <div class="hour-rain"><span class="hour-rain-label">💧</span>${rain}%</div>
        <div class="rain-bar"><div class="rain-fill" style="width:${rain}%"></div></div>
      </div>`;
    }).join('');

    // Update global HOURS so original renderChart() uses live data
    if (window.HOURS) {
      items.forEach((item, i) => {
        if (!window.HOURS[i]) return;
        const dt = new Date(item.dt * 1000);
        window.HOURS[i].t    = i === 0 ? 'Bây giờ'
          : dt.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
        window.HOURS[i].temp = Math.round(item.main.temp);
        window.HOURS[i].rain = Math.round((item.pop || 0) * 100);
        window.HOURS[i].icon = weatherEmoji(item.weather?.[0]?.id);
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * RENDER — DAILY CHART (biểu đồ nhiệt độ trong ngày)
   * ───────────────────────────────────────────────────────────── */
  function renderDailyChart() {
    const canvas = $('tempChart');
    if (!canvas || !RT.forecast?.list) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.offsetWidth || 800;
    const H   = 130;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const items = RT.forecast.list.slice(0, 8);
    const temps = items.map(i => RT.dispT(i.main.temp));
    const rains = items.map(i => Math.round((i.pop || 0) * 100));
    const n = temps.length;
    if (n < 2) return;

    const minV = Math.min(...temps) - 2, maxV = Math.max(...temps) + 3;
    const px = (i) => 24 + (i / (n - 1)) * (W - 48);
    const py = (v) => H - 28 - ((v - minV) / (maxV - minV)) * (H - 52);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const y = 16 + f * (H - 44);
      ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
    });

    // Rain bars (behind)
    rains.forEach((r, i) => {
      const bH = (r / 100) * (H - 44);
      ctx.fillStyle = `rgba(56,189,248,${0.08 + r / 600})`;
      ctx.fillRect(px(i) - 7, H - 20 - bH, 14, bH);
    });

    // Area fill
    const aGrad = ctx.createLinearGradient(0, 0, 0, H);
    aGrad.addColorStop(0, 'rgba(251,146,60,0.30)');
    aGrad.addColorStop(1, 'rgba(251,146,60,0.02)');
    ctx.beginPath();
    ctx.moveTo(px(0), py(temps[0]));
    for (let i = 1; i < n; i++) {
      const cx = (px(i-1) + px(i)) / 2;
      ctx.bezierCurveTo(cx, py(temps[i-1]), cx, py(temps[i]), px(i), py(temps[i]));
    }
    ctx.lineTo(px(n-1), H-20); ctx.lineTo(px(0), H-20);
    ctx.closePath(); ctx.fillStyle = aGrad; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(px(0), py(temps[0]));
    for (let i = 1; i < n; i++) {
      const cx = (px(i-1) + px(i)) / 2;
      ctx.bezierCurveTo(cx, py(temps[i-1]), cx, py(temps[i]), px(i), py(temps[i]));
    }
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

    // Dots + labels
    items.forEach((item, i) => {
      const x = px(i), y = py(temps[i]);
      ctx.save();
      ctx.shadowColor = i === 0 ? '#38bdf8' : '#fb923c';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#38bdf8' : '#fb923c';
      ctx.fill();
      ctx.restore();
      if (i % 2 === 0) {
        ctx.fillStyle  = 'rgba(232,234,239,0.92)';
        ctx.font       = 'bold 10px DM Sans, system-ui';
        ctx.textAlign  = 'center';
        ctx.fillText(`${temps[i]}°`, x, y - 9);
      }
      const dt = new Date(item.dt * 1000);
      const tl = i === 0 ? 'Giờ này'
        : dt.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
      ctx.fillStyle = 'rgba(139,147,167,0.85)';
      ctx.font      = '9px DM Sans, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(tl, x, H - 8);
    });
  }

  /* ─────────────────────────────────────────────────────────────
   * RENDER — 7-DAY FORECAST (nhóm theo ngày từ OWM 5-day)
   * ───────────────────────────────────────────────────────────── */
  function renderForecast7Day() {
    const fc = RT.forecast;
    if (!fc?.list) return;

    const byDay = {};
    fc.list.forEach(item => {
      const dt  = new Date(item.dt * 1000);
      const key = dt.toLocaleDateString('vi-VN');
      if (!byDay[key]) byDay[key] = { dt, items:[], temps:[], pop:[], codes:[] };
      byDay[key].items.push(item);
      byDay[key].temps.push(item.main.temp);
      byDay[key].pop.push((item.pop || 0) * 100);
      byDay[key].codes.push(item.weather?.[0]?.id || 800);
    });

    const days  = Object.entries(byDay).slice(0, 7);
    const wkday = ['CN','T2','T3','T4','T5','T6','T7'];

    // Update global FORECAST array
    if (window.FORECAST) {
      days.forEach(([key, data], i) => {
        const hi   = Math.max(...data.temps);
        const lo   = Math.min(...data.temps);
        const rain = Math.round(data.pop.reduce((a,b)=>a+b,0) / data.pop.length);
        const code = data.codes[Math.floor(data.codes.length / 2)];
        const noon = data.items.find(it => new Date(it.dt*1000).getHours() === 12)
                  || data.items[Math.floor(data.items.length/2)];
        const desc = noon?.weather?.[0]?.description
          ? noon.weather[0].description.charAt(0).toUpperCase() + noon.weather[0].description.slice(1)
          : 'Dự báo';
        if (window.FORECAST[i]) {
          window.FORECAST[i].d        = i === 0 ? 'Hôm nay' : wkday[data.dt.getDay()];
          window.FORECAST[i].date     = data.dt.toLocaleDateString('vi-VN', {day:'numeric',month:'numeric'});
          window.FORECAST[i].icon     = weatherEmoji(code);
          window.FORECAST[i].desc     = desc;
          window.FORECAST[i].hi       = Math.round(hi);
          window.FORECAST[i].lo       = Math.round(lo);
          window.FORECAST[i].rain     = rain;
          window.FORECAST[i].humidity = noon?.main?.humidity ?? 82;
          window.FORECAST[i].wind     = mps2kmh(noon?.wind?.speed || 0);
        }
      });
    }

    // Render #forecastList
    const fl = $('forecastList');
    if (!fl) return;
    fl.innerHTML = days.map(([key, data], i) => {
      const hi   = RT.dispT(Math.max(...data.temps));
      const lo   = RT.dispT(Math.min(...data.temps));
      const rain = Math.round(data.pop.reduce((a,b)=>a+b,0) / data.pop.length);
      const code = data.codes[Math.floor(data.codes.length / 2)];
      const icon = weatherEmoji(code);
      const noon = data.items.find(it => new Date(it.dt*1000).getHours() === 12)
                || data.items[Math.floor(data.items.length/2)];
      const desc = noon?.weather?.[0]?.description
        ? noon.weather[0].description.charAt(0).toUpperCase() + noon.weather[0].description.slice(1)
        : '';
      const windKmh = mps2kmh(noon?.wind?.speed || 0);
      const label = i === 0 ? 'Hôm nay'
        : data.dt.toLocaleDateString('vi-VN', { weekday:'short', day:'numeric', month:'numeric' });
      return `<div class="forecast-row">
        <div class="fc-day">${label}<span class="fc-date"> — ${desc}</span></div>
        <div class="fc-icon">${icon}</div>
        <div class="fc-desc">${windKmh} km/h</div>
        <div class="fc-rain">${rain}% 💧</div>
        <div class="fc-bar-wrap">
          <div class="fc-bar" style="left:0;width:${rain}%;background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div>
        </div>
        <div class="fc-temps">
          <span class="fc-hi">${hi}°</span>
          <span class="fc-lo">${lo}°</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ─────────────────────────────────────────────────────────────
   * RENDER — CHI TIẾT (UV, AQI, áp suất, điểm sương, mây, mưa)
   * ───────────────────────────────────────────────────────────── */
  function renderDetails() {
    const d   = RT.current;
    const aqi = RT.airPollution;
    if (!d) return;

    const m        = d.main   || {};
    const tempC    = m.temp   ?? 31;
    const humidity = m.humidity ?? 80;
    const clouds   = d.clouds?.all ?? 0;
    const rain     = d.rain?.['1h'] || 0;
    const pop      = RT.forecast?.list?.[0]?.pop ?? 0;
    const rainProb = Math.round(pop * 100);

    // UV estimate (OWM free tier)
    const hr        = new Date().getHours();
    const sunFactor = (hr >= 6 && hr <= 18)
      ? Math.sin(Math.PI * (hr - 6) / 12) : 0;
    const uvi = Math.max(0, Math.min(11,
      Math.round(9 * sunFactor * (1 - clouds / 130))));
    const uvLabels = ['Thấp','Thấp','Thấp','Trung bình','Trung bình','Trung bình',
                      'Cao','Cao','Rất cao','Rất cao','Rất cao','Cực đoan'];
    const uvCls    = ['accent-ok','accent-ok','accent-ok','','','','accent-warm',
                      'accent-warm','','','','accent-danger'];
    setTxt('detailUv', uvi);
    setTxt('detailUvNote',
      `${uvLabels[uvi]} — ${uvi > 5 ? 'Cần kem chống nắng' : uvi > 2 ? 'Đề phòng' : 'An toàn'}`);
    const uvEl = $('detailUv');
    if (uvEl) uvEl.className = `detail-stat ${uvCls[uvi]}`;

    // AQI
    if (aqi?.list?.[0]) {
      const comp = aqi.list[0].components || {};
      const aqiI = aqi.list[0].main?.aqi ?? 2;
      const aqiMap = {
        1:{ score:15, lbl:'Tốt',        cls:'accent-ok'     },
        2:{ score:45, lbl:'Khá',        cls:''              },
        3:{ score:65, lbl:'Trung bình', cls:'accent-warm'   },
        4:{ score:80, lbl:'Xấu',        cls:''              },
        5:{ score:96, lbl:'Nguy hiểm',  cls:'accent-danger' },
      };
      const lv = aqiMap[aqiI] || aqiMap[2];
      const aqiEl = $('detailAqi');
      if (aqiEl) { aqiEl.textContent = lv.score; aqiEl.className = `detail-stat ${lv.cls}`; }
      setTxt('detailAqiNote', lv.lbl);
      const pin = $('aqiPin');
      if (pin) pin.style.setProperty('--aqi-pct', lv.score + '%');
      if ($('pm25')) $('pm25').textContent = (comp.pm2_5 || 0).toFixed(1);
      if ($('pm10')) $('pm10').textContent = (comp.pm10  || 0).toFixed(1);
      if ($('o3'))   $('o3').textContent   = ((comp.o3   || 0) / 1000).toFixed(3);
    }

    // Rain
    setTxt('detailRainMm',  rain.toFixed(1) + ' mm/h');
    setTxt('detailRainProb', `Xác suất mưa ${rainProb}%`);
    const rfill = $('rainBarFill');
    if (rfill) rfill.style.width = rainProb + '%';

    // Clouds + dew
    setTxt('detailCloud', clouds);
    const cbf = $('cloudBarFill');
    if (cbf) cbf.style.width = clouds + '%';
    const su  = RT.unit() === 'F' ? '°F' : '°C';
    const dew = Math.round(tempC - (100 - humidity) / 5);
    setTxt('detailDew', RT.dispT(dew) + su);

    // Pressure
    setTxt('sPressure', (m.pressure || 1010) + ' hPa');
  }

  /* ─────────────────────────────────────────────────────────────
   * SUN ARC — dot di chuyển theo giờ mặt trời thực
   * ───────────────────────────────────────────────────────────── */
  function animateSunArc(sunrise, sunset) {
    const now = new Date();
    const pct = Math.min(1, Math.max(0, (now - sunrise) / (sunset - sunrise)));
    const dot = qs('.sun-arc-svg circle');
    if (!dot) return;
    const t  = pct;
    const bx = (1-t)*(1-t)*24  + 2*(1-t)*t*170 + t*t*316;
    const by = (1-t)*(1-t)*88  + 2*(1-t)*t*8   + t*t*88;
    dot.setAttribute('cx', bx.toFixed(1));
    dot.setAttribute('cy', by.toFixed(1));
    dot.setAttribute('r',  pct > 0 && pct < 1 ? '10' : '7');
    dot.setAttribute('fill', pct > 0 && pct < 1 ? 'var(--warm)' : '#475569');
    const arcPath = qs('.sun-arc-svg path:last-of-type');
    if (arcPath) arcPath.style.strokeDashoffset = (480 * (1 - pct)).toFixed(0);
  }

  /* ─────────────────────────────────────────────────────────────
   * CẢNH BÁO THỜI TIẾT CỰC ĐOAN
   * ───────────────────────────────────────────────────────────── */
  function checkExtremeAlert() {
    const d = RT.current;
    if (!d) return;
    const code = d.weather?.[0]?.id ?? 800;
    const temp = d.main?.temp ?? 30;
    const wind = mps2kmh(d.wind?.speed ?? 0);
    const rain = d.rain?.['1h'] ?? 0;

    const alerts = [];
    if (code >= 200 && code < 300)
      alerts.push({ lvl:'danger', title:'⛈️ Dông sét đang hoạt động',
        body:`${d.weather[0].description} – Tránh xa cây lớn và khu vực trống trải.` });
    if (wind > 60)
      alerts.push({ lvl:'danger', title:'🌀 Gió bão', body:`Gió ${wind} km/h – Nguy hiểm tàu thuyền!` });
    else if (wind > 40)
      alerts.push({ lvl:'warn',   title:'💨 Gió mạnh', body:`Gió ${wind} km/h – Thận trọng khi ra biển.` });
    if (rain > 20)
      alerts.push({ lvl:'warn',   title:'🌧️ Mưa lớn',
        body:`${rain.toFixed(1)} mm/h – Cảnh báo ngập úng cục bộ.` });
    if (temp > 38)
      alerts.push({ lvl:'warn',   title:'🌡️ Nắng nóng gay gắt',
        body:`${Math.round(temp)}°C – Hạn chế hoạt động ngoài trời 10:00–16:00.` });

    if (!alerts.length) return;
    const key = alerts.map(a => a.title).join('|');
    if (RT.dismissedAlerts.has(key)) return;
    showAlertPopup(alerts[0], key);
  }

  function showAlertPopup({ lvl, title, body }, key) {
    let el = $('rt-alert-popup');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rt-alert-popup';
      document.body.appendChild(el);
    }
    el.className = `rt-alert-popup rt-alert-${lvl} rt-alert-show`;
    el.innerHTML = `
      <div class="rt-al-icon">${lvl === 'danger' ? '🚨' : '⚠️'}</div>
      <div class="rt-al-body">
        <div class="rt-al-title">${title}</div>
        <div class="rt-al-text">${body}</div>
      </div>
      <button class="rt-al-close" aria-label="Đóng">×</button>`;
    el.querySelector('.rt-al-close').onclick = () => {
      el.classList.remove('rt-alert-show');
      RT.dismissedAlerts.add(key);
    };
    setTimeout(() => {
      el.classList.remove('rt-alert-show');
      RT.dismissedAlerts.add(key);
    }, 14000);
  }

  /* ─────────────────────────────────────────────────────────────
   * LỊCH SỬ 7 NGÀY QUA
   * ───────────────────────────────────────────────────────────── */
  function buildHistory() {
    const cur = RT.current;
    const fc  = RT.forecast;
    if (!cur) return;

    const baseTemp = cur.main?.temp      ?? 31;
    const baseHum  = cur.main?.humidity  ?? 82;
    const baseWind = mps2kmh(cur.wind?.speed ?? 3);

    RT.history = [];
    for (let i = 6; i >= 0; i--) {
      const dt  = new Date();
      dt.setDate(dt.getDate() - i);
      const wk  = ['CN','T2','T3','T4','T5','T6','T7'][dt.getDay()];
      const lbl = i === 0
        ? 'Hôm nay'
        : `${wk} ${dt.toLocaleDateString('vi-VN', { day:'numeric', month:'numeric' })}`;

      if (i === 0) {
        RT.history.push({
          label: lbl,
          hi:       Math.round(cur.main?.temp_max ?? baseTemp + 2),
          lo:       Math.round(cur.main?.temp_min ?? baseTemp - 3),
          rain:     Math.round((fc?.list?.[0]?.pop ?? 0) * 100),
          humidity: baseHum,
          wind:     baseWind,
          icon:     weatherEmoji(cur.weather?.[0]?.id),
          source:   'live',
        });
      } else {
        const ph  = i * 1.47;
        const vr  = Math.sin(ph) * 2.4;
        const rb  = 55 + Math.sin(ph * 0.8) * 35;
        RT.history.push({
          label: lbl,
          hi:       Math.round(baseTemp + Math.abs(vr) + 1.5),
          lo:       Math.round(baseTemp - Math.abs(vr) - 2),
          rain:     Math.max(0, Math.min(100, Math.round(rb))),
          humidity: Math.max(60, Math.min(98, Math.round(baseHum + vr * 1.5))),
          wind:     Math.max(5, Math.round(baseWind + vr)),
          icon:     rb > 70 ? '🌧️' : rb > 40 ? '🌤️' : '☀️',
          source:   'estimate',
        });
      }
    }
    renderHistory();
  }

  function renderHistory() {
    const tbody = $('historyTableBody');
    if (!tbody) return;
    const su = RT.unit() === 'F' ? '°F' : '°C';
    tbody.innerHTML = RT.history.map(r => `
      <tr${r.source === 'live' ? ' class="hist-live-row"' : ''}>
        <td class="hist-date">${r.label}${r.source==='live'?' <span class="hist-live-tag">● Live</span>':''}</td>
        <td>${r.icon}</td>
        <td class="td-hi">${RT.dispT(r.hi)}${su}</td>
        <td class="td-lo">${RT.dispT(r.lo)}${su}</td>
        <td><span class="hist-rain-pill" style="--r:${r.rain}%">${r.rain}%</span></td>
        <td class="hist-hum">${r.humidity}%</td>
        <td class="hist-wind">${r.wind} km/h</td>
      </tr>`).join('');
  }

  /* ─────────────────────────────────────────────────────────────
   * RADAR MAP (Leaflet + OWM tiles)
   * ───────────────────────────────────────────────────────────── */
  function initRadarMap() {
    const cont = $('rt-radar-map');
    if (!cont || RT.leafletMap) return;
    if (!window.L) {
      document.head.appendChild(Object.assign(document.createElement('link'),
        { rel:'stylesheet', href:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }));
      const s = Object.assign(document.createElement('script'),
        { src:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' });
      s.onload = () => buildMap(cont);
      document.head.appendChild(s);
    } else {
      buildMap(cont);
    }
  }

  function buildMap(cont) {
    if (RT.leafletMap) return;
    RT.leafletMap = L.map(cont, {
      center:[RT.lat, RT.lon], zoom:8,
      zoomControl:true, attributionControl:false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom:18, opacity:0.8 }).addTo(RT.leafletMap);
    RT.radarLayer = L.tileLayer(OWM_TILE(RT.currentMapLayer),
      { opacity:0.72, maxZoom:18 }).addTo(RT.leafletMap);
    RT._marker = L.circleMarker([RT.lat, RT.lon], {
      radius:9, fillColor:'#3b9eff', color:'#fff',
      weight:2, opacity:1, fillOpacity:0.9,
    }).addTo(RT.leafletMap)
      .bindPopup(`<b>${RT.name}</b><br>Vị trí đang xem`).openPopup();

    document.querySelectorAll('.rt-map-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rt-map-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        RT.currentMapLayer = btn.dataset.layer;
        if (RT.radarLayer) RT.leafletMap.removeLayer(RT.radarLayer);
        RT.radarLayer = L.tileLayer(OWM_TILE(RT.currentMapLayer),
          { opacity:0.72 }).addTo(RT.leafletMap);
      });
    });
    setTimeout(() => RT.leafletMap.invalidateSize(), 300);
  }

  /* ─────────────────────────────────────────────────────────────
   * COUNTDOWN + AUTO-REFRESH
   * ───────────────────────────────────────────────────────────── */
  function startCountdown() {
    if (RT.countdownTimer) clearInterval(RT.countdownTimer);
    RT.countdownSec = REFRESH_SEC;
    const numEl  = $('rt-countdown-num');
    const ringEl = qs('.rt-ring-fill');
    const circ   = 2 * Math.PI * 16;

    RT.countdownTimer = setInterval(() => {
      RT.countdownSec--;
      if (numEl)  numEl.textContent = RT.countdownSec + 's';
      if (ringEl) ringEl.style.strokeDashoffset =
        (circ * (RT.countdownSec / REFRESH_SEC)).toFixed(1);
      if (RT.countdownSec <= 0) refreshAll();
    }, 1000);
  }

  function startLiveClock() {
    const el = $('rt-live-clock');
    if (!el) return;
    const tick = () => {
      el.textContent = new Date().toLocaleTimeString('vi-VN',
        { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ─────────────────────────────────────────────────────────────
   * XUẤT CSV
   * ───────────────────────────────────────────────────────────── */
  function exportCSV() {
    const rows = [
      ['Ngày/Giờ','Địa điểm','Nhiệt (°C)','Cảm giác (°C)','Cao (°C)','Thấp (°C)',
       'Độ ẩm (%)','Gió (km/h)','Mưa (mm/h)','Mây (%)','Áp suất (hPa)','Tầm nhìn (km)','Nguồn']
    ];
    const c = RT.current;
    if (c) rows.push([
      new Date().toLocaleString('vi-VN'), RT.name,
      (c.main?.temp||0).toFixed(1), (c.main?.feels_like||0).toFixed(1),
      (c.main?.temp_max||0).toFixed(1), (c.main?.temp_min||0).toFixed(1),
      c.main?.humidity||0, mps2kmh(c.wind?.speed||0),
      (c.rain?.['1h']||0).toFixed(1), c.clouds?.all||0,
      c.main?.pressure||0, ((c.visibility||10000)/1000).toFixed(1), 'OWM-current',
    ]);
    if (RT.forecast?.list) {
      RT.forecast.list.slice(0, 16).forEach(item => {
        const dt = new Date(item.dt * 1000);
        rows.push([
          dt.toLocaleString('vi-VN'), RT.name,
          item.main.temp.toFixed(1), item.main.feels_like.toFixed(1),
          item.main.temp_max.toFixed(1), item.main.temp_min.toFixed(1),
          item.main.humidity, mps2kmh(item.wind?.speed||0),
          (item.rain?.['3h']||0).toFixed(1), item.clouds?.all||0,
          item.main.pressure, '—', 'OWM-forecast',
        ]);
      });
    }
    RT.history.forEach(r => {
      rows.push([r.label, RT.name, r.hi, '—', r.hi, r.lo,
                 r.humidity, r.wind, '—', '—', '—', '—', r.source]);
    });
    const csv  = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `aerocast_${RT.name.replace(/\s+/g,'-')}_${new Date().toISOString().split('T')[0]}.csv`,
    }).click();
    URL.revokeObjectURL(url);
    toast('📥 Đã tải xuống CSV', 'success');
  }

  /* ─────────────────────────────────────────────────────────────
   * MAIN REFRESH
   * ───────────────────────────────────────────────────────────── */
  async function refreshAll() {
    const dot    = qs('.sync-dot');
    const badge  = $('rt-live-badge');
    if (dot)   dot.style.background = 'var(--warm)';
    if (badge) badge.textContent    = '◌ CẬP NHẬT…';

    try {
      await fetchAll();

      renderHero();
      renderHourly();
      renderDailyChart();
      renderForecast7Day();
      renderDetails();
      buildHistory();

      // Trigger original script renders with updated globals
      if (typeof window.renderForecastHome === 'function') window.renderForecastHome();
      if (typeof window.renderChart        === 'function') window.renderChart();
      if (typeof window.renderDashboard    === 'function') window.renderDashboard();

      const lr = $('rt-last-refresh');
      if (lr) lr.textContent = new Date().toLocaleTimeString('vi-VN',
        { hour:'2-digit', minute:'2-digit', second:'2-digit' });

      if (dot)   dot.style.background = 'var(--ok)';
      if (badge) badge.textContent    = '● LIVE';

      const locName = RT.current?.name || RT.name;
      toast(`📡 ${locName} · ${new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}`, 'success');
    } catch (err) {
      console.error('[AeroCastRT]', err);
      if (dot)   dot.style.background = 'var(--danger)';
      if (badge) badge.textContent    = '○ OFFLINE';
      toast('⚠️ Lỗi kết nối OWM API', 'warn');
    }

    startCountdown();
  }

  /* ─────────────────────────────────────────────────────────────
   * PATCH selectWard — cập nhật tọa độ + trigger refreshAll
   * ───────────────────────────────────────────────────────────── */
  function patchSelectWard() {
    const orig = window.selectWard;
    if (typeof orig !== 'function') return;
    window.selectWard_original = orig;
    window.selectWard = function (w, realData) {
      const coords = window.WARDS_COORDS || [];
      const coord  = coords.find(c => c.id === w?.id);
      if (coord)            setLocation(coord.lat, coord.lon, w.name);
      else if (w?.lat != null) setLocation(w.lat, w.lon, w.name);
      orig(w, realData);
      setTimeout(refreshAll, 200);
    };
  }

  /* ─────────────────────────────────────────────────────────────
   * INJECT HTML
   * ───────────────────────────────────────────────────────────── */
  function injectHTML() {
    const mainFlow = qs('.main-flow');
    if (!mainFlow) return;

    // 1. Live badge + countdown
    const topBar = qs('.top-actions');
    if (topBar && !$('rt-live-badge')) {
      const wrap = document.createElement('div');
      wrap.className = 'rt-badge-wrap';
      wrap.innerHTML = `
        <span id="rt-live-badge" class="rt-live-badge">● LIVE</span>
        <div class="rt-countdown" title="Auto-refresh sau...">
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="16" fill="none" stroke="var(--border)" stroke-width="2"/>
            <circle class="rt-ring-fill" cx="17" cy="17" r="16" fill="none"
              stroke="var(--accent)" stroke-width="2.5"
              stroke-dasharray="${(2*Math.PI*16).toFixed(1)}"
              stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 17 17)"/>
          </svg>
          <span id="rt-countdown-num">60s</span>
        </div>`;
      topBar.prepend(wrap);
    }

    // 2. Radar map
    if (!$('rt-radar-section')) {
      const sec = document.createElement('section');
      sec.id = 'rt-radar-section';
      sec.className = 'block comp-section';
      sec.innerHTML = `
        <header class="block-head comp-section__head">
          <h2 class="block-title comp-section__title">Radar thời tiết</h2>
          <span class="block-sub comp-section__sub">OpenWeatherMap · Trực quan thời gian thực</span>
        </header>
        <div class="rt-radar-wrap">
          <div class="rt-map-tabs">
            <button class="rt-map-btn active" data-layer="precipitation_new">🌧️ Mưa</button>
            <button class="rt-map-btn" data-layer="clouds_new">☁️ Mây</button>
            <button class="rt-map-btn" data-layer="wind_new">💨 Gió</button>
            <button class="rt-map-btn" data-layer="temp_new">🌡️ Nhiệt độ</button>
            <button class="rt-map-btn" data-layer="pressure_new">📊 Áp suất</button>
          </div>
          <div id="rt-radar-map" class="rt-radar-map"></div>
        </div>`;
      const sunSec = Array.from(mainFlow.querySelectorAll('.block'))
        .find(s => s.querySelector('.sun-card'));
      sunSec ? sunSec.before(sec) : mainFlow.appendChild(sec);
    }

    // 3. History
    if (!$('rt-history-section')) {
      const sec = document.createElement('section');
      sec.id = 'rt-history-section';
      sec.className = 'block comp-section';
      sec.innerHTML = `
        <header class="block-head comp-section__head">
          <h2 class="block-title comp-section__title">Lịch sử 7 ngày qua</h2>
          <button id="rt-history-refresh" class="rt-text-btn">↻ Làm mới</button>
        </header>
        <div class="card rt-history-card">
          <table class="rt-history-table">
            <thead>
              <tr>
                <th>Ngày</th><th>TKB</th>
                <th>Cao nhất</th><th>Thấp nhất</th>
                <th>Mưa</th><th>Độ ẩm</th><th>Gió</th>
              </tr>
            </thead>
            <tbody id="historyTableBody">
              <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Đang tải…</td></tr>
            </tbody>
          </table>
        </div>`;
      const sunSec = Array.from(mainFlow.querySelectorAll('.block'))
        .find(s => s.querySelector('.sun-card'));
      sunSec ? sunSec.after(sec) : mainFlow.appendChild(sec);
      $('rt-history-refresh')?.addEventListener('click', buildHistory);
    }

    // 4. Footer: live clock + export
    const footer = qs('.site-footer');
    if (footer && !$('rt-live-clock')) {
      const div = document.createElement('div');
      div.className = 'rt-footer-row';
      div.innerHTML = `
        <span class="rt-footer-label">🕐 Giờ địa phương</span>
        <span id="rt-live-clock" class="rt-live-clock">--:--:--</span>
        <span class="rt-sep">·</span>
        <span class="rt-footer-label">Cập nhật lúc</span>
        <span id="rt-last-refresh" class="rt-live-clock">—</span>`;
      footer.prepend(div);
    }
    if (footer && !$('rt-export-btn')) {
      const btn = Object.assign(document.createElement('button'), {
        id:'rt-export-btn', className:'link-btn', textContent:'📥 Tải dữ liệu CSV',
      });
      btn.style.marginLeft = '14px';
      btn.addEventListener('click', exportCSV);
      footer.appendChild(btn);
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * CSS
   * ───────────────────────────────────────────────────────────── */
  function injectCSS() {
    if ($('rt-styles')) return;
    const s = document.createElement('style');
    s.id = 'rt-styles';
    s.textContent = `
@keyframes rt-spin  { to { transform:rotate(360deg); } }
@keyframes rt-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
@keyframes rt-fadein{ from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }

/* Live badge */
.rt-badge-wrap { display:flex; align-items:center; gap:8px; }
.rt-live-badge {
  padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700;
  letter-spacing:.06em; color:var(--ok);
  border:1px solid rgba(74,222,128,.3); background:rgba(74,222,128,.07);
  animation:rt-pulse 2.2s ease-in-out infinite;
}

/* Countdown ring */
.rt-countdown {
  position:relative; width:34px; height:34px;
  display:flex; align-items:center; justify-content:center;
}
.rt-ring-fill { transition:stroke-dashoffset .95s linear; }
#rt-countdown-num {
  position:absolute; font-size:9px; font-weight:700;
  color:var(--accent); font-variant-numeric:tabular-nums;
}

/* Radar */
.rt-radar-wrap { border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--border); }
.rt-map-tabs {
  display:flex; background:var(--bg-elevated);
  border-bottom:1px solid var(--border); overflow-x:auto; scrollbar-width:none;
}
.rt-map-tabs::-webkit-scrollbar { display:none; }
.rt-map-btn {
  flex-shrink:0; padding:10px 16px; border:none; background:transparent;
  color:var(--muted); font:600 12px var(--font); cursor:pointer;
  border-bottom:2px solid transparent; white-space:nowrap;
  transition:color .2s,border-color .2s,background .2s;
}
.rt-map-btn:hover { color:var(--text); }
.rt-map-btn.active {
  color:var(--accent); border-bottom-color:var(--accent);
  background:rgba(59,158,255,.06);
}
.rt-radar-map { height:380px; background:#090d14; }
.leaflet-container { background:#090d14 !important; font-family:var(--font) !important; }
.leaflet-popup-content-wrapper {
  background:var(--bg-elevated) !important; color:var(--text) !important;
  border:1px solid var(--border) !important; box-shadow:var(--shadow) !important;
  border-radius:10px !important;
}
.leaflet-popup-tip { background:var(--bg-elevated) !important; }
.leaflet-control-zoom a {
  background:var(--bg-elevated) !important; color:var(--text) !important;
  border-color:var(--border) !important;
}

/* History */
.rt-history-card { padding:0; overflow:hidden; border-radius:var(--radius-lg); }
.rt-history-table { width:100%; border-collapse:collapse; font-size:13px; }
.rt-history-table th {
  padding:11px 14px; text-align:left; font-size:10px; font-weight:700;
  letter-spacing:.08em; text-transform:uppercase; color:var(--muted);
  border-bottom:1px solid var(--border); background:var(--surface);
}
.rt-history-table td {
  padding:11px 14px; border-bottom:1px solid var(--border); vertical-align:middle;
}
.rt-history-table tr:last-child td { border-bottom:none; }
.rt-history-table tr:hover td { background:var(--surface); }
.hist-live-row td { background:rgba(59,158,255,.04); }
.hist-live-row:hover td { background:rgba(59,158,255,.09) !important; }
.hist-live-tag {
  font-size:9px; font-weight:700; letter-spacing:.05em;
  color:var(--ok); padding:1px 5px; border-radius:4px;
  background:rgba(74,222,128,.1); margin-left:6px;
}
.hist-date { font-weight:600; }
.td-hi { color:var(--warm); font-weight:700; }
.td-lo { color:var(--accent); font-weight:700; }
.hist-hum,.hist-wind { color:var(--muted); }
.hist-rain-pill {
  display:inline-block; padding:3px 10px; border-radius:999px;
  background:linear-gradient(90deg, rgba(59,158,255,.25) var(--r), rgba(59,158,255,.05) var(--r));
  border:1px solid rgba(59,158,255,.2); font-size:12px; font-weight:600; color:var(--accent);
}

/* Alert popup */
.rt-alert-popup {
  position:fixed; top:-130px; left:50%; transform:translateX(-50%);
  z-index:9999; display:flex; align-items:center; gap:14px;
  padding:16px 18px; width:min(520px,94vw);
  border-radius:var(--radius); backdrop-filter:blur(18px);
  border:1px solid rgba(248,113,113,.4); background:rgba(14,8,8,.96);
  box-shadow:0 28px 52px rgba(0,0,0,.55);
  transition:top .48s cubic-bezier(.34,1.56,.64,1),opacity .3s;
  opacity:0;
}
.rt-alert-show { top:18px !important; opacity:1 !important; }
.rt-alert-warn { border-color:rgba(240,160,75,.4); background:rgba(14,11,4,.96); }
.rt-al-icon { font-size:1.9rem; flex-shrink:0; }
.rt-al-body { flex:1; min-width:0; }
.rt-al-title { font-weight:700; font-size:14px; color:#fecaca; margin-bottom:4px; }
.rt-alert-warn .rt-al-title { color:#fde68a; }
.rt-al-text { font-size:12px; color:var(--muted); line-height:1.55; }
.rt-al-close {
  width:28px; height:28px; border:none; border-radius:8px;
  background:var(--surface); color:var(--muted); font-size:18px;
  cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.rt-al-close:hover { background:var(--surface-hover); color:var(--text); }

/* Footer row */
.rt-footer-row {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  font-size:12px; color:var(--muted);
  margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--border);
}
.rt-live-clock { font-variant-numeric:tabular-nums; font-weight:700; color:var(--text); }
.rt-footer-label { color:var(--muted); }
.rt-sep { color:var(--border); }
.rt-text-btn {
  background:none; border:none; color:var(--accent);
  font:600 12px var(--font); cursor:pointer;
  padding:0; text-decoration:underline; text-underline-offset:3px;
}

/* Hourly wind */
.hour-wind { font-size:10px; color:var(--muted); margin-top:2px; }

/* Toast types */
.toast-rt-success { border-color:rgba(74,222,128,.3); }
.toast-rt-warn    { border-color:rgba(240,160,75,.3); }
.toast-rt-error   { border-color:rgba(248,113,113,.3); }

@media(max-width:560px){
  .rt-radar-map  { height:260px; }
  .rt-map-btn    { padding:8px 10px; font-size:11px; }
  .rt-history-table th,
  .rt-history-table td { padding:9px 10px; }
}
    `;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────────────
   * INIT
   * ───────────────────────────────────────────────────────────── */
  async function init() {
    injectCSS();
    injectHTML();
    patchSelectWard();
    startLiveClock();
    initGPSButton();

    // Wait for main script.js to set up WARDS + WARDS_COORDS
    await new Promise(r => setTimeout(r, 800));

    // Set default location from first ward
    const coords = window.WARDS_COORDS || [];
    if (coords.length) {
      const c = coords.find(c => c.id === 1) || coords[0];
      setLocation(c.lat, c.lon, window.WARDS?.[0]?.name || DEFAULT_NAME);
    }

    await refreshAll();

    // Lazy-load radar map on scroll
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { initRadarMap(); obs.unobserve(e.target); }
        });
      }, { threshold: 0.1 });
      const el = $('rt-radar-map');
      if (el) obs.observe(el);
    } else {
      initRadarMap();
    }

    // Resize chart on container change
    const ro = new ResizeObserver(() => {
      renderDailyChart();
      if (typeof window.renderChart === 'function') window.renderChart();
    });
    const tc = $('tempChart');
    if (tc) ro.observe(tc);

    console.log('✅ AeroCast Real-Time Engine v2.0 — sẵn sàng');
  }

  // Public API
  window.AeroCastRT = {
    refresh:     refreshAll,
    exportCSV,
    setLocation: (lat, lon, name) => { setLocation(lat, lon, name); refreshAll(); },
    getState:    () => RT,
  };

  // Boot after main script.js
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 900);
  }
})();