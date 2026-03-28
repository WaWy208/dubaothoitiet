(function () {
  'use strict';

  const OWM_KEY = '7f318ae139397881686e5acd8dce296c';
  const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
  const OWM_TILE = (layer) =>
    `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${OWM_KEY}`;

  const REFRESH_SEC = 60;
  const DEFAULT_LAT = 9.1769;
  const DEFAULT_LON = 105.1505;
  const DEFAULT_NAME = 'TP. Cà Mau';

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
  const $ = (id) => document.getElementById(id);
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
    const d = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
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
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * ease);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  async function owmGet(path, extra = {}) {
    const url = new URL(OWM_BASE + path);
    url.searchParams.set('appid', OWM_KEY);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('lang', 'vi');
    url.searchParams.set('lat', RT.lat);
    url.searchParams.set('lon', RT.lon);
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
    RT.current = cur.status === 'fulfilled' ? cur.value : null;
    RT.forecast = fc5.status === 'fulfilled' ? fc5.value : null;
    RT.airPollution = aqi.status === 'fulfilled' ? aqi.value : null;
  }

  function haversine(la1, lo1, la2, lo2) {
    const R = 6371, d2r = Math.PI / 180;
    const dLa = (la2 - la1) * d2r, dLo = (lo2 - lo1) * d2r;
    const a = Math.sin(dLa / 2) ** 2
      + Math.cos(la1 * d2r) * Math.cos(la2 * d2r) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearestWard(lat, lon) {
    const coords = window.WARDS_COORDS || [];
    const wards = window.WARDS || [];
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
    RT.lat = lat;
    RT.lon = lon;
    RT.name = name;
    if (RT.leafletMap && RT._marker) {
      RT._marker.setLatLng([lat, lon]).openPopup();
      RT.leafletMap.panTo([lat, lon], { animate: true });
    }
  }

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
          const ward = result?.ward;

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
          const msgs = { 1: 'GPS bị từ chối quyền truy cập', 2: 'Không tìm thấy vị trí', 3: 'GPS timeout' };
          toast(msgs[err.code] || 'Lỗi GPS', 'warn');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  function renderHero() {
    const d = RT.current;
    if (!d) return;

    const w = d.weather?.[0] || {};
    const m = d.main || {};
    const wind = d.wind || {};
    const sys = d.sys || {};
    const rain = d.rain?.['1h'] || d.rain?.['3h'] || 0;
    const snow = d.snow?.['1h'] || 0;
    const vis = d.visibility;

    const tempC = m.temp ?? 31;
    const feelsC = m.feels_like ?? tempC;
    const hiC = m.temp_max ?? tempC + 2;
    const loC = m.temp_min ?? tempC - 3;
    const humidity = m.humidity ?? 80;
    const pressure = m.pressure ?? 1010;
    const windSpd = mps2kmh(wind.speed);
    const windDeg = wind.deg ?? 0;
    const windGust = wind.gust ? mps2kmh(wind.gust) : null;
    const clouds = d.clouds?.all ?? 0;
    const desc = w.description
      ? w.description.charAt(0).toUpperCase() + w.description.slice(1)
      : '—';
    const icon = weatherEmoji(w.id);
    const su = RT.unit() === 'F' ? '°F' : '°C';

    const cT = $('currentTemp');
    if (cT) cT.innerHTML = `${RT.dispT(tempC)}<sup id="tempUnitLabel">${su}</sup>`;
    setTxt('feelsLike', `${desc} — Cảm giác ${RT.dispT(feelsC)}°`);

    let dayHi = hiC, dayLo = loC;
    if (RT.forecast?.list) {
      const today = new Date().toDateString();
      const todayItems = RT.forecast.list.filter(item =>
        new Date(item.dt * 1000).toDateString() === today);
      if (todayItems.length > 0) {
        const allTemps = todayItems.map(i => i.main.temp);
        allTemps.push(tempC);
        dayHi = Math.max(...allTemps);
        dayLo = Math.min(...allTemps);
      }
    }
    animNum($('hiTemp'), RT.dispT(dayHi));
    animNum($('loTemp'), RT.dispT(dayLo));

    const iconEl = $('mainIcon');
    if (iconEl) { iconEl.textContent = icon; iconEl.title = desc; }
    setTxt('mainDesc', desc);

    setTxt('heroCity', RT.name);
    setTxt('currentLocSub', `${RT.name} · Real-time`);

    if (window.WARDS_COORDS) {
      const wRes = nearestWard(RT.lat, RT.lon);
      if (wRes && wRes.ward) {
        setTxt('heroLocation', wRes.ward.district);
        const isBL = ['TP. Bạc Liêu', 'Hòa Bình', 'Vĩnh Lợi', 'Hồng Dân', 'Phước Long', 'TX. Giá Rai', 'Đông Hải'].includes(wRes.ward.district);
        setTxt('heroProvince', isBL ? 'Tỉnh Bạc Liêu, Việt Nam' : 'Tỉnh Cà Mau, Việt Nam');
      }
    }

    setTxt('sHumidity', humidity + '%');
    setTxt('sWind', windSpd + ' km/h');
    setTxt('sVisibility', vis ? (vis / 1000).toFixed(1) + ' km' : '≥10 km');
    setTxt('sPressure', pressure + ' hPa');

    setTxt('windSpeedText', windSpd + ' km/h');
    setTxt('windDirText', windDirText(windDeg));
    setTxt('windGustText', windGust ? `Giật ${windGust} km/h` : 'Không có giật');
    const needle = $('windNeedle');
    if (needle) needle.style.setProperty('--wind-deg', windDeg + 'deg');

    setTxt('detailRainMm', (rain + snow).toFixed(1) + ' mm/h');
    const pop = RT.forecast?.list?.[0]?.pop ?? 0;
    const rainProb = Math.round(pop * 100);
    setTxt('detailRainProb', `Xác suất mưa ${rainProb}%`);
    const rfill = $('rainBarFill');
    if (rfill) rfill.style.width = rainProb + '%';

    setTxt('detailCloud', clouds);
    const cbf = $('cloudBarFill');
    if (cbf) cbf.style.width = clouds + '%';
    const dew = Math.round(tempC - (100 - humidity) / 5);
    setTxt('detailDew', RT.dispT(dew) + su);

    if (sys.sunrise && sys.sunset) {
      const sr = new Date(sys.sunrise * 1000);
      const ss = new Date(sys.sunset * 1000);
      const fmt = (dt) => dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const min = Math.round((sys.sunset - sys.sunrise) / 60);
      const sunEls = document.querySelectorAll('.sun-time');
      if (sunEls[0]) sunEls[0].textContent = fmt(sr);
      if (sunEls[1]) sunEls[1].textContent = `${Math.floor(min / 60)}h ${min % 60}m`;
      if (sunEls[2]) sunEls[2].textContent = fmt(ss);
      animateSunArc(sr, ss);
    }

    setTxt('updateTime', new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));

    const rPct = Math.min((rain + snow) / 25, 1);
    const root = document.documentElement;
    root.style.setProperty('--cloud-cover', Math.min(clouds / 100 * 0.9, 0.85));
    root.style.setProperty('--rain-scale', rPct > 0.1 ? rPct : 0);
    root.style.setProperty('--rain-offset', (1 - rPct) * 12 + 'px');
    root.style.setProperty('--orb-radius', (50 + (tempC - 25) * 0.9) + 'px');
    root.style.setProperty('--orb-glow', `rgba(240,160,75,${0.25 + rPct * 0.45})`);

    checkExtremeAlert();
  }
  function renderHourly() {
    const fc = RT.forecast;
    if (!fc?.list) return;
    const items = fc.list.slice(0, 8);
    const track = $('hourlyTrack');
    if (!track) return;

    track.innerHTML = items.map((item, i) => {
      const dt = new Date(item.dt * 1000);
      const t = i === 0
        ? 'Bây giờ'
        : dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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

    if (window.HOURS) {
      items.forEach((item, i) => {
        if (!window.HOURS[i]) return;
        const dt = new Date(item.dt * 1000);
        window.HOURS[i].t = i === 0 ? 'Bây giờ'
          : dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        window.HOURS[i].temp = Math.round(item.main.temp);
        window.HOURS[i].rain = Math.round((item.pop || 0) * 100);
        window.HOURS[i].icon = weatherEmoji(item.weather?.[0]?.id);
      });
    }
  }

  function renderDailyChart() {
    const canvas = $('tempChart');
    if (!canvas || !RT.forecast?.list) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 800;
    const H = 130;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
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

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const y = 16 + f * (H - 44);
      ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
    });

    rains.forEach((r, i) => {
      const bH = (r / 100) * (H - 44);
      ctx.fillStyle = `rgba(56,189,248,${0.08 + r / 600})`;
      ctx.fillRect(px(i) - 7, H - 20 - bH, 14, bH);
    });

    const aGrad = ctx.createLinearGradient(0, 0, 0, H);
    aGrad.addColorStop(0, 'rgba(251,146,60,0.30)');
    aGrad.addColorStop(1, 'rgba(251,146,60,0.02)');
    ctx.beginPath();
    ctx.moveTo(px(0), py(temps[0]));
    for (let i = 1; i < n; i++) {
      const cx = (px(i - 1) + px(i)) / 2;
      ctx.bezierCurveTo(cx, py(temps[i - 1]), cx, py(temps[i]), px(i), py(temps[i]));
    }
    ctx.lineTo(px(n - 1), H - 20); ctx.lineTo(px(0), H - 20);
    ctx.closePath(); ctx.fillStyle = aGrad; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(px(0), py(temps[0]));
    for (let i = 1; i < n; i++) {
      const cx = (px(i - 1) + px(i)) / 2;
      ctx.bezierCurveTo(cx, py(temps[i - 1]), cx, py(temps[i]), px(i), py(temps[i]));
    }
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

    items.forEach((item, i) => {
      const x = px(i), y = py(temps[i]);
      ctx.save();
      ctx.shadowColor = i === 0 ? '#38bdf8' : '#fb923c';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#38bdf8' : '#fb923c';
      ctx.fill();
      ctx.restore();
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(232,234,239,0.92)';
        ctx.font = 'bold 10px DM Sans, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${temps[i]}°`, x, y - 9);
      }
      const dt = new Date(item.dt * 1000);
      const tl = i === 0 ? 'Giờ này'
        : dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = 'rgba(139,147,167,0.85)';
      ctx.font = '9px DM Sans, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(tl, x, H - 8);
    });
  }

  function renderForecast7Day() {
    const fc = RT.forecast;
    if (!fc?.list) return;

    const byDay = {};
    fc.list.forEach(item => {
      const dt = new Date(item.dt * 1000);
      const key = dt.toLocaleDateString('vi-VN');
      if (!byDay[key]) byDay[key] = { dt, items: [], temps: [], pop: [], codes: [] };
      byDay[key].items.push(item);
      byDay[key].temps.push(item.main.temp);
      byDay[key].pop.push((item.pop || 0) * 100);
      byDay[key].codes.push(item.weather?.[0]?.id || 800);
    });

    const days = Object.entries(byDay).slice(0, 7);
    const wkday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    if (window.FORECAST) {
      days.forEach(([key, data], i) => {
        const hi = Math.max(...data.temps);
        const lo = Math.min(...data.temps);
        const rain = Math.round(data.pop.reduce((a, b) => a + b, 0) / data.pop.length);
        const code = data.codes[Math.floor(data.codes.length / 2)];
        const noon = data.items.find(it => new Date(it.dt * 1000).getHours() === 12)
          || data.items[Math.floor(data.items.length / 2)];
        const desc = noon?.weather?.[0]?.description
          ? noon.weather[0].description.charAt(0).toUpperCase() + noon.weather[0].description.slice(1)
          : 'Dự báo';
        if (window.FORECAST[i]) {
          window.FORECAST[i].d = i === 0 ? 'Hôm nay' : wkday[data.dt.getDay()];
          window.FORECAST[i].date = data.dt.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
          window.FORECAST[i].icon = weatherEmoji(code);
          window.FORECAST[i].desc = desc;
          window.FORECAST[i].hi = Math.round(hi);
          window.FORECAST[i].lo = Math.round(lo);
          window.FORECAST[i].rain = rain;
          window.FORECAST[i].humidity = noon?.main?.humidity ?? 82;
          window.FORECAST[i].wind = mps2kmh(noon?.wind?.speed || 0);
        }
      });
    }

    const fl = $('forecastList');
    if (!fl) return;
    fl.innerHTML = days.map(([key, data], i) => {
      const hi = RT.dispT(Math.max(...data.temps));
      const lo = RT.dispT(Math.min(...data.temps));
      const rain = Math.round(data.pop.reduce((a, b) => a + b, 0) / data.pop.length);
      const code = data.codes[Math.floor(data.codes.length / 2)];
      const icon = weatherEmoji(code);
      const noon = data.items.find(it => new Date(it.dt * 1000).getHours() === 12)
        || data.items[Math.floor(data.items.length / 2)];
      const desc = noon?.weather?.[0]?.description
        ? noon.weather[0].description.charAt(0).toUpperCase() + noon.weather[0].description.slice(1)
        : '';
      const windKmh = mps2kmh(noon?.wind?.speed || 0);
      const label = i === 0 ? 'Hôm nay'
        : data.dt.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
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

  function renderDetails() {
    const d = RT.current;
    const aqi = RT.airPollution;
    if (!d) return;

    const m = d.main || {};
    const tempC = m.temp ?? 31;
    const humidity = m.humidity ?? 80;
    const clouds = d.clouds?.all ?? 0;
    const rain = d.rain?.['1h'] || 0;
    const pop = RT.forecast?.list?.[0]?.pop ?? 0;
    const rainProb = Math.round(pop * 100);

    const hr = new Date().getHours();
    const sunFactor = (hr >= 6 && hr <= 18)
      ? Math.sin(Math.PI * (hr - 6) / 12) : 0;
    const uvi = Math.max(0, Math.min(11,
      Math.round(9 * sunFactor * (1 - clouds / 130))));
    const uvLabels = ['Thấp', 'Thấp', 'Thấp', 'Trung bình', 'Trung bình', 'Trung bình',
      'Cao', 'Cao', 'Rất cao', 'Rất cao', 'Rất cao', 'Cực đoan'];
    const uvCls = ['accent-ok', 'accent-ok', 'accent-ok', '', '', '', 'accent-warm',
      'accent-warm', '', '', '', 'accent-danger'];
    setTxt('detailUv', uvi);
    setTxt('detailUvNote',
      `${uvLabels[uvi]} — ${uvi > 5 ? 'Cần kem chống nắng' : uvi > 2 ? 'Đề phòng' : 'An toàn'}`);
    const uvEl = $('detailUv');
    if (uvEl) uvEl.className = `detail-stat ${uvCls[uvi]}`;

    if (aqi?.list?.[0]) {
      const comp = aqi.list[0].components || {};
      const aqiI = aqi.list[0].main?.aqi ?? 2;
      const aqiMap = {
        1: { score: 15, lbl: 'Tốt', cls: 'accent-ok' },
        2: { score: 45, lbl: 'Khá', cls: '' },
        3: { score: 65, lbl: 'Trung bình', cls: 'accent-warm' },
        4: { score: 80, lbl: 'Xấu', cls: '' },
        5: { score: 96, lbl: 'Nguy hiểm', cls: 'accent-danger' },
      };
      const lv = aqiMap[aqiI] || aqiMap[2];
      const aqiEl = $('detailAqi');
      if (aqiEl) { aqiEl.textContent = lv.score; aqiEl.className = `detail-stat ${lv.cls}`; }
      setTxt('detailAqiNote', lv.lbl);
      const pin = $('aqiPin');
      if (pin) pin.style.setProperty('--aqi-pct', lv.score + '%');
      if ($('pm25')) $('pm25').textContent = (comp.pm2_5 || 0).toFixed(1);
      if ($('pm10')) $('pm10').textContent = (comp.pm10 || 0).toFixed(1);
      if ($('o3')) $('o3').textContent = ((comp.o3 || 0) / 1000).toFixed(3);
    }

    setTxt('detailRainMm', rain.toFixed(1) + ' mm/h');
    setTxt('detailRainProb', `Xác suất mưa ${rainProb}%`);
    const rfill = $('rainBarFill');
    if (rfill) rfill.style.width = rainProb + '%';

    // Clouds + dew
    setTxt('detailCloud', clouds);
    const cbf = $('cloudBarFill');
    if (cbf) cbf.style.width = clouds + '%';
    const su = RT.unit() === 'F' ? '°F' : '°C';
    const dew = Math.round(tempC - (100 - humidity) / 5);
    setTxt('detailDew', RT.dispT(dew) + su);

    // Pressure
    setTxt('sPressure', (m.pressure || 1010) + ' hPa');
  }
  function animateSunArc(sunrise, sunset) {
    const now = new Date();
    const pct = Math.min(1, Math.max(0, (now - sunrise) / (sunset - sunrise)));
    const dot = qs('.sun-arc-svg circle');
    if (!dot) return;
    const t = pct;
    const bx = (1 - t) * (1 - t) * 24 + 2 * (1 - t) * t * 170 + t * t * 316;
    const by = (1 - t) * (1 - t) * 88 + 2 * (1 - t) * t * 8 + t * t * 88;
    dot.setAttribute('cx', bx.toFixed(1));
    dot.setAttribute('cy', by.toFixed(1));
    dot.setAttribute('r', pct > 0 && pct < 1 ? '10' : '7');
    dot.setAttribute('fill', pct > 0 && pct < 1 ? 'var(--warm)' : '#475569');
    const arcPath = qs('.sun-arc-svg path:last-of-type');
    if (arcPath) arcPath.style.strokeDashoffset = (480 * (1 - pct)).toFixed(0);
  }

  function checkExtremeAlert() {
    const d = RT.current;
    if (!d) return;
    const code = d.weather?.[0]?.id ?? 800;
    const temp = d.main?.temp ?? 30;
    const wind = mps2kmh(d.wind?.speed ?? 0);
    const rain = d.rain?.['1h'] ?? 0;

    const alerts = [];
    if (code >= 200 && code < 300)
      alerts.push({
        lvl: 'danger', title: '⛈️ Dông sét đang hoạt động',
        body: `${d.weather[0].description} – Tránh xa cây lớn và khu vực trống trải.`
      });
    if (wind > 60)
      alerts.push({ lvl: 'danger', title: '🌀 Gió bão', body: `Gió ${wind} km/h – Nguy hiểm tàu thuyền!` });
    else if (wind > 40)
      alerts.push({ lvl: 'warn', title: '💨 Gió mạnh', body: `Gió ${wind} km/h – Thận trọng khi ra biển.` });
    if (rain > 20)
      alerts.push({
        lvl: 'warn', title: '🌧️ Mưa lớn',
        body: `${rain.toFixed(1)} mm/h – Cảnh báo ngập úng cục bộ.`
      });
    if (temp > 38)
      alerts.push({
        lvl: 'warn', title: '🌡️ Nắng nóng gay gắt',
        body: `${Math.round(temp)}°C – Hạn chế hoạt động ngoài trời 10:00–16:00.`
      });

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
  function buildHistory() {
    const cur = RT.current;
    const fc = RT.forecast;
    if (!cur) return;

    const baseTemp = cur.main?.temp ?? 31;
    const baseHum = cur.main?.humidity ?? 82;
    const baseWind = mps2kmh(cur.wind?.speed ?? 3);

    RT.history = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const wk = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dt.getDay()];
      const lbl = i === 0
        ? 'Hôm nay'
        : `${wk} ${dt.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })}`;

      if (i === 0) {
        RT.history.push({
          label: lbl,
          hi: Math.round(cur.main?.temp_max ?? baseTemp + 2),
          lo: Math.round(cur.main?.temp_min ?? baseTemp - 3),
          rain: Math.round((fc?.list?.[0]?.pop ?? 0) * 100),
          humidity: baseHum,
          wind: baseWind,
          icon: weatherEmoji(cur.weather?.[0]?.id),
          source: 'live',
        });
      } else {
        const ph = i * 1.47;
        const vr = Math.sin(ph) * 2.4;
        const rb = 55 + Math.sin(ph * 0.8) * 35;
        RT.history.push({
          label: lbl,
          hi: Math.round(baseTemp + Math.abs(vr) + 1.5),
          lo: Math.round(baseTemp - Math.abs(vr) - 2),
          rain: Math.max(0, Math.min(100, Math.round(rb))),
          humidity: Math.max(60, Math.min(98, Math.round(baseHum + vr * 1.5))),
          wind: Math.max(5, Math.round(baseWind + vr)),
          icon: rb > 70 ? '🌧️' : rb > 40 ? '🌤️' : '☀️',
          source: 'estimate',
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
        <td class="hist-date">${r.label}${r.source === 'live' ? ' <span class="hist-live-tag">● Live</span>' : ''}</td>
        <td>${r.icon}</td>
        <td class="td-hi">${RT.dispT(r.hi)}${su}</td>
        <td class="td-lo">${RT.dispT(r.lo)}${su}</td>
        <td><span class="hist-rain-pill" style="--r:${r.rain}%">${r.rain}%</span></td>
        <td class="hist-hum">${r.humidity}%</td>
        <td class="hist-wind">${r.wind} km/h</td>
      </tr>`).join('');
  }
  function initRadarMap() {
    const cont = $('rt-radar-map');
    if (!cont || RT.leafletMap) return;
    if (!window.L) {
      document.head.appendChild(Object.assign(document.createElement('link'),
        { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }));
      const s = Object.assign(document.createElement('script'),
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' });
      s.onload = () => buildMap(cont);
      document.head.appendChild(s);
    } else {
      buildMap(cont);
    }
  }

  function buildMap(cont) {
    if (RT.leafletMap) return;
    RT.leafletMap = L.map(cont, {
      center: [RT.lat, RT.lon], zoom: 8,
      zoomControl: true, attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 18, opacity: 0.8 }).addTo(RT.leafletMap);
    RT.radarLayer = L.tileLayer(OWM_TILE(RT.currentMapLayer),
      { opacity: 0.72, maxZoom: 18 }).addTo(RT.leafletMap);
    RT._marker = L.circleMarker([RT.lat, RT.lon], {
      radius: 9, fillColor: '#3b9eff', color: '#fff',
      weight: 2, opacity: 1, fillOpacity: 0.9,
    }).addTo(RT.leafletMap)
      .bindPopup(`<b>${RT.name}</b><br>Vị trí đang xem`).openPopup();

    document.querySelectorAll('.rt-map-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rt-map-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        RT.currentMapLayer = btn.dataset.layer;
        if (RT.radarLayer) RT.leafletMap.removeLayer(RT.radarLayer);
        RT.radarLayer = L.tileLayer(OWM_TILE(RT.currentMapLayer),
          { opacity: 0.72 }).addTo(RT.leafletMap);
      });
    });
    setTimeout(() => RT.leafletMap.invalidateSize(), 300);
  }
  function startCountdown() {
    if (RT.countdownTimer) clearInterval(RT.countdownTimer);
    RT.countdownSec = REFRESH_SEC;
    const numEl = $('rt-countdown-num');
    const ringEl = qs('.rt-ring-fill');
    const circ = 2 * Math.PI * 16;

    RT.countdownTimer = setInterval(() => {
      RT.countdownSec--;
      if (numEl) numEl.textContent = RT.countdownSec + 's';
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
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);
  }
  function exportCSV() {
    const rows = [
      ['Ngày/Giờ', 'Địa điểm', 'Nhiệt (°C)', 'Cảm giác (°C)', 'Cao (°C)', 'Thấp (°C)',
        'Độ ẩm (%)', 'Gió (km/h)', 'Mưa (mm/h)', 'Mây (%)', 'Áp suất (hPa)', 'Tầm nhìn (km)', 'Nguồn']
    ];
    const c = RT.current;
    if (c) rows.push([
      new Date().toLocaleString('vi-VN'), RT.name,
      (c.main?.temp || 0).toFixed(1), (c.main?.feels_like || 0).toFixed(1),
      (c.main?.temp_max || 0).toFixed(1), (c.main?.temp_min || 0).toFixed(1),
      c.main?.humidity || 0, mps2kmh(c.wind?.speed || 0),
      (c.rain?.['1h'] || 0).toFixed(1), c.clouds?.all || 0,
      c.main?.pressure || 0, ((c.visibility || 10000) / 1000).toFixed(1), 'OWM-current',
    ]);
    if (RT.forecast?.list) {
      RT.forecast.list.slice(0, 16).forEach(item => {
        const dt = new Date(item.dt * 1000);
        rows.push([
          dt.toLocaleString('vi-VN'), RT.name,
          item.main.temp.toFixed(1), item.main.feels_like.toFixed(1),
          item.main.temp_max.toFixed(1), item.main.temp_min.toFixed(1),
          item.main.humidity, mps2kmh(item.wind?.speed || 0),
          (item.rain?.['3h'] || 0).toFixed(1), item.clouds?.all || 0,
          item.main.pressure, '—', 'OWM-forecast',
        ]);
      });
    }
    RT.history.forEach(r => {
      rows.push([r.label, RT.name, r.hi, '—', r.hi, r.lo,
      r.humidity, r.wind, '—', '—', '—', '—', r.source]);
    });
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `aerocast_${RT.name.replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.csv`,
    }).click();
    URL.revokeObjectURL(url);
    toast('📥 Đã tải xuống CSV', 'success');
  }
  async function refreshAll() {
    const dot = qs('.sync-dot');
    const badge = $('rt-live-badge');
    if (dot) dot.style.background = 'var(--warm)';
    if (badge) badge.textContent = '◌ CẬP NHẬT…';

    try {
      await fetchAll();

      renderHero();
      renderHourly();
      renderDailyChart();
      renderForecast7Day();
      renderDetails();
      buildHistory();

      if (typeof window.renderForecastHome === 'function') window.renderForecastHome();
      if (typeof window.renderChart === 'function') window.renderChart();
      if (typeof window.renderDashboard === 'function') window.renderDashboard();

      const lr = $('rt-last-refresh');
      if (lr) lr.textContent = new Date().toLocaleTimeString('vi-VN',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (dot) dot.style.background = 'var(--ok)';
      if (badge) badge.textContent = '● LIVE';

      const locName = RT.current?.name || RT.name;
      toast(`📡 ${locName} · ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`, 'success');
    } catch (err) {
      console.error('[AeroCastRT]', err);
      if (dot) dot.style.background = 'var(--danger)';
      if (badge) badge.textContent = '○ OFFLINE';
      toast('⚠️ Lỗi kết nối OWM API', 'warn');
    }

    startCountdown();
  }
  function patchSelectWard() {
    const orig = window.selectWard;
    if (typeof orig !== 'function') return;
    window.selectWard_original = orig;
    window.selectWard = function (w, realData) {
      const coords = window.WARDS_COORDS || [];
      const coord = coords.find(c => c.id === w?.id);
      if (coord) setLocation(coord.lat, coord.lon, w.name);
      else if (w?.lat != null) setLocation(w.lat, w.lon, w.name);
      orig(w, realData);
      setTimeout(refreshAll, 200);
    };
  }

  function injectHTML() {
    const mainFlow = qs('.main-flow');
    if (!mainFlow) return;

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
              stroke-dasharray="${(2 * Math.PI * 16).toFixed(1)}"
              stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 17 17)"/>
          </svg>
          <span id="rt-countdown-num">60s</span>
        </div>`;
      topBar.prepend(wrap);
    }

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
        id: 'rt-export-btn', className: 'link-btn', textContent: '📥 Tải dữ liệu CSV',
      });
      btn.style.marginLeft = '14px';
      btn.addEventListener('click', exportCSV);
      footer.appendChild(btn);
    }
  }

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
  window.AeroCastRT = {
    refresh: refreshAll,
    exportCSV,
    setLocation: (lat, lon, name) => { setLocation(lat, lon, name); refreshAll(); },
    getState: () => RT,
  };
  function initSearchOverlay() {
    const overlay = $('searchOverlay');
    const searchBtn = $('searchBtn');
    const closeBtn = $('searchClose');
    const input = $('searchInput');
    const results = $('searchResults');
    const tabs = $('districtTabs');
    if (!overlay || !searchBtn) return;
    const WARDS_DATA = [
      { id: 1, name: 'Phường 1', district: 'TP. Cà Mau', lat: 9.1769, lon: 105.1505 },
      { id: 2, name: 'Phường 2', district: 'TP. Cà Mau', lat: 9.1785, lon: 105.1532 },
      { id: 3, name: 'Phường 4', district: 'TP. Cà Mau', lat: 9.1750, lon: 105.1480 },
      { id: 4, name: 'Phường 5', district: 'TP. Cà Mau', lat: 9.1800, lon: 105.1460 },
      { id: 5, name: 'Phường 6', district: 'TP. Cà Mau', lat: 9.1720, lon: 105.1540 },
      { id: 6, name: 'Phường 7', district: 'TP. Cà Mau', lat: 9.1830, lon: 105.1490 },
      { id: 7, name: 'Phường 8', district: 'TP. Cà Mau', lat: 9.1710, lon: 105.1510 },
      { id: 8, name: 'Phường 9', district: 'TP. Cà Mau', lat: 9.1760, lon: 105.1570 },
      { id: 9, name: 'Phường Tân Thành', district: 'TP. Cà Mau', lat: 9.1690, lon: 105.1480 },
      { id: 10, name: 'Phường Tân Xuyên', district: 'TP. Cà Mau', lat: 9.1820, lon: 105.1550 },
      { id: 11, name: 'Xã An Xuyên', district: 'TP. Cà Mau', lat: 9.1600, lon: 105.1600 },
      { id: 12, name: 'Xã Tân Thành', district: 'TP. Cà Mau', lat: 9.1900, lon: 105.1700 },

      { id: 13, name: 'TT. U Minh', district: 'U Minh', lat: 9.3710, lon: 104.9790 },
      { id: 14, name: 'Xã Khánh Hòa', district: 'U Minh', lat: 9.3500, lon: 104.9500 },
      { id: 15, name: 'Xã Nguyễn Phích', district: 'U Minh', lat: 9.3900, lon: 105.0100 },

      { id: 16, name: 'TT. Thới Bình', district: 'Thới Bình', lat: 9.3167, lon: 105.0833 },
      { id: 17, name: 'Xã Hồ Thị Kỷ', district: 'Thới Bình', lat: 9.3400, lon: 105.0600 },
      { id: 18, name: 'Xã Tân Bằng', district: 'Thới Bình', lat: 9.2900, lon: 105.0900 },

      { id: 19, name: 'TT. Trần Văn Thời', district: 'Trần Văn Thời', lat: 9.0167, lon: 105.0167 },
      { id: 20, name: 'TT. Sông Đốc', district: 'Trần Văn Thời', lat: 9.0297, lon: 104.8203 },
      { id: 21, name: 'Xã Lợi An', district: 'Trần Văn Thời', lat: 9.0500, lon: 105.0400 },

      { id: 22, name: 'TT. Cái Nước', district: 'Cái Nước', lat: 9.0103, lon: 105.0535 },
      { id: 23, name: 'Xã Phú Hưng', district: 'Cái Nước', lat: 9.0300, lon: 105.0700 },

      { id: 24, name: 'TT. Đầm Dơi', district: 'Đầm Dơi', lat: 8.9626, lon: 105.2113 },
      { id: 25, name: 'Xã Tạ An Khương Nam', district: 'Đầm Dơi', lat: 8.9800, lon: 105.2300 },

      { id: 26, name: 'TT. Năm Căn', district: 'Năm Căn', lat: 8.7500, lon: 104.9833 },
      { id: 27, name: 'Xã Hiệp Tùng', district: 'Năm Căn', lat: 8.7700, lon: 104.9600 },

      { id: 28, name: 'TT. Cái Đôi Vàm', district: 'Phú Tân', lat: 8.9667, lon: 104.8333 },
      { id: 29, name: 'Xã Việt Khái', district: 'Phú Tân', lat: 8.9500, lon: 104.8600 },

      { id: 30, name: 'TT. Rạch Gốc', district: 'Ngọc Hiển', lat: 8.6500, lon: 104.9000 },
      { id: 31, name: 'Xã Đất Mũi', district: 'Ngọc Hiển', lat: 8.5922, lon: 104.7225 },
      { id: 32, name: 'Xã Viên An', district: 'Ngọc Hiển', lat: 8.6700, lon: 104.9300 },

      // ── TP. BẠC LIÊU (7 phường + 3 xã) ──
      { id: 33, name: 'Phường 1', district: 'TP. Bạc Liêu', lat: 9.2941, lon: 105.7216 },
      { id: 34, name: 'Phường 2', district: 'TP. Bạc Liêu', lat: 9.2960, lon: 105.7240 },
      { id: 35, name: 'Phường 3', district: 'TP. Bạc Liêu', lat: 9.2920, lon: 105.7190 },
      { id: 36, name: 'Phường 5', district: 'TP. Bạc Liêu', lat: 9.2980, lon: 105.7170 },
      { id: 37, name: 'Phường 7', district: 'TP. Bạc Liêu', lat: 9.3010, lon: 105.7200 },
      { id: 38, name: 'Phường 8', district: 'TP. Bạc Liêu', lat: 9.2890, lon: 105.7250 },
      { id: 39, name: 'Phường Nhà Mát', district: 'TP. Bạc Liêu', lat: 9.3200, lon: 105.7500 },
      { id: 40, name: 'Xã Vĩnh Trạch', district: 'TP. Bạc Liêu', lat: 9.2800, lon: 105.7450 },
      { id: 41, name: 'Xã Vĩnh Trạch Đông', district: 'TP. Bạc Liêu', lat: 9.2700, lon: 105.7600 },
      { id: 42, name: 'Xã Hiệp Thành', district: 'TP. Bạc Liêu', lat: 9.3100, lon: 105.7350 },

      // ── HUYỆN HÒA BÌNH (1 thị trấn + 5 xã) ──
      { id: 43, name: 'TT. Hòa Bình', district: 'Hòa Bình', lat: 9.2500, lon: 105.6200 },
      { id: 44, name: 'Xã Vĩnh Bình', district: 'Hòa Bình', lat: 9.2300, lon: 105.6100 },
      { id: 45, name: 'Xã Vĩnh Mỹ A', district: 'Hòa Bình', lat: 9.2100, lon: 105.5900 },
      { id: 46, name: 'Xã Vĩnh Mỹ B', district: 'Hòa Bình', lat: 9.2200, lon: 105.6000 },
      { id: 47, name: 'Xã Vĩnh Hậu', district: 'Hòa Bình', lat: 9.1900, lon: 105.5700 },
      { id: 48, name: 'Xã Vĩnh Hậu A', district: 'Hòa Bình', lat: 9.1800, lon: 105.5600 },

      // ── HUYỆN VĨNH LỢI (1 thị trấn + 7 xã) ──
      { id: 49, name: 'TT. Châu Hưng', district: 'Vĩnh Lợi', lat: 9.3200, lon: 105.6900 },
      { id: 50, name: 'Xã Châu Hưng A', district: 'Vĩnh Lợi', lat: 9.3100, lon: 105.6750 },
      { id: 51, name: 'Xã Hưng Hội', district: 'Vĩnh Lợi', lat: 9.3300, lon: 105.6600 },
      { id: 52, name: 'Xã Hưng Thành', district: 'Vĩnh Lợi', lat: 9.3400, lon: 105.6800 },
      { id: 53, name: 'Xã Long Thạnh', district: 'Vĩnh Lợi', lat: 9.3500, lon: 105.7000 },
      { id: 54, name: 'Xã Vĩnh Mỹ', district: 'Vĩnh Lợi', lat: 9.3000, lon: 105.7100 },
      { id: 55, name: 'Xã Châu Thới', district: 'Vĩnh Lợi', lat: 9.2800, lon: 105.6850 },
      { id: 56, name: 'Xã Nhà Mát', district: 'Vĩnh Lợi', lat: 9.3200, lon: 105.7400 },

      // ── HUYỆN HỒNG DÂN (2 thị trấn + 5 xã) ──
      { id: 57, name: 'TT. Ngan Dừa', district: 'Hồng Dân', lat: 9.4800, lon: 105.5300 },
      { id: 58, name: 'TT. Hồng Dân', district: 'Hồng Dân', lat: 9.5000, lon: 105.5100 },
      { id: 59, name: 'Xã Ninh Quới', district: 'Hồng Dân', lat: 9.4600, lon: 105.5500 },
      { id: 60, name: 'Xã Ninh Quới A', district: 'Hồng Dân', lat: 9.4700, lon: 105.5700 },
      { id: 61, name: 'Xã Ninh Hòa', district: 'Hồng Dân', lat: 9.5100, lon: 105.5200 },
      { id: 62, name: 'Xã Lộc Ninh', district: 'Hồng Dân', lat: 9.5300, lon: 105.5400 },
      { id: 63, name: 'Xã Vĩnh Lộc', district: 'Hồng Dân', lat: 9.5500, lon: 105.5600 },

      // ── HUYỆN PHƯỚC LONG (1 thị trấn + 6 xã) ──
      { id: 64, name: 'TT. Phước Long', district: 'Phước Long', lat: 9.3900, lon: 105.4600 },
      { id: 65, name: 'Xã Phước Long', district: 'Phước Long', lat: 9.3700, lon: 105.4400 },
      { id: 66, name: 'Xã Hưng Phú', district: 'Phước Long', lat: 9.4000, lon: 105.4800 },
      { id: 67, name: 'Xã Vĩnh Phú Đông', district: 'Phước Long', lat: 9.4100, lon: 105.5000 },
      { id: 68, name: 'Xã Vĩnh Phú Tây', district: 'Phước Long', lat: 9.4200, lon: 105.5200 },
      { id: 69, name: 'Xã Phong Thạnh Tây A', district: 'Phước Long', lat: 9.3500, lon: 105.4300 },
      { id: 70, name: 'Xã Phong Thạnh Tây B', district: 'Phước Long', lat: 9.3400, lon: 105.4200 },

      // ── TX. GIÁ RAI (3 phường + 6 xã) ──
      { id: 71, name: 'Phường 1 (Giá Rai)', district: 'TX. Giá Rai', lat: 9.2000, lon: 105.4700 },
      { id: 72, name: 'Phường Hộ Phòng', district: 'TX. Giá Rai', lat: 9.1800, lon: 105.4900 },
      { id: 73, name: 'Phường Láng Tròn', district: 'TX. Giá Rai', lat: 9.2100, lon: 105.4600 },
      { id: 74, name: 'Xã Phong Thạnh', district: 'TX. Giá Rai', lat: 9.2300, lon: 105.4500 },
      { id: 75, name: 'Xã Phong Thạnh A', district: 'TX. Giá Rai', lat: 9.2400, lon: 105.4400 },
      { id: 76, name: 'Xã Phong Tân', district: 'TX. Giá Rai', lat: 9.1700, lon: 105.5000 },
      { id: 77, name: 'Xã Tân Phong', district: 'TX. Giá Rai', lat: 9.1600, lon: 105.5100 },
      { id: 78, name: 'Xã Long Điền', district: 'TX. Giá Rai', lat: 9.2200, lon: 105.4300 },
      { id: 79, name: 'Xã Long Điền Đông', district: 'TX. Giá Rai', lat: 9.2100, lon: 105.4200 },

      // ── HUYỆN ĐÔNG HẢI (1 thị trấn + 7 xã) ──
      { id: 80, name: 'TT. Gành Hào', district: 'Đông Hải', lat: 9.0300, lon: 105.4200 },
      { id: 81, name: 'Xã Long Điền Đông A', district: 'Đông Hải', lat: 9.0700, lon: 105.4400 },
      { id: 82, name: 'Xã Long Điền Tây', district: 'Đông Hải', lat: 9.0900, lon: 105.4600 },
      { id: 83, name: 'Xã Điền Hải', district: 'Đông Hải', lat: 9.0500, lon: 105.4000 },
      { id: 84, name: 'Xã An Trạch', district: 'Đông Hải', lat: 9.1100, lon: 105.4700 },
      { id: 85, name: 'Xã An Trạch A', district: 'Đông Hải', lat: 9.1000, lon: 105.4500 },
      { id: 86, name: 'Xã Định Thành', district: 'Đông Hải', lat: 9.0800, lon: 105.4300 },
      { id: 87, name: 'Xã Định Thành A', district: 'Đông Hải', lat: 9.0600, lon: 105.4100 },

    ];

    window.WARDS = WARDS_DATA;
    window.WARDS_COORDS = WARDS_DATA;

    let currentFilter = 'all';

    function renderResults(filter, query) {
      let items = WARDS_DATA;
      if (filter && filter !== 'all') items = items.filter(w => w.district === filter);
      if (query) {
        const q = query.toLowerCase();
        items = items.filter(w =>
          w.name.toLowerCase().includes(q) || w.district.toLowerCase().includes(q));
      }

      if (!items.length) {
        results.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted)">Không tìm thấy địa điểm nào</div>`;
        return;
      }

      results.innerHTML = items.map(w => `
        <div class="sr-item" data-id="${w.id}">
          <div class="sr-icon">📍</div>
          <div>
            <div class="sr-name">${w.name}</div>
            <div class="sr-dist">${w.district}</div>
          </div>
          <div class="sr-weather">
            <div class="sr-temp">${w.lat.toFixed(2)}°N</div>
            <div class="sr-rain">${w.lon.toFixed(2)}°E</div>
          </div>
        </div>`).join('');

      results.querySelectorAll('.sr-item').forEach(el => {
        el.addEventListener('click', () => {
          const ward = WARDS_DATA.find(w => w.id === parseInt(el.dataset.id));
          if (ward) {
            setLocation(ward.lat, ward.lon, ward.name);
            overlay.classList.remove('open');
            toast(`📍 ${ward.name} · ${ward.district}`, 'success');
            refreshAll();
          }
        });
      });
    }

    // Open
    searchBtn.addEventListener('click', () => {
      overlay.classList.add('open');
      setTimeout(() => input.focus(), 100);
      renderResults(currentFilter, input.value);
    });

    // Close
    closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    // Search input
    input.addEventListener('input', () => renderResults(currentFilter, input.value));

    // District tabs
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      tabs.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.d;
      renderResults(currentFilter, input.value);
    });

    renderResults('all', '');
  }

  function initSMSModal() {
    const modal = $('smsModal');
    const openBtn = $('openSmsBtn');
    const closeBtn = $('smsClose');
    const form = $('smsForm');
    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', () => modal.classList.add('open'));
    closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const phone = $('smsPhone')?.value;
      const opts = Array.from(form.querySelectorAll('input[name=opts]:checked'))
        .map(c => c.value);

      if (!phone || phone.length < 10) {
        toast('⚠️ Vui lòng nhập số điện thoại hợp lệ', 'warn');
        return;
      }

      const labels = { storm: 'Bão', flood: 'Triều cường', salinity: 'Xâm nhập mặn' };
      const selected = opts.map(o => labels[o] || o).join(', ') || 'Tất cả';

      toast(`✅ Đăng ký thành công: ${phone} • ${selected}`, 'success');
      modal.classList.remove('open');
      form.reset();
    });
  }

  const COMP_LOCATIONS = {
    camau: { lat: 9.1769, lon: 105.1505, name: 'Cà Mau' },
    baclieu: { lat: 9.2941, lon: 105.7216, name: 'Bạc Liêu' },
  };
  const compData = { camau: null, baclieu: null, camauFc: null, baclieuFc: null };

  async function fetchComparison() {
    try {
      const [cm, bl, cmFc, blFc] = await Promise.allSettled([
        owmGet('/weather', { lat: COMP_LOCATIONS.camau.lat, lon: COMP_LOCATIONS.camau.lon }),
        owmGet('/weather', { lat: COMP_LOCATIONS.baclieu.lat, lon: COMP_LOCATIONS.baclieu.lon }),
        owmGet('/forecast', { lat: COMP_LOCATIONS.camau.lat, lon: COMP_LOCATIONS.camau.lon, cnt: 8 }),
        owmGet('/forecast', { lat: COMP_LOCATIONS.baclieu.lat, lon: COMP_LOCATIONS.baclieu.lon, cnt: 8 }),
      ]);
      compData.camau = cm.status === 'fulfilled' ? cm.value : null;
      compData.baclieu = bl.status === 'fulfilled' ? bl.value : null;
      compData.camauFc = cmFc.status === 'fulfilled' ? cmFc.value : null;
      compData.baclieuFc = blFc.status === 'fulfilled' ? blFc.value : null;
    } catch (e) {
      console.error('[Comparison]', e);
    }
    renderComparison();
    renderComparisonChart();
  }

  function renderCompCard(data, containerId, color) {
    const el = $(containerId);
    if (!el || !data) {
      if (el) el.innerHTML = '<div class="comp-loading">Không có dữ liệu</div>';
      return;
    }
    const w = data.weather?.[0] || {};
    const m = data.main || {};
    const wind = data.wind || {};
    const rain = data.rain?.['1h'] || data.rain?.['3h'] || 0;
    const desc = w.description ? w.description.charAt(0).toUpperCase() + w.description.slice(1) : '—';
    const icon = weatherEmoji(w.id);
    const su = RT.unit() === 'F' ? '°F' : '°C';
    const tempC = m.temp ?? 0;

    el.innerHTML = `
      <div class="comp-hero-temp">
        <span class="comp-hero-temp__icon">${icon}</span>
        <span class="comp-hero-temp__val" style="color:${color}">${RT.dispT(tempC)}${su}</span>
        <p class="comp-hero-temp__desc">${desc}</p>
      </div>
      <div class="comp-stat-grid">
        <div class="comp-stat">
          <span class="comp-stat__val">${m.humidity ?? 0}%</span>
          <span class="comp-stat__lbl">Độ ẩm</span>
        </div>
        <div class="comp-stat">
          <span class="comp-stat__val">${mps2kmh(wind.speed || 0)} km/h</span>
          <span class="comp-stat__lbl">Gió</span>
        </div>
        <div class="comp-stat">
          <span class="comp-stat__val">${rain.toFixed(1)} mm</span>
          <span class="comp-stat__lbl">Lượng mưa</span>
        </div>
        <div class="comp-stat">
          <span class="comp-stat__val">${m.pressure ?? 0} hPa</span>
          <span class="comp-stat__lbl">Áp suất</span>
        </div>
      </div>`;
  }

  function renderComparison() {
    renderCompCard(compData.camau, 'compBodyNew', 'var(--accent)');
    renderCompCard(compData.baclieu, 'compBodyOld', 'var(--warm)');
  }

  function renderComparisonChart() {
    const canvas = $('comparisonChart');
    if (!canvas) return;
    const cmFc = compData.camauFc;
    const blFc = compData.baclieuFc;
    if (!cmFc?.list?.length || !blFc?.list?.length) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 800;
    const H = 150;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const cmTemps = cmFc.list.map(i => RT.dispT(i.main.temp));
    const blTemps = blFc.list.map(i => RT.dispT(i.main.temp));
    const n = Math.min(cmTemps.length, blTemps.length);
    if (n < 2) return;

    const allT = [...cmTemps, ...blTemps];
    const minV = Math.min(...allT) - 2;
    const maxV = Math.max(...allT) + 3;
    const px = (i) => 36 + (i / (n - 1)) * (W - 72);
    const py = (v) => H - 28 - ((v - minV) / (maxV - minV)) * (H - 48);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let f = 0; f <= 1; f += 0.25) {
      const y = 16 + f * (H - 44);
      ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(W - 36, y); ctx.stroke();
    }

    function drawLine(temps, color, label) {
      ctx.beginPath();
      ctx.moveTo(px(0), py(temps[0]));
      for (let i = 1; i < n; i++) {
        const cx = (px(i - 1) + px(i)) / 2;
        ctx.bezierCurveTo(cx, py(temps[i - 1]), cx, py(temps[i]), px(i), py(temps[i]));
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      temps.forEach((t, i) => {
        ctx.beginPath();
        ctx.arc(px(i), py(t), 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });

      ctx.fillStyle = color;
      ctx.font = 'bold 10px DM Sans, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(label, px(n - 1) + 8, py(temps[n - 1]) + 3);
    }

    drawLine(cmTemps, '#3b9eff', 'Cà Mau');
    drawLine(blTemps, '#f0a04b', 'Bạc Liêu');

    cmFc.list.forEach((item, i) => {
      if (i >= n) return;
      const dt = new Date(item.dt * 1000);
      const tl = i === 0 ? 'Hiện tại'
        : dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = 'rgba(139,147,167,0.75)';
      ctx.font = '9px DM Sans, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(tl, px(i), H - 6);
    });

    ctx.fillStyle = '#3b9eff';
    ctx.fillRect(36, 6, 12, 3);
    ctx.fillStyle = 'rgba(232,234,239,0.8)';
    ctx.font = '9px DM Sans, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Cà Mau (mới)', 52, 10);
    ctx.fillStyle = '#f0a04b';
    ctx.fillRect(130, 6, 12, 3);
    ctx.fillStyle = 'rgba(232,234,239,0.8)';
    ctx.fillText('Bạc Liêu (cũ)', 146, 10);
  }

  function sinusoidal(base, amp, phase) {
    return base + amp * Math.sin(Date.now() / 3600000 + phase);
  }

  function generateHydroData() {
    const t = Date.now() / 1000;
    const tide = Math.sin(t / (6.2 * 3600));
    return [
      {
        id: 'S01', name: 'Trạm Sông Đốc', type: 'Thủy hải văn',
        salinity: sinusoidal(18.5, 3.5, 0).toFixed(1),
        waterLevel: sinusoidal(1.85, 0.65, 0.5).toFixed(2),
        flowRate: Math.round(sinusoidal(120, 40, 1.0)),
        tide: tide > 0 ? 'Triều lên' : 'Triều rút',
        status: sinusoidal(18.5, 3.5, 0) > 22 ? 'alert' : 'normal'
      },
      {
        id: 'S02', name: 'Trạm Gành Hào', type: 'Triều cường & Mặn',
        salinity: sinusoidal(21.0, 4.0, 1.2).toFixed(1),
        waterLevel: sinusoidal(2.10, 0.70, 1.7).toFixed(2),
        flowRate: Math.round(sinusoidal(85, 30, 2.1)),
        tide: Math.sin(t / (6.2 * 3600) + 0.8) > 0 ? 'Triều lên' : 'Triều rút',
        status: sinusoidal(21.0, 4.0, 1.2) > 24 ? 'warning' : 'normal'
      },
      {
        id: 'S03', name: 'Trạm Thới Bình', type: 'Nước ngọt & Phèn',
        salinity: sinusoidal(0.4, 0.3, 2.5).toFixed(1),
        waterLevel: sinusoidal(0.75, 0.25, 2.8).toFixed(2),
        flowRate: Math.round(sinusoidal(45, 15, 3.2)),
        tide: 'N/A',
        status: 'normal'
      },
      {
        id: 'S04', name: 'Trạm Năm Căn', type: 'Thủy hải văn',
        salinity: sinusoidal(25.0, 5.0, 3.8).toFixed(1),
        waterLevel: sinusoidal(1.60, 0.55, 4.1).toFixed(2),
        flowRate: Math.round(sinusoidal(200, 60, 4.5)),
        tide: Math.sin(t / (6.2 * 3600) + 2.1) > 0 ? 'Triều lên' : 'Triều rút',
        status: 'normal'
      },
      {
        id: 'S05', name: 'Trạm Cà Mau', type: 'Khí tượng thủy văn',
        salinity: sinusoidal(1.2, 0.5, 5.0).toFixed(1),
        waterLevel: sinusoidal(0.90, 0.30, 5.3).toFixed(2),
        flowRate: Math.round(sinusoidal(65, 20, 5.7)),
        tide: 'N/A',
        status: 'normal'
      },
    ];
  }

  function renderHydroStations() {
    const grid = $('hydroGrid');
    if (!grid) return;
    const stations = generateHydroData();
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    grid.innerHTML = stations.map(s => {
      const statusClass = `hydro-status--${s.status}`;
      const statusLabel = s.status === 'alert' ? 'Cảnh báo' : s.status === 'warning' ? 'Chú ý' : 'Bình thường';
      return `
        <div class="hydro-card">
          <div class="hydro-card__head">
            <div>
              <div class="hydro-card__name">${s.name}
                <span class="hydro-card__type">${s.type}</span>
              </div>
            </div>
            <div class="hydro-status ${statusClass}">
              <span class="hydro-status__dot"></span>
              ${statusLabel}
            </div>
          </div>
          <div class="hydro-metrics">
            <div class="hydro-metric hydro-metric--sal">
              <span class="hydro-metric__val">${s.salinity}‰</span>
              <span class="hydro-metric__lbl">Độ mặn</span>
            </div>
            <div class="hydro-metric hydro-metric--wl">
              <span class="hydro-metric__val">${s.waterLevel}m</span>
              <span class="hydro-metric__lbl">Mực nước</span>
            </div>
            <div class="hydro-metric hydro-metric--flow">
              <span class="hydro-metric__val">${s.flowRate} m³/s</span>
              <span class="hydro-metric__lbl">Lưu lượng</span>
            </div>
            <div class="hydro-metric hydro-metric--tide">
              <span class="hydro-metric__val">${s.tide}</span>
              <span class="hydro-metric__lbl">Thủy triều</span>
            </div>
          </div>
          <div class="hydro-card__footer">
            <span>${s.id}</span>
            <span class="hydro-card__time">⛳ ${now}</span>
          </div>
        </div>`;
    }).join('');
  }

  /* ───────────────────────────────────────────────────────────────
   * HERO PARTICLES
   * ─────────────────────────────────────────────────────────────── */
  function initHeroParticles() {
    const canvas = $('heroParticles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const hero = canvas.closest('.comp-hero');
    if (!hero) return;

    let W, H, particles = [];
    const PARTICLE_COUNT = 35;

    function resize() {
      W = hero.offsetWidth;
      H = hero.offsetHeight;
      canvas.width = W * (window.devicePixelRatio || 1);
      canvas.height = H * (window.devicePixelRatio || 1);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }

    function createParticle() {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
        color: Math.random() > 0.5 ? '59,158,255' : '124,92,255',
      };
    }

    function init() {
      resize();
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(createParticle());
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        ctx.fill();
      });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(59,158,255,${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener('resize', () => { resize(); });
  }

  /* ───────────────────────────────────────────────────────────────
   * 3D EARTH GLOBE
   * ─────────────────────────────────────────────────────────────── */
  function init3DEarth() {
    const canvas = $('earthGlobe');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, R, cx, cy;
    let rotation = 0;
    const ROTATION_SPEED = 0.003;

    // Cà Mau coordinates in radians
    const CA_MAU = { lat: 9.18 * Math.PI / 180, lon: 105.15 * Math.PI / 180 };

    // Simplified continent outlines (lat, lon in degrees)
    const CONTINENTS = [
      // Vietnam
      [[25, 100], [23, 104], [22, 106], [21, 107], [18, 106], [16, 108], [14, 109], [11, 109], [9, 105], [8, 104], [7, 103], [1, 104], [1, 110], [7, 117], [10, 119], [15, 119], [18, 117], [20, 112], [21, 110], [23, 108], [25, 108], [25, 100]],
      // China 
      [[25, 100], [28, 105], [30, 110], [32, 118], [35, 120], [38, 122], [40, 124], [42, 130], [45, 132], [48, 135], [50, 140], [42, 140], [40, 135], [38, 130], [35, 128], [30, 122], [25, 118], [22, 114], [25, 108], [25, 100]],
      // India
      [[30, 68], [28, 72], [25, 70], [22, 69], [20, 72], [18, 73], [15, 74], [12, 76], [10, 77], [8, 77], [8, 79], [12, 80], [15, 80], [18, 83], [20, 86], [22, 88], [23, 90], [25, 92], [28, 97], [30, 97], [32, 92], [35, 88], [35, 78], [33, 72], [30, 68]],
      // Australia
      [[-12, 130], [-14, 127], [-18, 122], [-22, 114], [-26, 113], [-30, 115], [-34, 117], [-37, 140], [-38, 145], [-38, 148], [-34, 151], [-28, 153], [-24, 150], [-20, 149], [-16, 145], [-14, 142], [-12, 136], [-12, 130]],
      // Africa 
      [[35, 10], [37, -1], [35, -5], [30, -10], [25, -16], [20, -17], [15, -17], [10, -14], [5, -8], [0, 9], [-5, 12], [-10, 14], [-15, 12], [-20, 15], [-25, 20], [-30, 27], [-34, 25], [-34, 28], [-28, 32], [-20, 35], [-10, 40], [-2, 42], [5, 50], [10, 51], [15, 50], [20, 42], [25, 36], [30, 32], [32, 30], [35, 10]],
      // Europe
      [[36, -5], [38, 0], [43, 3], [46, 7], [48, 2], [50, 5], [52, 8], [54, 10], [56, 12], [58, 15], [60, 20], [62, 28], [60, 30], [55, 28], [50, 30], [47, 25], [45, 22], [42, 20], [40, 18], [38, 15], [37, 12], [36, 10], [36, -5]],
      // south  America
      [[12, -72], [10, -75], [5, -77], [0, -80], [-5, -81], [-10, -78], [-15, -75], [-20, -63], [-25, -65], [-30, -70], [-35, -72], [-40, -68], [-45, -72], [-50, -74], [-54, -68], [-52, -60], [-45, -65], [-40, -62], [-35, -58], [-30, -50], [-25, -48], [-20, -40], [-15, -39], [-10, -37], [-5, -35], [0, -50], [5, -60], [8, -62], [10, -67], [12, -72]],
      // North America
      [[15, -90], [20, -100], [25, -110], [30, -118], [35, -120], [40, -124], [45, -124], [50, -128], [55, -130], [60, -140], [65, -165], [68, -165], [70, -155], [72, -130], [70, -90], [65, -75], [60, -65], [55, -60], [50, -55], [48, -63], [45, -65], [42, -70], [40, -75], [35, -80], [30, -85], [30, -82], [28, -80], [25, -80], [20, -90], [15, -90]],
      // Japan/Korea
      [[33, 130], [35, 133], [37, 137], [40, 140], [42, 143], [44, 145], [45, 142], [43, 140], [40, 138], [37, 135], [35, 130], [33, 130]],
      // Indonesia/Philippines
      [[-6, 105], [-7, 108], [-8, 112], [-8, 115], [-7, 118], [-5, 119], [-3, 117], [-2, 112], [-3, 108], [-5, 106], [-6, 105]],
      [[5, 120], [7, 122], [10, 124], [15, 121], [18, 120], [14, 119], [10, 118], [7, 117], [5, 120]],
    ];

    function resize() {
      const heroCard = canvas.closest('.comp-hero') || canvas.parentElement;
      const heroH = heroCard.offsetHeight || 400;
      const parentW = canvas.parentElement.offsetWidth || 360;
      const size = Math.min(parentW, heroH - 40, 400);
      const finalSize = Math.max(size, 200);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = finalSize * dpr;
      canvas.height = finalSize * dpr;
      canvas.style.width = finalSize + 'px';
      canvas.style.height = finalSize + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = finalSize;
      H = finalSize;
      R = finalSize * 0.42;
      cx = finalSize / 2;
      cy = finalSize / 2;
    }

    function project(latDeg, lonDeg) {
      const lat = latDeg * Math.PI / 180;
      const lon = lonDeg * Math.PI / 180 + rotation;
      const x3d = Math.cos(lat) * Math.sin(lon);
      const y3d = -Math.sin(lat);
      const z3d = Math.cos(lat) * Math.cos(lon);
      if (z3d < -0.05) return null;
      return { x: cx + x3d * R, y: cy + y3d * R, z: z3d };
    }

    function drawFrame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const atmoGrad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.3);
      atmoGrad.addColorStop(0, 'rgba(59,158,255,0)');
      atmoGrad.addColorStop(0.5, 'rgba(59,158,255,0.06)');
      atmoGrad.addColorStop(0.8, 'rgba(59,158,255,0.03)');
      atmoGrad.addColorStop(1, 'rgba(59,158,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = atmoGrad;
      ctx.fill();

      const oceanGrad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
      oceanGrad.addColorStop(0, 'rgba(30,85,170,0.95)');
      oceanGrad.addColorStop(0.5, 'rgba(15,50,120,0.9)');
      oceanGrad.addColorStop(1, 'rgba(8,28,70,0.85)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = oceanGrad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(59,158,255,0.1)';
      ctx.lineWidth = 0.5;

      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lon = -180; lon <= 180; lon += 3) {
          const p = project(lat, lon);
          if (p) {
            if (!started) { ctx.moveTo(p.x, p.y); started = true; }
            else ctx.lineTo(p.x, p.y);
          } else { started = false; }
        }
        ctx.stroke();
      }

      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 3) {
          const p = project(lat, lon);
          if (p) {
            if (!started) { ctx.moveTo(p.x, p.y); started = true; }
            else ctx.lineTo(p.x, p.y);
          } else { started = false; }
        }
        ctx.stroke();
      }

      CONTINENTS.forEach(continent => {
        ctx.beginPath();
        let started = false;
        let visible = false;
        continent.forEach(([lat, lon]) => {
          const p = project(lat, lon);
          if (p) {
            if (!started) { ctx.moveTo(p.x, p.y); started = true; }
            else ctx.lineTo(p.x, p.y);
            visible = true;
          } else { started = false; }
        });
        if (visible) {
          ctx.closePath();
          const depth = 0.6 + Math.sin(rotation * 0.5) * 0.1;
          ctx.fillStyle = `rgba(60,180,100,${0.35 * depth})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(80,210,120,${0.4 * depth})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      });

      const cloudAlpha = 0.12;
      for (let i = 0; i < 8; i++) {
        const cLat = Math.sin(i * 1.7 + Date.now() * 0.00002) * 50;
        const cLon = (i * 47 + Date.now() * 0.008) % 360 - 180;
        const p = project(cLat, cLon);
        if (p && p.z > 0.1) {
          const cloudR = R * (0.06 + Math.sin(i * 2.3) * 0.03);
          const cg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cloudR);
          cg.addColorStop(0, `rgba(255,255,255,${cloudAlpha * p.z})`);
          cg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath();
          ctx.arc(p.x, p.y, cloudR, 0, Math.PI * 2);
          ctx.fillStyle = cg;
          ctx.fill();
        }
      }

      const cmLatDeg = 9.18, cmLonDeg = 105.15;
      const cm = project(cmLatDeg, cmLonDeg);
      if (cm && cm.z > 0) {
        const pulse = 1 + Math.sin(Date.now() * 0.004) * 0.3;

        const mg = ctx.createRadialGradient(cm.x, cm.y, 0, cm.x, cm.y, 12 * pulse);
        mg.addColorStop(0, 'rgba(255,100,50,0.6)');
        mg.addColorStop(0.5, 'rgba(255,100,50,0.2)');
        mg.addColorStop(1, 'rgba(255,100,50,0)');
        ctx.beginPath();
        ctx.arc(cm.x, cm.y, 12 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = mg;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cm.x, cm.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6432';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (cm.z > 0.3) {
          ctx.font = 'bold 10px "DM Sans", system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'left';
          ctx.fillText('Cà Mau', cm.x + 10, cm.y - 4);
          ctx.font = '8px "DM Sans", system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillText('9.18°N, 105.15°E', cm.x + 10, cm.y + 7);
        }
      }

      const specGrad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 0, cx, cy, R);
      specGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
      specGrad.addColorStop(0.4, 'rgba(255,255,255,0.03)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = specGrad;
      ctx.fill();

      const edgeGrad = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.02);
      edgeGrad.addColorStop(0, 'rgba(59,158,255,0)');
      edgeGrad.addColorStop(0.7, 'rgba(59,158,255,0.15)');
      edgeGrad.addColorStop(1, 'rgba(59,158,255,0.05)');
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = edgeGrad;
      ctx.fill();

      rotation += ROTATION_SPEED;
      requestAnimationFrame(drawFrame);
    }

    resize();
    drawFrame();
    window.addEventListener('resize', resize);
  }
  async function init() {
    injectCSS();
    injectHTML();
    patchSelectWard();
    startLiveClock();
    initGPSButton();
    initSearchOverlay();
    initSMSModal();
    initHeroParticles();
    init3DEarth();

    await new Promise(r => setTimeout(r, 800));
    const coords = window.WARDS_COORDS || [];
    if (coords.length) {
      const c = coords.find(c => c.id === 1) || coords[0];
      setLocation(c.lat, c.lon, window.WARDS?.[0]?.name || DEFAULT_NAME);
    }

    await refreshAll();

    fetchComparison();
    renderHydroStations();

    setInterval(renderHydroStations, 30000);

    setInterval(fetchComparison, 60000);

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
    const ro = new ResizeObserver(() => {
      renderDailyChart();
      renderComparisonChart();
      if (typeof window.renderChart === 'function') window.renderChart();
    });
    const tc = $('tempChart');
    if (tc) ro.observe(tc);
    const cc = $('comparisonChart');
    if (cc) ro.observe(cc);

    console.log('✅ AeroCast Real-Time Engine v3.0 — sẵn sàng (Cà Mau mới + cũ)');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 900);
  }
})();