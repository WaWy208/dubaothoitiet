(function () {

  'use strict';
  const WeatherAI = {
    predictNext(temps) {
      const n = temps.length;
      if (n < 2) return temps[n - 1] || 0;
      let xSum = 0, ySum = 0, xxSum = 0, xySum = 0;
      for (let i = 0; i < n; i++) {
        xSum += i; ySum += temps[i];
        xxSum += i * i; xySum += i * temps[i];
      }
      const denom = (n * xxSum - xSum * xSum);
      if (denom === 0) return ySum / n;
      const m = (n * xySum - xSum * ySum) / denom;
      const b = (ySum - m * xSum) / n;
      return Math.round((m * n + b) * 10) / 10;
    },
    predictTomorrow(history) {
      if (!history || history.length < 3) return null;
      const maxes = history.map(h => h.hi).filter(v => v !== null);
      const avgs = history.map(h => (h.hi + h.lo) / 2).filter(v => !isNaN(v));

      if (maxes.length < 3) return null;

      return {
        max: this.predictNext(maxes),
        avg: this.predictNext(avgs)
      };
    },
    getAdvice(predTemp, currentTemp, humidity, rainProb, windSpeed, uvIndex, cloudCover) {
      let aqua = [];
      let level = 'Thấp';
      let score = 0;

      if (predTemp >= 35) {
        aqua.push("Nhiệt độ cực cao: Tôm dễ chết do sốc nhiệt");
        score += 4;
      } else if (predTemp >= 32) {
        aqua.push("Nắng nóng: Tăng cường sục khí, giảm thức ăn");
        score += 2;
      }

      if (rainProb >= 0.75) {
        aqua.push("Mưa rất lớn: Độ mặn sẽ giảm mạnh, nguy cơ sốc nước");
        score += 3;
      } else if (rainProb >= 0.5) {
        aqua.push("Cảnh báo mưa: Kiểm tra độ mặn thường xuyên");
        score += 1;
      }

      if (predTemp >= 34 || rainProb >= 0.7 || Math.abs(predTemp - currentTemp) > 4) {
        aqua.push("Không nên thay nước hôm nay (Tránh gây thêm sốc)");
        score += 2;
      }

      if (cloudCover > 80 && humidity > 85 && currentTemp > 30) {
        aqua.push("Nguy cơ hạ Oxy hòa tan (DO)");
        score += 1;
      }
      if (windSpeed > 25) {
        aqua.push("Gió mạnh: Chú ý sóng đánh tạt tôm vào bờ");
        score += 1;
      }

      if (score >= 6) level = 'Cao';
      else if (score >= 3) level = 'Trung bình';

      const mainAdvice = aqua.length ? aqua[0] : (predTemp > 30 ? "Nắng nóng" : "Thời tiết lý tưởng");

      return {
        text: mainAdvice,
        all: aqua,
        level: level
      };
    }
  };

  const OWM_KEY = '7f318ae139397881686e5acd8dce296c';
  const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
  const OWM_TILE = (layer) =>
    `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${OWM_KEY}`;

  const REFRESH_SEC = 60;
  const DEFAULT_LAT = 9.1769;
  const DEFAULT_LON = 105.1505;
  const DEFAULT_NAME = 'TP. Cà Mau';

  const savedSettings = JSON.parse(localStorage.getItem('weatherSettings') || '{}');
  const RT = {
    lat: savedSettings.lat || DEFAULT_LAT,
    lon: savedSettings.lon || DEFAULT_LON,
    name: savedSettings.name || DEFAULT_NAME,
    current: null, forecast: null, airPollution: null, history: [],
    onecall: null,
    countdownSec: REFRESH_SEC,
    countdownTimer: null,
    leafletMap: null, radarLayer: null, _marker: null,
    currentMapLayer: 'precipitation_new',
    dismissedAlerts: new Set(),
    isFahrenheit: savedSettings.isFahrenheit || (localStorage.getItem('weatherUnit') === 'F'),
    unit: () => RT.isFahrenheit ? 'F' : 'C',
    dispT: (c) => RT.unit() === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c),
    historyMeta: { ts: 0, lat: null, lon: null },
    isPersonalized: !!savedSettings.name,
    favorites: savedSettings.favorites || []
  };

  function saveSettings() {
    const settings = {
      lat: RT.lat,
      lon: RT.lon,
      name: RT.name,
      isFahrenheit: RT.isFahrenheit,
      favorites: RT.favorites
    };
    localStorage.setItem('weatherSettings', JSON.stringify(settings));
    RT.isPersonalized = true;
  }

  function toggleFavorite(id) {
    const idx = RT.favorites.indexOf(id);
    if (idx === -1) {
      RT.favorites.push(id);
      toast('Đã thêm vào yêu thích', 'success');
    } else {
      RT.favorites.splice(idx, 1);
      toast('Đã xóa khỏi yêu thích', 'info');
    }
    saveSettings();
  }
  const HISTORY_CACHE_KEY = 'rt_history_cache_v2';
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  function weatherEmoji(code) {
    if (code == null) return { icon: '☀️', desc: 'Nắng' };
    if (code >= 1000) {
      const wmo = code - 1000;
      if (wmo === 0) return { icon: '☀️', desc: 'Trời quang' };
      if (wmo <= 3) return { icon: '🌤️', desc: 'Ít mây' };
      if (wmo <= 48) return { icon: '🌫️', desc: 'Sương mù' };
      if (wmo <= 67) return { icon: '🌧️', desc: 'Mưa nhẹ' };
      if (wmo <= 77) return { icon: '❄️', desc: 'Tuyết' };
      if (wmo <= 82) return { icon: '🌦️', desc: 'Mưa rào' };
      if (wmo <= 99) return { icon: '⛈️', desc: 'Giông sét' };
      return { icon: '☁️', desc: 'Nhiều mây' };
    }
    if (code < 300) return { icon: '⛈️', desc: 'Giông sét' };
    if (code < 600) return { icon: '🌧️', desc: 'Mưa' };
    if (code < 700) return { icon: '❄️', desc: 'Tuyết' };
    if (code < 800) return { icon: '🌫️', desc: 'Sương' };
    if (code === 800) return { icon: '☀️', desc: 'Nắng' };
    if (code <= 802) return { icon: '🌤️', desc: 'Ít mây' };
    return { icon: '☁️', desc: 'Nhiều mây' };
  }

  function weatherEmojiDayNight(code, isDay) {
    if (code < 300) return '⛈️';
    if (code < 600) return isDay ? '🌦️' : '🌧️';
    if (code < 700) return '❄️';
    if (code < 800) return '🌫️';
    if (code === 800) return isDay ? '☀️' : '🌙';
    if (code <= 802) return isDay ? '🌤️' : '🌥️';
    return '☁️';
  }

  function isDayAt(dtSec) {
    const h = new Date(dtSec * 1000).getHours();
    return h >= 5 && h < 18;
  }

  function isDayNow() {
    const sys = RT.current?.sys;
    if (sys?.sunrise && sys?.sunset) {
      const now = Date.now() / 1000;
      return now >= sys.sunrise && now < sys.sunset;
    }
    const h = new Date().getHours();
    return h >= 6 && h < 18;
  }

  function sunEventIcon(dtSec) {
    const sys = RT.current?.sys;
    if (!sys?.sunrise || !sys?.sunset) return null;
    const near = 45 * 60;
    if (Math.abs(dtSec - sys.sunrise) <= near) return '🌅';
    if (Math.abs(dtSec - sys.sunset) <= near) return '🌇';
    return null;
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

  function debounce(fn, ms) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function setupNotifications() {
    if (!('Notification' in window)) return;
    const btn = $('notifyBtn');
    const updateBtn = () => {
      if (!btn) return;
      btn.style.display = (Notification.permission === 'granted' ? 'none' : 'inline-flex');
    };
    updateBtn();
    if (btn) {
      btn.addEventListener('click', () => {
        Notification.requestPermission().then(updateBtn).catch(updateBtn);
      });
    }
  }

  function collectAlertStatus() {
    try {
      const list = [
        { id: 'roadAlert', title: 'Ra đường' },
        { id: 'farmAlert', title: 'Nông nghiệp' },
        { id: 'aquaAlert', title: 'Thủy sản' },
        { id: 'aiAlert', title: 'AI Thông minh' },
      ];
      const levels = { danger: 2, warn: 1, alert: 2 };
      let best = null;
      list.forEach(item => {
        const el = $(item.id);
        if (!el || el.hidden) return;
        const lvl = el.dataset.level;
        if (!levels[lvl]) return;
        const msg = el.dataset.message || el.textContent || '';
        const score = levels[lvl];
        if (!best || score > best.score) {
          best = { score, level: lvl === 'alert' ? 'danger' : lvl, title: item.title, message: msg };
        }
      });
      return best;
    } catch (e) {
      console.warn('[Alerts] Error collecting status', e);
      return null;
    }
  }

  function notifyIfNeeded() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const status = collectAlertStatus();
    if (!status) return;

    const sig = `${status.level}|${status.title}|${status.message}`;
    const now = Date.now();
    let last = {};
    try { last = JSON.parse(localStorage.getItem('rt_notify_last') || '{}'); } catch (_) { }
    if (last.sig === sig && now - (last.ts || 0) < 30 * 60 * 1000) return;

    const loc = RT.name || 'Khu vực hiện tại';
    const title = status.level === 'danger'
      ? `Cảnh báo nguy hiểm · ${status.title}`
      : `Cảnh báo · ${status.title}`;
    const body = `${loc}: ${status.message || 'Có điều kiện cần theo dõi.'}`;
    try {
      new Notification(title, { body, tag: 'rt-alert', renotify: true });
      localStorage.setItem('rt_notify_last', JSON.stringify({ sig, ts: now }));
    } catch (_) { }
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

  function cleanBaseUrl(value) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
  }

  function getApiBaseUrl() {
    try {
      const fromQuery = new URLSearchParams(location.search).get('api');
      if (fromQuery) return cleanBaseUrl(fromQuery);
    } catch (_) { }

    try {
      const fromWindow = window.WEATHER_API_BASE_URL || window.API_BASE_URL;
      if (fromWindow) return cleanBaseUrl(fromWindow);
    } catch (_) { }

    try {
      const fromStorage = localStorage.getItem('WEATHER_API_BASE_URL');
      if (fromStorage) return cleanBaseUrl(fromStorage);
    } catch (_) { }

    return '';
  }

  function resolveApiUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (!url.startsWith('/')) return url;

    const apiBase = getApiBaseUrl();
    if (!apiBase) return url;
    return `${apiBase}${url}`;
  }

  function fetchJson(url, { optional = false, ...options } = {}) {
    const resolvedUrl = resolveApiUrl(url);
    return fetch(resolvedUrl, options)
      .then((response) => {
        if (!response.ok) {
          if (optional) return null;
          throw new Error(`HTTP ${response.status} for ${resolvedUrl}`);
        }
        return response.json();
      })
      .catch((error) => {
        if (optional) return null;
        throw error;
      });
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
    const [cur, fc5, aqi, onecall] = await Promise.allSettled([
      owmGet('/weather'),
      owmGet('/forecast', { cnt: 40 }),
      fetchJson(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${RT.lat}&lon=${RT.lon}&appid=${OWM_KEY}`, { optional: true }),
      fetchJson(`https://api.openweathermap.org/data/3.0/onecall?lat=${RT.lat}&lon=${RT.lon}&exclude=minutely,hourly&units=metric&lang=vi&appid=${OWM_KEY}`, { optional: true }),
    ]);
    RT.current = cur.status === 'fulfilled' ? cur.value : null;
    RT.forecast = fc5.status === 'fulfilled' ? fc5.value : null;
    RT.airPollution = aqi.status === 'fulfilled' ? aqi.value : null;
    RT.onecall = onecall.status === 'fulfilled' ? onecall.value : null;
  }

  async function loadCropsData() {
    try {
      const r = await fetch('crops_by_ward.json', { cache: 'no-store' });
      if (r.ok) window.CROPS_BY_WARD = await r.json();
    } catch (err) {
      console.warn('[AeroCastRT] crops_by_ward.json not loaded', err);
    }
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
    if (Math.abs(RT.lat - lat) > 0.005 || Math.abs(RT.lon - lon) > 0.005) {
      RT.historyMeta = { ts: 0, lat: null, lon: null };
      RT.history = [];
    }
    RT.lat = lat;
    RT.lon = lon;
    RT.name = name;
    if (RT.leafletMap && RT._marker) {
      RT._marker.setLatLng([lat, lon]).setPopupContent(`<b>${name}</b><br>Vị trí đang xem`).openPopup();
      RT.leafletMap.panTo([lat, lon], { animate: true });
    }
    if (window.updateGPSMarker) window.updateGPSMarker(lat, lon);
    const fc = $('footerCoords');
    if (fc) fc.textContent = ` GPS: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
  }

  function setGpsButtonState(isLoading) {
    const btn = $('gpsBtn');
    if (!btn) return;

    btn.disabled = isLoading;
    btn.innerHTML = isLoading
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" style="animation:rt-spin 1s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>GPS…</span>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20"/><path d="M12 2v20"/></svg><span>GPS</span>`;
  }

  function triggerGPS(isAuto = false) {
    if (!navigator.geolocation) {
      if (!isAuto) toast('Trình duyệt không hỗ trợ GPS', 'warn');
      return Promise.resolve(false);
    }

    setGpsButtonState(true);

    const hourlyWrap = qs('.hourly-track-wrap');
    if (hourlyWrap) hourlyWrap.classList.add('is-refreshing');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: la, longitude: lo, accuracy: acc } = pos.coords;
          const result = nearestWard(la, lo);
          const ward = result?.ward;

          if (ward) {
            setLocation(la, lo, ward.name);
            if (window.selectWard) window.selectWard(ward, { lat: la, lon: lo });
          } else {
            setLocation(la, lo, `${la.toFixed(3)}°N`);
          }

          setGpsButtonState(false);

          const distTxt = result?.dist < 50
            ? `${(result.dist * 1000).toFixed(0)}m`
            : `${result?.dist?.toFixed(1)}km`;
          toast(` ${ward?.name || 'Vị trí GPS'} · ±${Math.round(acc)}m · ${distTxt} từ trung tâm xã`, 'success');

          await refreshAll();
          if (hourlyWrap) hourlyWrap.classList.remove('is-refreshing');
          resolve(true);
        },
        (err) => {
          if (hourlyWrap) hourlyWrap.classList.remove('is-refreshing');
          setGpsButtonState(false);
          const msgs = { 1: 'GPS bị từ chối quyền truy cập', 2: 'Không tìm thấy vị trí', 3: 'GPS timeout' };
          if (!isAuto) toast(msgs[err.code] || 'Lỗi GPS', 'warn');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  function initGPSButton() {
    const btn = $('gpsBtn');
    if (!btn) return;
    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    setGpsButtonState(false);
    nb.addEventListener('click', () => triggerGPS(false));
  }

  function renderMoon() {
    const now = new Date();
    const refNewMoon = new Date('2024-02-09T22:59:00Z');
    const lunCycle = 29.530588853;

    const daily = RT.onecall?.daily?.[0];
    let phaseValue = null;
    if (daily && typeof daily.moon_phase === 'number') phaseValue = daily.moon_phase;

    const age = phaseValue != null
      ? (phaseValue * lunCycle)
      : ((now - refNewMoon) / (1000 * 60 * 60 * 24)) % lunCycle;
    const illum = phaseValue != null
      ? 50 * (1 - Math.cos(2 * Math.PI * phaseValue))
      : 50 * (1 - Math.cos((2 * Math.PI * age) / lunCycle));

    let phase = 'Trăng mới', icon = '🌑';
    if (phaseValue != null) {
      if (phaseValue <= 0.02 || phaseValue >= 0.98) { phase = 'Trăng mới'; icon = '🌑'; }
      else if (phaseValue < 0.25) { phase = 'Trăng khuyết đầu tháng'; icon = '🌒'; }
      else if (phaseValue <= 0.27) { phase = 'Trăng thượng huyền'; icon = '🌓'; }
      else if (phaseValue < 0.5) { phase = 'Trăng lồi đầu tháng'; icon = '🌔'; }
      else if (phaseValue <= 0.52) { phase = 'Trăng tròn'; icon = '🌕'; }
      else if (phaseValue < 0.75) { phase = 'Trăng lồi cuối tháng'; icon = '🌖'; }
      else if (phaseValue <= 0.77) { phase = 'Trăng hạ huyền'; icon = '🌗'; }
      else { phase = 'Trăng khuyết cuối tháng'; icon = '🌘'; }
    } else {
      if (age < 1.1) { phase = 'Trăng mới'; icon = '🌑'; }
      else if (age < 6.4) { phase = 'Trăng khuyết đầu tháng'; icon = '🌒'; }
      else if (age < 8.4) { phase = 'Trăng thượng huyền'; icon = '🌓'; }
      else if (age < 13.7) { phase = 'Trăng lồi đầu tháng'; icon = '🌔'; }
      else if (age < 15.8) { phase = 'Trăng tròn'; icon = '🌕'; }
      else if (age < 21.1) { phase = 'Trăng lồi cuối tháng'; icon = '🌖'; }
      else if (age < 23.1) { phase = 'Trăng hạ huyền'; icon = '🌗'; }
      else if (age < 28.4) { phase = 'Trăng khuyết cuối tháng'; icon = '🌘'; }
      else { phase = 'Trăng mới'; icon = '🌑'; }
    }

    setTxt('moonAge', age.toFixed(1));
    setTxt('moonIllum', Math.round(illum) + '%');
    setTxt('moonPhaseName', phase);
    setTxt('moonPhaseVisual', icon);

    const fmt = d => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (daily?.moonrise && daily?.moonset) {
      setTxt('moonRise', fmt(new Date(daily.moonrise * 1000)));
      setTxt('moonSetTime', fmt(new Date(daily.moonset * 1000)));
    } else {
      const sr = new Date(RT.current?.sys?.sunrise * 1000 || Date.now());
      const mRise = new Date(sr.getTime() + (age / lunCycle) * 24 * 3600 * 1000);
      const mSet = new Date(mRise.getTime() + 12 * 3600 * 1000);
      setTxt('moonRise', fmt(mRise));
      setTxt('moonSetTime', fmt(mSet));
    }
  }

  function renderTide() {
    const canvas = $('tideChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 600;
    const H = 100;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

    const now = new Date();
    const hrCurrent = now.getHours() + now.getMinutes() / 60;
    const points = [];
    const schedule = [];

    const moonAge = ((now - new Date('2024-02-09')) / (1000 * 3600 * 24) % 29.53);
    const moonOffset = (moonAge / 29.53) * 2 * Math.PI;

    const lon = RT.lon || 105.15;
    const lat = RT.lat || 9.17;
    const spatialPhase = (lon - 105.15) * 1.5;
    const diurnalWeight = Math.max(0, Math.min(1, (105.5 - lon) / 1.0));

    for (let h = 0; h <= 24; h += 0.5) {
      const t = h;
      const tidalDay = 24.84;

      const m2 = 0.5 * Math.sin(2 * Math.PI * (t / 12.42) - moonOffset - spatialPhase);
      const k1 = 0.4 * Math.sin(2 * Math.PI * (t / 24.0) - moonOffset / 2 - spatialPhase / 2);
      const height = (1 - diurnalWeight) * m2 + diurnalWeight * k1 + 1.2;

      points.push({ x: (h / 24) * W, y: H - (height / 2.5) * H });

      if (h > 0 && h < 24) {
        const prevH = height;
        const nextH = (1 - diurnalWeight) * (0.5 * Math.sin(2 * Math.PI * ((h + 0.1) / 12.42) - moonOffset - spatialPhase))
          + diurnalWeight * (0.4 * Math.sin(2 * Math.PI * ((h + 0.1) / 24.0) - moonOffset / 2 - spatialPhase / 2)) + 1.2;
        const lastH = (1 - diurnalWeight) * (0.5 * Math.sin(2 * Math.PI * ((h - 0.1) / 12.42) - moonOffset - spatialPhase))
          + diurnalWeight * (0.4 * Math.sin(2 * Math.PI * ((h - 0.1) / 24.0) - moonOffset / 2 - spatialPhase / 2)) + 1.2;

        if ((prevH > lastH && prevH > nextH) || (prevH < lastH && prevH < nextH)) {
          const type = prevH > lastH ? 'Lớn' : 'Ròng';
          const time = new Date(now); time.setHours(Math.floor(h), (h % 1) * 60);
          schedule.push({ type, time, h: prevH });
        }
      }
    }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.05)');
    ctx.beginPath(); ctx.moveTo(0, H);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5; ctx.stroke();

    const curX = (hrCurrent / 24) * W;
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(curX, 0); ctx.lineTo(curX, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke(); ctx.setLineDash([]);

    const schedEl = $('tideSchedule');
    if (schedEl) {
      const stations = generateHydroData();
      const tideStations = stations.filter(s => s.tide && s.tide !== 'N/A' && Number.isFinite(s.lat) && Number.isFinite(s.lon));
      const st = tideStations.length
        ? tideStations.reduce((best, s) => {
          const d = haversine(RT.lat, RT.lon, s.lat, s.lon);
          return !best || d < best.dist ? { s, dist: d } : best;
        }, null).s
        : (stations[0] || null);
      const isRising = st?.tide === 'Triều lên';
      const levelNow = st?.waterLevel ? `${st.waterLevel}m` : '--';
      const legend = `
        <div class="tide-legend">
          <span class="tide-legend-pill ${isRising ? 'tide-legend-pill--up' : 'tide-legend-pill--down'}">
            ${isRising ? '▲ Triều lên' : '▼ Triều rút'} ${levelNow}
          </span>
          <span class="tide-legend-note">Theo trạm gần nhất: ${st?.name || '—'}</span>
        </div>
      `;
      schedEl.innerHTML = legend + schedule.sort((a, b) => a.time - b.time).map(s => `
        <div class="tide-item ${s.type === 'Lớn' ? 'tide-item--up' : 'tide-item--down'}">
          <span class="tide-type">${s.type === 'Lớn' ? '▲ Triều lên' : '▼ Triều rút'}</span>
          <span class="tide-time">${s.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="tide-height">${s.h.toFixed(2)}m</span>
        </div>
      `).join('');
    }
  }

  async function fetchAIPrediction() {
    const aiStat = $('aiTempPred');
    const aiStatus = $('aiStatusText');
    const adviceEl = $('aiAdvice');
    const alertEl = $('aiAlert');
    const alertFrame = $('aiAlertFrame');

    if (!aiStat || !aiStatus) return;

    try {
      const forecastPoints = getInterpolated24h();
      if (!forecastPoints.length) return;

      const temps = forecastPoints.slice(0, 4).map(p => p.temp);
      const rainProb = forecastPoints[0]?.pop || 0;
      const humidity = RT.current?.main?.humidity || 0;
      const currentTemp = RT.current?.main?.temp || 0;
      const cloudCover = RT.current?.clouds?.all || 0;
      const uvIndex = RT.onecall?.current?.uvi || 0;
      const windSpeed = mps2kmh(RT.current?.wind?.speed || 0);
      const prediction = WeatherAI.predictNext(temps);
      const adviceObj = WeatherAI.getAdvice(prediction, currentTemp, humidity, rainProb, windSpeed, uvIndex, cloudCover);
      aiStat.textContent = RT.dispT(prediction) + (RT.unit() === 'F' ? '°F' : '°C');
      aiStatus.textContent = 'Máy học';

      if (adviceEl) {
        adviceEl.textContent = adviceObj.text;
        adviceEl.style.display = 'block';

        if (alertEl && alertFrame) {
          alertFrame.hidden = false;
          let cls = 'is-safe';
          if (adviceObj.level === 'Cao') {
            cls = 'is-danger';
          } else if (adviceObj.level === 'Trung bình') {
            cls = 'is-warn';
          }

          alertEl.className = `farm-alert ${cls}`;
          alertEl.innerHTML = `
            <div class="farm-alert-content">
              <div class="danger-row">
                <strong>Mức độ nguy hiểm:</strong>
                <span class="danger-badge danger-badge--${adviceObj.level.toLowerCase()}">${adviceObj.level}</span>
              </div>
              <div class="farm-advice-main">${adviceObj.text}</div>
              ${adviceObj.all.length > 1 ? `<div class="farm-advice-sub">${adviceObj.all.slice(1).join('<br>')}</div>` : ''}
            </div>
          `;
        }
      }

      const card = $('aiForecastCard');
      if (card) card.classList.add('ai-updated');

    } catch (err) {
      console.warn('[AI] Lỗi tính toán local', err);
    }
  }

  function renderAIComparison() {
    const aiMax = $('aiMaxPred');
    const apiMax = $('apiMaxPred');
    const aiAvg = $('aiAvgPred');
    const apiAvg = $('apiAvgPred');
    const errMax = $('aiMaxError');
    const errAvg = $('aiAvgError');

    if (!aiMax) return;

    if (!RT.history?.length || !RT.forecast?.list) {
      aiMax.textContent = '...';
      apiMax.textContent = '...';
      return;
    }

    const selfPred = WeatherAI.predictTomorrow(RT.history);
    if (!selfPred) {
      if (aiMax) aiMax.textContent = '...';
      if (apiMax) apiMax.textContent = '...';
      return;
    }

    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    const tomStr = tom.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

    const tomPoints = RT.forecast.list.filter(p => {
      const d = new Date(p.dt * 1000);
      return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' }) === tomStr;
    });

    if (!tomPoints.length) return;
    const apiMaxVal = Math.max(...tomPoints.map(p => p.main.temp));
    const apiAvgVal = tomPoints.reduce((s, p) => s + p.main.temp, 0) / tomPoints.length;

    aiMax.textContent = RT.dispT(selfPred.max) + '°';
    apiMax.textContent = RT.dispT(apiMaxVal) + '°';
    aiAvg.textContent = RT.dispT(selfPred.avg) + '°';
    apiAvg.textContent = RT.dispT(apiAvgVal) + '°';

    const calcErr = (self, api, el) => {
      const diff = Math.abs(self - api);
      const pct = (diff / api) * 100;
      el.textContent = `Sai số: ${pct.toFixed(1)}%`;
      el.className = 'ai-error-tag';
      if (pct < 3) el.classList.add('ai-error--low');
      else if (pct < 10) el.classList.add('ai-error--med');
      else el.classList.add('ai-error--high');
    };

    calcErr(selfPred.max, apiMaxVal, errMax);
    calcErr(selfPred.avg, apiAvgVal, errAvg);
  }

  function renderHero() {
    renderMoon();
    renderTide();
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
    if (iconEl) { iconEl.textContent = icon.icon; iconEl.title = desc; }
    setTxt('mainDesc', desc);

    setTxt('heroCity', RT.name);
    setTxt('currentLocSub', `${RT.name} · Real-time`);
    setTxt('heroSub', `${RT.name} · Real-time`);

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

    const pop = RT.forecast?.list?.[0]?.pop ?? 0;
    const rainProb = Math.round(pop * 100);
    setTxt('detailRainMm', `${rainProb}%`);
    setTxt('detailRainProb', 'Khả năng mưa trong vài giờ tới');
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

    const nearestSt = getNearestStationData();
    if (nearestSt && nearestSt.salinity && nearestSt.salinity !== 'N/A') {
      const salVal = parseFloat(nearestSt.salinity);
      const salStat = document.getElementById('detailSalinity');
      const salNote = document.getElementById('detailSalinityNote');
      const salBar = document.getElementById('salinityBarFill');

      let salFcst = salVal;
      const rainPoints = getInterpolated24h().slice(0, 12).reduce((sum, h) => sum + (h.pop || 0), 0);
      const isRaining = rainPoints > 3;
      if (isRaining) salFcst = Math.max(0, salVal - 0.2);

      if (salStat) {
        salStat.textContent = salFcst.toFixed(1) + '‰';
        if (salFcst <= 4) {
          salStat.className = 'detail-stat accent-ok';
          salNote.innerHTML = isRaining ?
            'An toàn, có xu hướng giảm do mưa.<br><span style="font-size:0.9em; opacity:0.8; display:block; margin-top:4px;">Gợi ý: Tranh thủ tích trữ nước ngọt bổ sung.</span>' :
            'An toàn cho nông nghiệp (≤ 4‰).<br><span style="font-size:0.9em; opacity:0.8; display:block; margin-top:4px;">Gợi ý: Thích hợp tưới tiêu và lấy nước vào ao thủy sản.</span>';
          salBar.style.backgroundColor = 'var(--ok)';
        } else if (salFcst <= 10) {
          salStat.className = 'detail-stat accent-warn';
          salNote.innerHTML = 'Cảnh báo xâm nhập mặn (4-10‰).<br><span style="font-size:0.9em; opacity:0.8; display:block; margin-top:4px;">Gợi ý: Hạn chế lấy nước sông. Tăng sục khí, đo mặn ao nuôi thường xuyên.</span>';
          salBar.style.backgroundColor = 'var(--warn)';
        } else {
          salStat.className = 'detail-stat accent-danger';
          salNote.innerHTML = 'Nguy hiểm: Rủi ro sinh thái cao (>10‰).<br><span style="font-size:0.9em; opacity:0.8; display:block; margin-top:4px;">Gợi ý: Tuyệt đối đóng cống. Bổ sung vitamin C, khoáng chất giảm sốc cho tôm/cá.</span>';
          salBar.style.backgroundColor = 'var(--danger)';
        }
        salBar.style.width = Math.min((salFcst / 15) * 100, 100) + '%';
      }
    }

    fetchAIPrediction();
    if (typeof renderSTEMLab === 'function') renderSTEMLab();
    applyDynamicBackground(d);
  }

  function applyDynamicBackground(d) {
    if (!d) return;
    const root = document.documentElement;
    const w = d.weather?.[0] || {};
    const clouds = d.clouds?.all ?? 0;
    const rain = d.rain?.['1h'] || d.rain?.['3h'] || 0;
    const snow = d.snow?.['1h'] || 0;

    let sky = 'clear';
    const id = w.id || 800;
    if (id >= 200 && id < 300) sky = 'storm';
    else if (id >= 300 && id < 600) sky = 'rain';
    else if (id >= 600 && id < 700) sky = 'snow';
    else if (id >= 700 && id < 800) sky = 'mist';
    else if (id === 800) sky = clouds > 20 ? 'cloudy' : 'clear';
    else if (id > 800) sky = 'cloudy';

    if ((rain + snow) >= 6) sky = 'storm';

    const now = d.dt || Math.floor(Date.now() / 1000);
    let isDay = true;
    if (d.sys?.sunrise && d.sys?.sunset) {
      isDay = now >= d.sys.sunrise && now < d.sys.sunset;
    } else {
      const hour = new Date().getHours();
      isDay = hour >= 6 && hour < 18;
    }

    root.setAttribute('data-sky', sky);
    root.setAttribute('data-day', isDay ? 'day' : 'night');
    root.style.setProperty('--sky-cloud', Math.min(clouds / 100, 1));
    root.style.setProperty('--sky-rain', Math.min((rain + snow) / 8, 1));
  }
  function getInterpolated24h() {
    const list = RT.forecast?.list;
    if (!list || list.length < 2) return [];
    const points = [];
    const now = list[0].dt;
    for (let h = 0; h < 24; h++) {
      const targetDt = now + h * 3600;
      let left = list[0], right = list[0];
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].dt <= targetDt && list[i + 1].dt >= targetDt) {
          left = list[i]; right = list[i + 1]; break;
        }
      }
      const p = left.dt === right.dt ? 0 : (targetDt - left.dt) / (right.dt - left.dt);
      points.push({
        dt: targetDt,
        temp: left.main.temp + (right.main.temp - left.main.temp) * p,
        pop: left.pop + (right.pop - left.pop) * p,
        wind: left.wind.speed + (right.wind.speed - left.wind.speed) * p,
        weather: p < 0.5 ? left.weather[0] : right.weather[0]
      });
    }
    return points;
  }

  function renderHourly() {
    const items = getInterpolated24h();
    if (!items.length) return;
    const track = $('hourlyTrack');
    if (!track) return;

    track.innerHTML = items.map((item, i) => {
      const dt = new Date(item.dt * 1000);
      const t = i === 0 ? 'Bây giờ' : dt.getHours() + ':00';
      const tempC = item.temp;
      const temp = RT.dispT(tempC);
      const rain = Math.round((item.pop || 0) * 100);
      const isDay = isDayAt(item.dt);
      const sunIcon = sunEventIcon(item.dt);
      const icon = sunIcon || weatherEmojiDayNight(item.weather?.id, isDay);

      let tCls = 'h-warm';
      if (tempC < 25) tCls = 'h-cool';
      else if (tempC >= 30) tCls = 'h-hot';

      const originalPoint = RT.forecast.list.find(p => Math.abs(p.dt - item.dt) < 1801);
      const deg = originalPoint?.wind?.deg || 0;

      return `
        <div class="hour-card ${tCls}${i === 0 ? ' active' : ''}">
          <div class="hour-time">${t}</div>
          <span class="hour-icon">${icon}</span>
          <div class="hour-temp">${temp}°</div>
          
          <div class="hour-wind-row">
            <svg class="hour-wind-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="transform: rotate(${deg}deg)">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
            <span>${mps2kmh(item.wind || 0)}</span>
          </div>

          <div class="hour-rain"> ${rain}%</div>
          <div class="rain-bar"><div class="rain-fill" style="width:${rain}%"></div></div>
        </div>`;
    }).join('');
  }

  function getCropsForWard(ward) {
    const data = window.CROPS_BY_WARD || {};
    const wards = data.wards || {};
    const districts = data.districts || {};
    if (ward?.id && wards[String(ward.id)]) return wards[String(ward.id)];
    if (ward?.district && districts[ward.district]) return districts[ward.district];
    return data.default || [];
  }

  function getNearestStationData() {
    const stations = generateHydroData();
    const tideStations = stations.filter(s => s.waterLevel && Number.isFinite(s.lat) && Number.isFinite(s.lon));
    if (!tideStations.length) return null;
    return tideStations.reduce((best, s) => {
      const d = haversine(RT.lat, RT.lon, s.lat, s.lon);
      return !best || d < best.dist ? { s, dist: d } : best;
    }, null)?.s || null;
  }

  function renderAquaAlert() {
    const banner = $('aquaAlert');
    if (!banner) return;

    const items = getInterpolated24h();
    if (!items.length || !RT.current) {
      banner.hidden = true;
      return;
    }

    const cur = RT.current;
    const nextHour = items[0] || cur;
    const curTemp = cur.main?.temp ?? 0;
    const nextTemp = nextHour.temp ?? curTemp;
    const heatIndex = cur.main?.feels_like ?? curTemp;
    const nextHeatIndex = nextHour.feels_like ?? nextTemp;

    const curWind = mps2kmh(cur.wind?.speed || 0);
    const nextWind = mps2kmh(nextHour.wind || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const nextRain = nextHour.rain || curRain;
    const nextPop = Math.round((nextHour.pop || 0) * 100);
    const isDay = isDayNow();

    const hasStorm = (nextHour.weather?.id || 0) >= 200 && (nextHour.weather?.id || 0) < 300;
    const hasWind = nextWind >= 28;
    const hasHeavyRain = nextRain >= 10 || nextPop >= 70;
    const hasHeat = nextHeatIndex >= 35;

    const nearestSt = getNearestStationData();
    const waterLvl = nearestSt ? parseFloat(nearestSt.waterLevel) : null;
    const hasHighTide = waterLvl != null && waterLvl > 2.5;
    const warnHighTide = waterLvl != null && waterLvl > 2.0 && waterLvl <= 2.5;

    const warnWind = nextWind >= 22;
    const warnRain = nextRain >= 5 || nextPop >= 50;
    const warnHeat = nextHeatIndex >= 31;

    const details = [];
    if (hasStorm) details.push(' Nguy hiểm: Dông sét gây sốc nước 60 phút tới');
    if (hasHeavyRain) details.push(` Nguy hiểm: Mưa lớn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% ≥ 10mm/70%)`);
    if (hasWind) details.push(` Nguy hiểm: Gió mạnh 60 phút tới (${nextWind.toFixed(1)}km/h ≥ 28km/h)`);
    if (hasHeat) {
      const advice = isDay ? "Che mát ao nuôi, tăng sục khí oxy" : "Tăng sục khí oxy (nhiệt nước còn cao), kiểm tra oxy hòa tan";
      details.push(` Nguy hiểm: Nắng nóng cực đại (${nextHeatIndex.toFixed(1)}°C ≥ 35°C) — ${advice}`);
    }
    if (hasHighTide) {
      const caution = isDay ? "Gia cố bờ bao, kiểm tra cống" : "Kiểm tra bờ bao bằng đèn pin, đề phòng sạt lở túi khí ban đêm";
      details.push(` Nguy hiểm: Mực triều (${waterLvl.toFixed(2)}m > 2.5m) — Cảnh báo ngập vùng nuôi tôm! ${caution}`);
    }

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(` Cảnh báo: Biến động độ mặn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}%)`);
    if (!hasWind && warnWind) warnDetails.push(` Cảnh báo: Gió khá mạnh 60 phút tới (${nextWind.toFixed(1)}km/h ≥ 22km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(` Cảnh báo: Nhiệt tăng 60 phút tới (${nextHeatIndex.toFixed(1)}°C ≥ 31°C)`);
    if (!hasHighTide && warnHighTide) warnDetails.push(` Cảnh báo: Mực nước cao (${waterLvl.toFixed(2)}m > 2.0m)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Thủy sản (60 phút tới - Nguy hiểm)</strong>: Rủi ro cao.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}${nearestSt ? ' (Trạm: ' + nearestSt.name + ')' : ''}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Thủy sản (60 phút tới - Cảnh báo)</strong>: Theo dõi.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Thủy sản ổn định (60 phút tới)</strong>: Không có rủi ro.` +
        `<span class="farm-meta">Vị trí: ${locLabel} (GPS) · Nguồn: OpenWeatherMap</span>`;
    }
  }

  function renderFarmAlert() {
    const banner = $('farmAlert');
    if (!banner) return;

    const items = getInterpolated24h();
    if (!items.length || !RT.current) {
      banner.hidden = true;
      return;
    }

    const cur = RT.current;
    const nextHour = items[0] || cur;
    const curTemp = cur.main?.temp ?? 0;
    const nextHourTemp = nextHour.temp ?? curTemp;
    const nextWind = mps2kmh(nextHour.wind || 0);
    const nextRain = nextHour.rain || 0;
    const nextPop = Math.round((nextHour.pop || 0) * 100);
    const isDay = isDayNow();

    const hasStorm = (nextHour.weather?.id || 0) >= 200 && (nextHour.weather?.id || 0) < 300;
    const hasHeat = nextHourTemp >= 35;
    const hasWind = nextWind >= 28;
    const hasHeavyRain = nextRain >= 10 || nextPop >= 70;

    const warnHeat = nextHourTemp >= 32;
    const warnWind = nextWind >= 22;
    const warnRain = nextRain >= 5 || nextPop >= 50;

    const details = [];
    if (hasStorm) details.push(' Nguy hiểm: Dông sét 60 phút tới (mã 2xx)');
    if (hasHeavyRain) details.push(` Nguy hiểm: Mưa lớn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% >= 10mm/70%)`);
    if (hasWind) details.push(` Nguy hiểm: Gió mạnh 60 phút tới (${nextWind.toFixed(1)} km/h >= 28 km/h)`);
    if (hasHeat) {
      const advice = isDay ? "Tưới nước buổi sáng sớm, che lưới cho cây trồng" : "Theo dõi nhiệt đất, chuẩn bị tưới sáng sớm mai";
      details.push(` Nguy hiểm: Nắng nóng cực đại (${nextHourTemp.toFixed(1)}°C >= 35°C) — ${advice}`);
    }

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(` Cảnh báo: Mưa/xác suất cao 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% >= 5mm/50%)`);
    if (!hasWind && warnWind) warnDetails.push(` Cảnh báo: Gió khá mạnh 60 phút tới (${nextWind.toFixed(1)} km/h >= 22 km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(` Cảnh báo: Nhiệt tăng 60 phút tới (${nextHourTemp.toFixed(1)}°C >= 32°C)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const crops = getCropsForWard(wardInfo);
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Cảnh báo Nông nghiệp (60 phút tới)</strong>: Nguy hiểm.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `${crops.length ? ` Cây trồng chính: ${crops.join(', ')}.` : ''}` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Cây trồng: ${crops.join(', ') || 'Đang cập nhật'}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Cảnh báo Nông nghiệp (60 phút tới)</strong>: Theo dõi.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Nông nghiệp ổn định (60 phút tới)</strong>: Thuận lợi.` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Cây trồng: ${crops.join(', ') || 'Đang cập nhật'}</span>`;
    }
  }

  function renderRoadAlert() {
    const banner = $('roadAlert');
    if (!banner) return;

    const items = getInterpolated24h();
    if (!items.length || !RT.current) {
      banner.hidden = true;
      return;
    }

    const cur = RT.current;
    const nextHour = items[0] || cur;
    const curTemp = cur.main?.temp ?? 0;
    const nextTemp = nextHour.temp ?? curTemp;
    const nextWind = mps2kmh(nextHour.wind || 0);
    const nextRain = nextHour.rain || 0;
    const nextPop = Math.round((nextHour.pop || 0) * 100);
    const visibilityKm = cur.visibility != null ? (cur.visibility / 1000) : null;
    const isDay = isDayNow();

    const hasStorm = (nextHour.weather?.id || 0) >= 200 && (nextHour.weather?.id || 0) < 300;
    const hasWind = nextWind >= 28;
    const hasHeavyRain = nextRain >= 10 || nextPop >= 70;
    const hasHeat = nextTemp >= 35;
    const hasLowVis = visibilityKm != null && visibilityKm < 2;

    const warnWind = nextWind >= 22;
    const warnRain = nextRain >= 5 || nextPop >= 50;
    const warnHeat = nextTemp >= 31;
    const warnVis = visibilityKm != null && visibilityKm < 4;

    const details = [];
    if (hasStorm) details.push(' Nguy hiểm: Dông sét 60 phút tới, hạn chế di chuyển');
    if (hasHeavyRain) details.push(` Nguy hiểm: Mưa lớn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% >= 10mm/70%)`);
    if (hasWind) details.push(` Nguy hiểm: Gió mạnh 60 phút tới (${nextWind.toFixed(1)}km/h >= 28km/h)`);
    if (hasHeat) details.push(` Nguy hiểm: Nắng nóng cực đại (${nextTemp.toFixed(1)}°C >= 35°C) — ${isDay ? "Dễ mất nước, say nắng" : "Cần bù nước, nhiệt đường còn cao"}`);
    if (hasLowVis) {
      const advice = isDay ? "Bật đèn sương mù, đi chậm" : "Bật đèn chiếu sáng xa/gần, chú ý quan sát vật cản";
      details.push(` Nguy hiểm: Tầm nhìn thấp (${visibilityKm.toFixed(1)}km < 2km) — ${advice}`);
    }

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(` Cảnh báo: Có mưa 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}%)`);
    if (!hasWind && warnWind) warnDetails.push(` Cảnh báo: Gió khá mạnh 60 phút tới (${nextWind.toFixed(1)}km/h >= 22km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(` Cảnh báo: Nhiệt cao 60 phút tới (${nextTemp.toFixed(1)}°C >= 31°C)`);
    if (!hasLowVis && warnVis) warnDetails.push(` Cảnh báo: Tầm nhìn giảm 60 phút tới (${visibilityKm.toFixed(1)}km < 4km)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Giao thông (60 phút tới - Nguy hiểm)</strong>: Điều kiện không an toàn.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Giao thông (60 phút tới - Cảnh báo)</strong>: Chú ý quan sát.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Giao thông ổn định (60 phút tới)</strong>: Thuận lợi.` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    }
  }

  function renderRoadDashboard() {
    const table = $('roadDashTable');
    if (!table || !RT.current) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const next = getInterpolated24h().slice(0, 1);
    const cur = RT.current;
    const curTemp = cur.main?.temp ?? null;
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));
    const visibilityKm = cur.visibility != null ? (cur.visibility / 1000) : null;
    const isDay = isDayNow();

    const nxt = next[0] || {};
    const nxtTemp = nxt.temp ?? curTemp;
    const nxtWind = mps2kmh(nxt.wind || (cur.wind?.speed ?? 0));
    const nxtPop = Math.round((nxt.pop || 0) * 100);
    const nxtHasStorm = (nxt.weather?.id || 0) >= 200 && (nxt.weather?.id || 0) < 300;

    const rows = [
      {
        name: 'Mưa',
        threshold: '≥10mm/h hoặc ≥70%',
        current: `${curRain.toFixed(1)} mm/h · ${curPop}%`,
        trend: `60 phút tới: ${nxtPop}%`,
        level: (curRain >= 10 || nxtPop >= 70) ? 'danger' : (nxtPop >= 50 ? 'warn' : 'ok'),
        advice: (curRain >= 10 || nxtPop >= 70) ? 'Hạn chế đi đường, dễ ngập' : 'Bình thường'
      },
      {
        name: 'Gió',
        threshold: '≥28 km/h',
        current: `${curWind} km/h`,
        trend: `60 phút tới: ${nxtWind} km/h`,
        level: nxtWind >= 28 ? 'danger' : (nxtWind >= 22 ? 'warn' : 'ok'),
        advice: nxtWind >= 28 ? 'Đi chậm, tránh cây lớn' : 'Bình thường'
      },
      {
        name: 'Dông sét',
        threshold: 'Mã 2xx',
        current: nxtHasStorm ? 'Có dông' : 'Không',
        trend: nxtHasStorm ? '60 phút tới: có khả năng' : 'Ổn định',
        level: nxtHasStorm ? 'danger' : 'ok',
        advice: nxtHasStorm ? 'Tránh di chuyển ngoài trời' : 'Bình thường'
      },
      {
        name: 'Tầm nhìn',
        threshold: '<2 km',
        current: visibilityKm != null ? `${visibilityKm.toFixed(1)} km` : '—',
        trend: visibilityKm != null ? `Dự báo: ~${visibilityKm.toFixed(1)} km` : '—',
        level: visibilityKm != null && visibilityKm < 2 ? 'danger' : (visibilityKm != null && visibilityKm < 4 ? 'warn' : 'ok'),
        advice: visibilityKm != null && visibilityKm < 4 ? (isDay ? 'Bật đèn sương mù' : 'Kiểm tra đèn chiếu sáng') : 'Bình thường'
      },
      {
        name: 'Nắng nóng',
        threshold: '≥31°C',
        current: curTemp != null ? `${curTemp.toFixed(1)}°C` : '—',
        trend: `60 phút tới: ${nxtTemp.toFixed(1)}°C`,
        level: nxtTemp >= 35 ? 'danger' : (nxtTemp >= 31 ? 'warn' : 'ok'),
        advice: nxtTemp >= 35 ? 'Che nắng, tránh say nắng' : 'Bình thường'
      }
    ];

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.name}</td>
        <td>${r.threshold}</td>
        <td>${r.current}</td>
        <td>${r.trend}</td>
        <td><span class="dash-badge ${r.level}">${r.level === 'danger' ? 'Nguy hiểm' : r.level === 'warn' ? 'Cảnh báo' : 'Ổn định'}</span></td>
        <td>${r.advice}</td>
      </tr>
    `).join('');
  }

  function renderFarmDashboard() {
    const table = $('farmDashTable');
    if (!table || !RT.current) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const next = getInterpolated24h().slice(0, 1);
    const cur = RT.current;
    const curTemp = cur.main?.temp ?? null;
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));
    const isDay = isDayNow();

    const nxt = next[0] || {};
    const nxtTemp = nxt.temp ?? curTemp;
    const nxtWind = mps2kmh(nxt.wind || (cur.wind?.speed ?? 0));
    const nxtPop = Math.round((nxt.pop || 0) * 100);
    const nxtHasStorm = (nxt.weather?.id || 0) >= 200 && (nxt.weather?.id || 0) < 300;

    const rows = [
      {
        name: 'Nắng nóng',
        threshold: '≥35°C',
        current: curTemp != null ? `${curTemp.toFixed(1)}°C` : '—',
        trend: `60 phút tới: ${nxtTemp.toFixed(1)}°C`,
        level: nxtTemp >= 35 ? 'danger' : (nxtTemp >= 33 ? 'warn' : 'ok'),
        advice: nxtTemp >= 35 ? (isDay ? 'Tưới nước sáng sớm, che lưới' : 'Chuẩn bị tưới sáng mai') : 'Bình thường'
      },
      {
        name: 'Mưa lớn',
        threshold: '≥10mm/h hoặc ≥70%',
        current: `${curRain.toFixed(1)} mm/h · ${curPop}%`,
        trend: `60 phút tới: ${nxtPop}%`,
        level: (curRain >= 10 || nxtPop >= 70) ? 'danger' : (nxtPop >= 50 ? 'warn' : 'ok'),
        advice: (curRain >= 10 || nxtPop >= 70) ? 'Chủ động thoát nước' : 'Bình thường'
      },
      {
        name: 'Gió mạnh',
        threshold: '≥28 km/h',
        current: `${curWind} km/h`,
        trend: `60 phút tới: ${nxtWind} km/h`,
        level: nxtWind >= 28 ? 'danger' : (nxtWind >= 22 ? 'warn' : 'ok'),
        advice: nxtWind >= 28 ? 'Gia cố giàn, cọc' : 'Bình thường'
      },
      {
        name: 'Dông sét',
        threshold: 'Mã 2xx',
        current: nxtHasStorm ? 'Có dông' : 'Không',
        trend: nxtHasStorm ? '60 phút tới: rủi ro cao' : 'Ổn định',
        level: nxtHasStorm ? 'danger' : 'ok',
        advice: nxtHasStorm ? 'Tránh phun xịt/ra đồng' : 'Bình thường'
      }
    ];

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.name}</td>
        <td>${r.threshold}</td>
        <td>${r.current}</td>
        <td>${r.trend}</td>
        <td><span class="dash-badge ${r.level}">${r.level === 'danger' ? 'Nguy hiểm' : r.level === 'warn' ? 'Cảnh báo' : 'Ổn định'}</span></td>
        <td>${r.advice}</td>
      </tr>
    `).join('');
  }

  function renderAquaDashboard() {
    const table = $('aquaDashTable');
    if (!table || !RT.current) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const next = getInterpolated24h().slice(0, 1);
    const cur = RT.current;
    const curTemp = cur.main?.temp ?? null;
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));
    const isDay = isDayNow();

    const nxt = next[0] || {};
    const nxtTemp = nxt.temp ?? curTemp;
    const nxtWind = mps2kmh(nxt.wind || (cur.wind?.speed ?? 0));
    const nxtPop = Math.round((nxt.pop || 0) * 100);
    const nxtHasStorm = (nxt.weather?.id || 0) >= 200 && (nxt.weather?.id || 0) < 300;

    const nearestStAqua = getNearestStationData();
    const waterLvlAqua = nearestStAqua ? parseFloat(nearestStAqua.waterLevel) : null;

    const rows = [
      {
        name: 'Triều cường',
        threshold: '>2.5m',
        current: waterLvlAqua != null ? waterLvlAqua.toFixed(2) + 'm' : '—',
        trend: `Trạm: ${nearestStAqua ? nearestStAqua.name : '—'}`,
        level: waterLvlAqua != null && waterLvlAqua > 2.5 ? 'danger' : (waterLvlAqua != null && waterLvlAqua > 2.0 ? 'warn' : 'ok'),
        advice: waterLvlAqua != null && waterLvlAqua > 2.5 ? (isDay ? ' Gia cố bờ bao' : ' Kiểm tra bờ bao bằng đèn pin') : 'Bình thường'
      },
      {
        name: 'Mưa lớn',
        threshold: '≥10mm/h hoặc ≥70%',
        current: `${curRain.toFixed(1)} mm/h · ${curPop}%`,
        trend: `60 phút tới: ${nxtPop}%`,
        level: (curRain >= 10 || nxtPop >= 70) ? 'danger' : (nxtPop >= 50 ? 'warn' : 'ok'),
        advice: (curRain >= 10 || nxtPop >= 70) ? 'Chống sốc nước/độ mặn' : 'Bình thường'
      },
      {
        name: 'Gió mạnh',
        threshold: '≥28 km/h',
        current: `${curWind} km/h`,
        trend: `60 phút tới: ${nxtWind} km/h`,
        level: nxtWind >= 28 ? 'danger' : (nxtWind >= 22 ? 'warn' : 'ok'),
        advice: nxtWind >= 28 ? 'Hạn chế cho ăn, gia cố' : 'Bình thường'
      },
      {
        name: 'Nhiệt nước',
        threshold: '≥31°C',
        current: curTemp != null ? `${curTemp.toFixed(1)}°C` : '—',
        trend: `60 phút tới: ${nxtTemp.toFixed(1)}°C`,
        level: nxtTemp >= 31 ? 'warn' : 'ok',
        advice: nxtTemp >= 31 ? (isDay ? 'Sục khí/che mát' : 'Tăng oxy hòa tan đêm') : 'Bình thường'
      }
    ];

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.name}</td>
        <td>${r.threshold}</td>
        <td>${r.current}</td>
        <td>${r.trend}</td>
        <td><span class="dash-badge ${r.level}">${r.level === 'danger' ? 'Nguy hiểm' : r.level === 'warn' ? 'Cảnh báo' : 'Ổn định'}</span></td>
        <td>${r.advice}</td>
      </tr>
    `).join('');
  }
  function renderDailyChart() {
    const canvas = $('tempChart');
    if (!canvas) return;
    const items = getInterpolated24h();
    if (!items.length) return;
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

    const temps = items.map(i => RT.dispT(i.temp));
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
      if (i % 2 !== 0) return;
      const bH = (r / 100) * (H - 44);
      ctx.fillStyle = `rgba(56,189,248,${0.08 + r / 600})`;
      ctx.fillRect(px(i) - 6, H - 20 - bH, 12, bH);
    });

    const aGrad = ctx.createLinearGradient(0, 0, 0, H);
    aGrad.addColorStop(0, 'rgba(251,146,60,0.25)');
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
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

    items.forEach((item, i) => {
      if (i % 3 !== 0 && i !== 0 && i !== n - 1) return;
      const x = px(i), y = py(temps[i]);
      ctx.save();
      ctx.shadowColor = i === 0 ? '#38bdf8' : '#fb923c';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#38bdf8' : '#fb923c';
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(232,234,239,0.92)';
      ctx.font = 'bold 10px DM Sans, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${temps[i]}°`, x, y - 9);

      const dt = new Date(item.dt * 1000);
      const tl = i === 0 ? 'Bây giờ' : dt.getHours() + ':00';
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
          window.FORECAST[i].icon = weatherEmoji(code).icon;
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
        <div class="fc-icon">${icon.icon}</div>
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
      'accent-warm', 'accent-danger', 'accent-danger', 'accent-danger', 'accent-danger'];
    setTxt('detailUv', uvi);

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
      if ($('no2')) $('no2').textContent = (comp.no2 || 0).toFixed(1);
      if ($('so2')) $('so2').textContent = (comp.so2 || 0).toFixed(1);
      if ($('co')) $('co').textContent = (comp.co || 0).toFixed(1);
      if ($('no')) $('no').textContent = (comp.no || 0).toFixed(1);
      if ($('nh3')) $('nh3').textContent = (comp.nh3 || 0).toFixed(1);
    }

    setTxt('detailRainMm', `${rainProb}%`);
    setTxt('detailRainProb', 'Khả năng mưa trong vài giờ tới');
    const rfill = $('rainBarFill');
    if (rfill) rfill.style.width = rainProb + '%';

    setTxt('detailCloud', clouds);
    const cbf = $('cloudBarFill');
    if (cbf) cbf.style.width = clouds + '%';
    const su = RT.unit() === 'F' ? '°F' : '°C';
    const dew = Math.round(tempC - (100 - humidity) / 5);
    setTxt('detailDew', RT.dispT(dew) + su);

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

  function getOfficialAlertSummary() {
    const alerts = RT.onecall?.alerts || [];
    if (!alerts.length) return null;

    const now = Math.floor(Date.now() / 1000);
    const active = alerts.filter(a => (a.end == null || a.end >= now));
    const list = active.length ? active : alerts;
    const sorted = list.slice().sort((a, b) => (a.start || 0) - (b.start || 0));
    const a = sorted[0];

    const title = (a.event || 'Cảnh báo thời tiết').trim();
    const body = (a.description || '').replace(/\n+/g, ' ').trim();
    const timeStart = a.start ? new Date(a.start * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    const timeEnd = a.end ? new Date(a.end * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    const timeSpan = (timeStart && timeEnd) ? `${timeStart}–${timeEnd}` : (timeStart || timeEnd);
    const sender = (a.sender_name || 'OpenWeatherMap').trim();

    const dangerRe = /(extreme|severe|warning|bão|giông|lũ|sạt lở|ngập|triều cường)/i;
    const level = dangerRe.test(`${title} ${body}`) ? 'danger' : 'warn';

    return { level, title, body, timeSpan, sender, raw: a };
  }

  function renderOfficialAlerts() {
    const summary = getOfficialAlertSummary();
    if (!summary) return;
    const key = `owm-${summary.title}-${summary.raw?.start || ''}-${summary.raw?.end || ''}`;
    if (RT.dismissedAlerts.has(key)) return;

    const body = summary.timeSpan
      ? `${summary.timeSpan} · ${summary.body || 'Có cảnh báo thời tiết chính thức.'}`
      : (summary.body || 'Có cảnh báo thời tiết chính thức.');

    showAlertPopup({ lvl: summary.level, title: ` ${summary.title}`, body }, key);
  }

  function checkUVAlert(uvi) {
    if (uvi < 6) return;

    const hr = new Date().getHours();
    const sunnyHours = hr >= 9 && hr <= 16;
    let advice = 'Bôi kem chống nắng ';
    if (sunnyHours) {
      advice += ' hoặc mặc áo khoác/áo chống nắng';
    }

    const uvLabels = ['Thấp', 'Thấp', 'Thấp', 'Trung bình', 'Trung bình', 'Trung bình',
      'Cao', 'Cao', 'Rất cao', 'Rất cao', 'Rất cao', 'Cực đoan'];
    const uvLevel = uvLabels[uvi] || 'Cao';

    const key = `uv-${uvi}-${Math.round(RT.lat * 100)}-${Math.round(RT.lon * 100)}`;
    if (RT.dismissedAlerts.has(key)) return;

    const alertsCont = $('alertsContainer');
    if (alertsCont && !alertsCont.querySelector('.smart-alert--uv')) {
      const banner = document.createElement('div');
      banner.className = 'smart-alert smart-alert--warn smart-alert--uv';
      banner.innerHTML = `
        <span class="smart-alert__icon"></span>
        <div class="smart-alert__body">
          <div class="smart-alert__title">Cảnh báo UV cao ${uvi}</div>
          <div class="smart-alert__text">${uvLevel} - ${advice}</div>
        </div>
        <button class="smart-alert__close" onclick="this.parentElement.remove(); RT.dismissedAlerts.add('${key}');">×</button>
      `;
      alertsCont.appendChild(banner);
    }
  }

  async function fetchHistoryOpenMeteo(lat, lon, start, end) {
    try {
      const s = start.toISOString().split('T')[0];
      const e = end.toISOString().split('T')[0];
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${s}&end_date=${e}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&hourly=relative_humidity_2m&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      return d || null;
    } catch (err) {
      console.warn('[OpenMeteo] Lỗi lấy lịch sử:', err);
      return null;
    }
  }

  async function fetchStoredHistory(lat, lon, days = 7) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      days: String(days)
    });
    const result = await fetchJson(`/api/history?${params.toString()}`, { optional: true });
    return Array.isArray(result?.items) ? result.items : [];
  }

  function formatHistoryLabel(dayKey, index, total) {
    const date = new Date(`${dayKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dayKey;
    if (index === total - 1) return 'Hôm nay';

    const weekDays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${weekDays[date.getDay()]} ${date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })}`;
  }

  function mapStoredHistory(items) {
    if (!Array.isArray(items) || !items.length) return [];
    return items.map((item, index) => ({
      label: formatHistoryLabel(item.dayKey, index, items.length),
      hi: item.hi ?? null,
      lo: item.lo ?? null,
      rain: item.rain ?? null,
      humidity: item.humidity ?? null,
      wind: item.wind ?? null,
      icon: item.icon || '☁️',
      desc: item.desc || 'Dữ liệu lưu trữ',
      source: item.dayKey === dateKey(new Date()) ? 'live' : (item.source || 'db')
    }));
  }

  async function buildHistory() {
    const cur = RT.current;
    if (!cur) return;

    const now = Date.now();
    const sameDay = RT.historyMeta.ts
      && new Date(RT.historyMeta.ts).toDateString() === new Date().toDateString();
    const sameLoc = RT.historyMeta.lat != null && RT.historyMeta.lon != null
      && Math.abs(RT.historyMeta.lat - RT.lat) < 0.01
      && Math.abs(RT.historyMeta.lon - RT.lon) < 0.01;

    if (sameDay && sameLoc && RT.history?.length === 7) {
      renderHistory();
      return;
    }

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setHours(12, 0, 0, 0);
      dt.setDate(dt.getDate() - i);
      days.push(dt);
    }

    const storedHistory = await fetchStoredHistory(RT.lat, RT.lon, 7);
    if (storedHistory.length === 7) {
      RT.history = mapStoredHistory(storedHistory);
      RT.historyMeta = { ts: now, lat: RT.lat, lon: RT.lon };
      renderHistory();
      return;
    }

    const omData = await fetchHistoryOpenMeteo(RT.lat, RT.lon, days[0], days[5]);

    RT.history = days.map((dt, idx) => {
      const wk = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dt.getDay()];
      const lbl = idx === 6 ? 'Hôm nay' : `${wk} ${dt.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })}`;

      if (idx === 6 && RT.forecast?.list?.length) {
        const todayStr = new Date().toDateString();
        const todayPoints = RT.forecast.list.filter(p => new Date(p.dt * 1000).toDateString() === todayStr);
        const activePoints = todayPoints.length ? todayPoints : RT.forecast.list.slice(0, 8);
        const fTemps = activePoints.map(p => p.main.temp);
        const wInfo = weatherEmoji(cur.weather?.[0]?.id);
        return {
          label: lbl,
          hi: Math.round(Math.max(...fTemps, (cur.main?.temp_max || -99))),
          lo: Math.round(Math.min(...fTemps, (cur.main?.temp_min || 99))),
          rain: Math.round((activePoints[0].pop || 0) * 100),
          humidity: cur.main?.humidity,
          wind: mps2kmh(cur.wind?.speed || 0),
          icon: wInfo.icon,
          desc: wInfo.desc,
          source: 'live',
        };
      }

      const daily = omData?.daily;
      if (daily && daily.time && daily.time[idx] != null) {
        let meanHum = null;
        if (omData.hourly && omData.hourly.relative_humidity_2m) {
          const slice = omData.hourly.relative_humidity_2m.slice(idx * 24, (idx + 1) * 24);
          if (slice.length) {
            meanHum = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
          }
        }
        const wInfo = weatherEmoji(1000 + daily.weather_code[idx]);
        return {
          label: lbl,
          hi: Math.round(daily.temperature_2m_max[idx]),
          lo: Math.round(daily.temperature_2m_min[idx]),
          rain: Math.round(daily.precipitation_sum[idx] || 0),
          humidity: meanHum,
          wind: Math.round(daily.wind_speed_10m_max[idx] || 0),
          icon: wInfo.icon,
          desc: wInfo.desc,
          source: 'api',
        };
      }

      return {
        label: lbl, hi: null, lo: null, rain: null, humidity: null, wind: null,
        icon: '❓', desc: 'Không có dữ liệu', source: 'fallback',
      };
    });

    RT.historyMeta = { ts: now, lat: RT.lat, lon: RT.lon };
    renderHistory();
  }

  function historyLocKey(lat, lon) {
    const la = Number.isFinite(lat) ? lat.toFixed(2) : '0.00';
    const lo = Number.isFinite(lon) ? lon.toFixed(2) : '0.00';
    return `${la},${lo}`;
  }

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function loadHistoryCache() {
    try {
      const raw = localStorage.getItem(HISTORY_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveHistoryDay(cache, locKey, dKey, value) {
    if (!cache[locKey]) cache[locKey] = { days: {} };
    cache[locKey].days[dKey] = {
      hi: value.hi,
      lo: value.lo,
      rain: value.rain,
      humidity: value.humidity,
      wind: value.wind,
      icon: value.icon,
      ts: Date.now(),
    };
  }

  function persistHistoryCache(cache) {
    try {
      Object.keys(cache || {}).forEach(k => {
        const days = cache[k]?.days || {};
        const keys = Object.keys(days).sort();
        if (keys.length > 30) {
          keys.slice(0, keys.length - 30).forEach(rm => delete days[rm]);
        }
      });
      localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(cache || {}));
    } catch (_) { }

    if (typeof renderAIComparison === 'function') renderAIComparison();
  }

  async function fetchHistoryDay(dateObj) {
    const dStr = dateKey(dateObj);
    const url = new URL('https://api.openweathermap.org/data/3.0/onecall/day_summary');
    url.searchParams.set('appid', OWM_KEY);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('lang', 'vi');
    url.searchParams.set('lat', RT.lat);
    url.searchParams.set('lon', RT.lon);
    url.searchParams.set('date', dStr);

    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`OWM day_summary HTTP ${r.status}`);
    const data = await r.json();

    const hi = data.temperature?.max != null ? Math.round(data.temperature.max) : null;
    const lo = data.temperature?.min != null ? Math.round(data.temperature.min) : null;
    const humidity = data.humidity?.afternoon ?? null;
    const wind = data.wind?.max?.speed != null ? Math.round(mps2kmh(data.wind.max.speed)) : null;
    const rain = data.precipitation?.total != null ? Math.round(data.precipitation.total) : null;

    let icon = '☁️';
    if (rain > 5) icon = '🌧️';
    else if (rain > 0.5) icon = '🌦️';
    else if (data.cloud_cover?.afternoon < 20) icon = '☀️';

    return { hi, lo, humidity, wind, rain, icon };
  }

  function renderHistory() {
    const tbody = $('historyTableBody');
    if (!tbody) return;
    const su = RT.unit() === 'F' ? '°F' : '°C';
    const fmtVal = (v, suffix = '') => (v === null || Number.isNaN(v)) ? '—' : `${v}${suffix}`;
    tbody.innerHTML = RT.history.map(r => `
      <tr${r.source === 'live' ? ' class="hist-live-row"' : ''}>
        <td class="hist-date">${r.label}${r.source === 'live' ? ' <span class="hist-live-tag">● Live</span>' : ''}</td>
        <td style="white-space:nowrap">${r.icon} <span style="font-size:11px; color:var(--muted)">${r.desc || ''}</span></td>
        <td class="td-hi">${r.hi == null ? '—' : `${RT.dispT(r.hi)}${su}`}</td>
        <td class="td-lo">${r.lo == null ? '—' : `${RT.dispT(r.lo)}${su}`}</td>
        <td><span class="hist-rain-pill" style="--r:${r.rain ?? 0}%">${fmtVal(r.rain, '%')}</span></td>
        <td class="hist-hum">${fmtVal(r.humidity, '%')}</td>
        <td class="hist-wind">${r.wind == null ? '—' : `${r.wind} km/h`}</td>
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
      weight: 2, opacity: 1, fillOpacity: 0.9, zIndexOffset: 2000
    }).addTo(RT.leafletMap)
      .bindPopup(`<b>${RT.name}</b><br>Vị trí đang xem`).openPopup();

    const stations = generateHydroData();
    stations.forEach(s => {
      const risk = calculateFloodRisk(s);
      const iconClass = risk.class === 'danger' ? 'station-dot--alert' : (risk.class === 'warn' ? 'station-dot--warn' : '');

      const customIcon = L.divIcon({
        className: 'station-marker',
        html: `<div class="station-dot ${iconClass}"></div>`,
        iconSize: [20, 20]
      });

      L.marker([s.lat, s.lon], { icon: customIcon }).addTo(RT.leafletMap)
        .bindPopup(`
          <div class="map-popup-card">
            <div class="map-popup-header">${s.name}</div>
            <div class="map-popup-row"><span class="map-popup-label">Mực nước:</span> <span class="map-popup-val">${s.waterLevel}m</span></div>
            <div class="map-popup-row"><span class="map-popup-label">Độ mặn:</span> <span class="map-popup-val">${s.salinity}‰</span></div>
            <div class="map-popup-row"><span class="map-popup-label">Trạng thái:</span> <span class="map-popup-val">${s.tide}</span></div>
            <div class="map-popup-risk map-popup-risk--${risk.class}">Nguy cơ: ${risk.level}</div>
          </div>
        `);
    });

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
    const ft = $('footerTime');
    const tick = () => {
      const timeStr = new Date().toLocaleTimeString('vi-VN',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      el.textContent = timeStr;
      if (ft) ft.textContent = timeStr;
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
      renderFarmAlert();
      renderAquaAlert();
      renderRoadAlert();
      renderOfficialAlerts();
      renderFarmDashboard();
      renderAquaDashboard();
      renderRoadDashboard();
      notifyIfNeeded();
      renderDailyChart();
      renderForecast7Day();
      renderTrendChart();
      renderSTEMLab();
      renderDetails();
      await buildHistory();
      renderAIComparison();
      renderFloodAlert();
      if (typeof window.updateHeaderFavoriteState === 'function') window.updateHeaderFavoriteState();

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
      orig(w, realData);
      if (realData?.lat != null && realData?.lon != null) {
        setLocation(realData.lat, realData.lon, w?.name || RT.name);
      } else if (coord) {
        setLocation(coord.lat, coord.lon, w.name);
      } else if (w?.lat != null) {
        setLocation(w.lat, w.lon, w.name);
      }
      setTimeout(refreshAll, 200);
      saveSettings();
    };
  }

  function autoGPS() {
    if (RT.isPersonalized) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const nearest = nearestWard(latitude, longitude);
      if (nearest && nearest.ward) {
        setLocation(latitude, longitude, nearest.ward.name);
        toast(` Đã tự động nhận diện: ${nearest.ward.name}`, 'success');
        refreshAll();
      } else {
        setLocation(latitude, longitude, "Vị trí GPS");
        refreshAll();
      }
    }, (err) => {
      console.warn('[GPS] Người dùng từ chối hoặc lỗi:', err);
    });
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

    if (!$('rt-history-section')) {
      const sec = document.createElement('section');
      sec.id = 'rt-history-section';
      sec.className = 'block comp-section';
      sec.innerHTML = `
        <header class="block-head comp-section__head">
          <h2 class="block-title comp-section__title">Lịch sử 7 ngày qua</h2>
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
    }

    const footer = qs('.site-footer');
    if (footer && !$('rt-live-clock')) {
      const div = document.createElement('div');
      div.className = 'rt-footer-row';
      div.innerHTML = `
        <span class="rt-footer-label"> Giờ địa phương</span>
        <span id="rt-live-clock" class="rt-live-clock">--:--:--</span>
        <span class="rt-sep">·</span>
        <span class="rt-footer-label">Cập nhật lúc</span>
        <span id="rt-last-refresh" class="rt-live-clock">—</span>`;
      footer.prepend(div);
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

.rt-badge-wrap { display:flex; align-items:center; gap:8px; }
.rt-live-badge {
  padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700;
  letter-spacing:.06em; color:var(--ok);
  border:1px solid rgba(74,222,128,.3); background:rgba(74,222,128,.07);
  animation:rt-pulse 2.2s ease-in-out infinite;
}

.rt-countdown {
  position:relative; width:34px; height:34px;
  display:flex; align-items:center; justify-content:center;
}
.rt-ring-fill { transition:stroke-dashoffset .95s linear; }
#rt-countdown-num {
  position:absolute; font-size:9px; font-weight:700;
  color:var(--accent); font-variant-numeric:tabular-nums;
}

.rt-radar-wrap { border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--border); }
.rt-map-tabs {
  display:flex; background:var(--surface);
  border-bottom:1px solid var(--border); overflow-x:auto; scrollbar-width:none;
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
}
.rt-map-tabs::-webkit-scrollbar { display:none; }
.rt-map-btn {
  flex-shrink:0; padding:10px 16px; border:none; background:transparent;
  color:var(--muted); font:600 12px var(--font); cursor:pointer;
  border-bottom:2px solid transparent; white-space:nowrap;
  transition:color .2s,border-color .2s,background .2s;
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
}
.rt-map-btn:hover { color:var(--text); }
.rt-map-btn.active {
  color:var(--accent); border-bottom-color:var(--accent);
  background:rgba(59,158,255,.12);
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

.hour-wind { font-size:10px; color:var(--muted); margin-top:2px; }

.toast-rt-success { border-color:rgba(74,222,128,.3); }
.toast-rt-warn    { border-color:rgba(240,160,75,.3); }
.toast-rt-error   { border-color:rgba(248,113,113,.3); }

#btnSaveReport { display:none !important; }

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
    const gpsBtn = $('gpsActionBtn');
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

      { id: 43, name: 'TT. Hòa Bình', district: 'Hòa Bình', lat: 9.2500, lon: 105.6200 },
      { id: 44, name: 'Xã Vĩnh Bình', district: 'Hòa Bình', lat: 9.2300, lon: 105.6100 },
      { id: 45, name: 'Xã Vĩnh Mỹ A', district: 'Hòa Bình', lat: 9.2100, lon: 105.5900 },
      { id: 46, name: 'Xã Vĩnh Mỹ B', district: 'Hòa Bình', lat: 9.2200, lon: 105.6000 },
      { id: 47, name: 'Xã Vĩnh Hậu', district: 'Hòa Bình', lat: 9.1900, lon: 105.5700 },
      { id: 48, name: 'Xã Vĩnh Hậu A', district: 'Hòa Bình', lat: 9.1800, lon: 105.5600 },

      { id: 49, name: 'TT. Châu Hưng', district: 'Vĩnh Lợi', lat: 9.3200, lon: 105.6900 },
      { id: 50, name: 'Xã Châu Hưng A', district: 'Vĩnh Lợi', lat: 9.3100, lon: 105.6750 },
      { id: 51, name: 'Xã Hưng Hội', district: 'Vĩnh Lợi', lat: 9.3300, lon: 105.6600 },
      { id: 52, name: 'Xã Hưng Thành', district: 'Vĩnh Lợi', lat: 9.3400, lon: 105.6800 },
      { id: 53, name: 'Xã Long Thạnh', district: 'Vĩnh Lợi', lat: 9.3500, lon: 105.7000 },
      { id: 54, name: 'Xã Vĩnh Mỹ', district: 'Vĩnh Lợi', lat: 9.3000, lon: 105.7100 },
      { id: 55, name: 'Xã Châu Thới', district: 'Vĩnh Lợi', lat: 9.2800, lon: 105.6850 },
      { id: 56, name: 'Xã Nhà Mát', district: 'Vĩnh Lợi', lat: 9.3200, lon: 105.7400 },

      { id: 57, name: 'TT. Ngan Dừa', district: 'Hồng Dân', lat: 9.4800, lon: 105.5300 },
      { id: 59, name: 'Xã Ninh Quới', district: 'Hồng Dân', lat: 9.4600, lon: 105.5500 },
      { id: 60, name: 'Xã Ninh Quới A', district: 'Hồng Dân', lat: 9.4700, lon: 105.5700 },
      { id: 61, name: 'Xã Ninh Hòa', district: 'Hồng Dân', lat: 9.5100, lon: 105.5200 },
      { id: 62, name: 'Xã Lộc Ninh', district: 'Hồng Dân', lat: 9.5300, lon: 105.5400 },
      { id: 63, name: 'Xã Vĩnh Lộc', district: 'Hồng Dân', lat: 9.5500, lon: 105.5600 },

      { id: 64, name: 'TT. Phước Long', district: 'Phước Long', lat: 9.3900, lon: 105.4600 },
      { id: 65, name: 'Xã Phước Long', district: 'Phước Long', lat: 9.3700, lon: 105.4400 },
      { id: 66, name: 'Xã Hưng Phú', district: 'Phước Long', lat: 9.4000, lon: 105.4800 },
      { id: 67, name: 'Xã Vĩnh Phú Đông', district: 'Phước Long', lat: 9.4100, lon: 105.5000 },
      { id: 68, name: 'Xã Vĩnh Phú Tây', district: 'Phước Long', lat: 9.4200, lon: 105.5200 },
      { id: 69, name: 'Xã Phong Thạnh Tây A', district: 'Phước Long', lat: 9.3500, lon: 105.4300 },
      { id: 70, name: 'Xã Phong Thạnh Tây B', district: 'Phước Long', lat: 9.3400, lon: 105.4200 },

      { id: 71, name: 'Phường 1 (Giá Rai)', district: 'TX. Giá Rai', lat: 9.2000, lon: 105.4700 },
      { id: 72, name: 'Phường Hộ Phòng', district: 'TX. Giá Rai', lat: 9.1800, lon: 105.4900 },
      { id: 73, name: 'Phường Láng Tròn', district: 'TX. Giá Rai', lat: 9.2100, lon: 105.4600 },
      { id: 74, name: 'Xã Phong Thạnh', district: 'TX. Giá Rai', lat: 9.2300, lon: 105.4500 },
      { id: 75, name: 'Xã Phong Thạnh A', district: 'TX. Giá Rai', lat: 9.2400, lon: 105.4400 },
      { id: 76, name: 'Xã Phong Tân', district: 'TX. Giá Rai', lat: 9.1700, lon: 105.5000 },
      { id: 77, name: 'Xã Tân Phong', district: 'TX. Giá Rai', lat: 9.1600, lon: 105.5100 },
      { id: 78, name: 'Xã Long Điền', district: 'TX. Giá Rai', lat: 9.2200, lon: 105.4300 },
      { id: 79, name: 'Xã Long Điền Đông', district: 'TX. Giá Rai', lat: 9.2100, lon: 105.4200 },

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
    const DISTRICT_ORDER = [
      'fav', 'TP. Cà Mau', 'U Minh', 'Thới Bình', 'Trần Văn Thời', 'Cái Nước', 'Đầm Dơi',
      'Năm Căn', 'Phú Tân', 'Ngọc Hiển',
      'TP. Bạc Liêu', 'Hòa Bình', 'Vĩnh Lợi', 'Hồng Dân', 'Phước Long', 'TX. Giá Rai', 'Đông Hải'
    ];
    const districtRank = new Map(DISTRICT_ORDER.map((d, i) => [d, i]));

    let currentFilter = RT.favorites.length ? 'fav' : 'all';

    const resetBtn = $('searchReset');

    function getItemHTML(w, isFav, isSearchEmpty, idx) {
      return `
      <div class="sr-item" data-id="${w.id}" style="animation-delay: ${idx * 0.03}s">
        <div class="sr-icon">📍</div>
        <div class="sr-body">
          <div class="sr-name">${w.name}</div>
          <div class="sr-dist">${w.district}</div>
        </div>
        <div class="sr-weather">
          <div class="sr-temp">${w.lat.toFixed(2)}°N</div>
          <div class="sr-rain">${w.lon.toFixed(2)}°E</div>
        </div>
        <button type="button" class="sr-fav-btn ${isFav ? 'active' : ''}" data-id="${w.id}" title="Yêu thích">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
      </div>`;
    }

    function renderResults(filter, query) {
      let items = WARDS_DATA;
      const isSearchEmpty = !query || query.trim() === '';

      if (resetBtn) resetBtn.classList.toggle('visible', !isSearchEmpty);

      if (filter === 'fav') {
        items = items.filter(w => RT.favorites.includes(w.id));
      } else if (filter && filter !== 'all') {
        items = items.filter(w => w.district === filter);
      }

      if (!isSearchEmpty) {
        const q = query.toLowerCase();
        items = items.filter(w =>
          w.name.toLowerCase().includes(q) || w.district.toLowerCase().includes(q));
      }

      if (!(isSearchEmpty && filter === 'all')) {
        items = items.slice().sort((a, b) => {
          const ra = districtRank.get(a.district) ?? 999;
          const rb = districtRank.get(b.district) ?? 999;
          return ra !== rb ? ra - rb : a.name.localeCompare(b.name, 'vi');
        });
      }

      if (!items.length) {
        results.innerHTML = `
          <div class="search-empty-state">
            <div class="search-empty-title">Không tìm thấy địa điểm</div>
            <div class="search-empty-text">Thử tìm theo tên huyện hoặc xã khác nhé.</div>
          </div>`;
        return;
      }

      results.innerHTML = items.map((w, i) => getItemHTML(w, RT.favorites.includes(w.id), isSearchEmpty, i)).join('');
    }

    results.addEventListener('click', (e) => {
      const favBtn = e.target.closest('.sr-fav-btn');
      if (favBtn) {
        e.stopPropagation();
        toggleFavorite(parseInt(favBtn.dataset.id));
        renderResults(currentFilter, input.value);
        return;
      }

      const item = e.target.closest('.sr-item');
      if (item) {
        const ward = WARDS_DATA.find(w => w.id === parseInt(item.dataset.id));
        if (ward) {
          setLocation(ward.lat, ward.lon, ward.name);
          overlay.classList.remove('open');
          toast(` ${ward.name} · ${ward.district}`, 'success');
          refreshAll();
        }
      }
    });

    searchBtn.addEventListener('click', () => {
      overlay.classList.add('open');
      setTimeout(() => input.focus(), 100);
      currentFilter = RT.favorites.length ? 'fav' : 'all';
      tabs.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.d === currentFilter));
      renderResults(currentFilter, input.value);
    });

    const handleSearch = debounce(() => renderResults(currentFilter, input.value), 180);
    input.addEventListener('input', handleSearch);

    resetBtn?.addEventListener('click', () => {
      input.value = '';
      input.focus();
      renderResults(currentFilter, '');
    });

    closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => e.target === overlay && overlay.classList.remove('open'));

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
        toast(' Vui lòng nhập số điện thoại hợp lệ', 'warn');
        return;
      }

      const labels = { storm: 'Bão', flood: 'Triều cường', salinity: 'Xâm nhập mặn' };
      const selected = opts.map(o => labels[o] || o).join(', ') || 'Tất cả';

      toast(` Đăng ký thành công: ${phone} • ${selected}`, 'success');
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
        <span class="comp-hero-temp__icon">${icon.icon}</span>
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
        lat: 8.99, lon: 104.82,
        salinity: sinusoidal(18.5, 3.5, 0).toFixed(1),
        waterLevel: sinusoidal(1.85, 0.65, 0.5).toFixed(2),
        flowRate: Math.round(sinusoidal(120, 40, 1.0)),
        tide: tide > 0 ? 'Triều lên' : 'Triều rút',
        status: sinusoidal(18.5, 3.5, 0) > 22 ? 'alert' : 'normal'
      },
      {
        id: 'S02', name: 'Trạm Gành Hào', type: 'Triều cường & Mặn',
        lat: 9.11, lon: 105.44,
        salinity: sinusoidal(21.0, 4.0, 1.2).toFixed(1),
        waterLevel: sinusoidal(2.10, 0.70, 1.7).toFixed(2),
        flowRate: Math.round(sinusoidal(85, 30, 2.1)),
        tide: Math.sin(t / (6.2 * 3600) + 0.8) > 0 ? 'Triều lên' : 'Triều rút',
        status: sinusoidal(21.0, 4.0, 1.2) > 24 ? 'warning' : 'normal'
      },
      {
        id: 'S03', name: 'Trạm Thới Bình', type: 'Nước ngọt & Phèn',
        lat: 9.35, lon: 105.15,
        salinity: sinusoidal(0.4, 0.3, 2.5).toFixed(1),
        waterLevel: sinusoidal(0.75, 0.25, 2.8).toFixed(2),
        flowRate: Math.round(sinusoidal(45, 15, 3.2)),
        tide: 'N/A',
        status: 'normal'
      },
      {
        id: 'S04', name: 'Trạm Năm Căn', type: 'Thủy hải văn',
        lat: 8.82, lon: 105.05,
        salinity: sinusoidal(25.0, 5.0, 3.8).toFixed(1),
        waterLevel: sinusoidal(1.60, 0.55, 4.1).toFixed(2),
        flowRate: Math.round(sinusoidal(200, 60, 4.5)),
        tide: Math.sin(t / (6.2 * 3600) + 2.1) > 0 ? 'Triều lên' : 'Triều rút',
        status: 'normal'
      },
      {
        id: 'S05', name: 'Trạm Cà Mau', type: 'Khí tượng thủy văn',
        lat: 9.18, lon: 105.15,
        salinity: sinusoidal(1.2, 0.5, 5.0).toFixed(1),
        waterLevel: sinusoidal(0.90, 0.30, 5.3).toFixed(2),
        flowRate: Math.round(sinusoidal(65, 20, 5.7)),
        tide: 'N/A',
        status: 'normal'
      },
    ];
  }

  function getNearestStationData() {
    const stations = generateHydroData();
    if (!stations.length) return null;
    let nearest = null;
    let minDist = Infinity;
    stations.forEach(s => {
      const d = Math.sqrt(Math.pow(s.lat - RT.lat, 2) + Math.pow(s.lon - RT.lon, 2));
      if (d < minDist) {
        minDist = d;
        nearest = s;
      }
    });
    return nearest;
  }

  function calculateFloodRisk(station) {
    if (!station) return { level: 'Thấp', score: 0, class: 'ok' };
    const rain = RT.current?.rain?.['1h'] || 0;
    const wind = mps2kmh(RT.current?.wind?.speed || 0);
    const water = parseFloat(station.waterLevel) || 0;

    let score = 0;
    if (water > 2.5) score += 5;
    else if (water > 2.0) score += 3;
    else if (water > 1.5) score += 1;

    if (rain > 20) score += 4;
    else if (rain > 10) score += 2;

    if (wind > 40) score += 2;

    if (score >= 7) return { level: 'Rất Cao', score, class: 'danger', icon: '', advice: 'Cảnh báo Đỏ: Nguy cơ ngập lụt diện rộng. Sẵn sàng di dời tài sản.' };
    if (score >= 4) return { level: 'Trung bình', score, class: 'warn', icon: '', advice: 'Cảnh báo Vàng: Nguy cơ ngập cục bộ. Gia cố bờ bao và kiểm tra cống rãnh.' };
    return { level: 'Thấp', score, class: 'ok', icon: '', advice: 'An toàn: Nguy cơ thấp. Tiếp tục theo dõi biến động thủy triều.' };
  }

  function renderFloodAlert() {
    const card = $('floodAlertCard');
    const statusEl = $('floodStatus');
    const detailsEl = $('floodDetails');
    const adviceEl = $('floodAdviceText');
    const badge = $('floodRiskBadge');
    if (!card || !statusEl) return;

    const station = getNearestStationData();
    const risk = calculateFloodRisk(station);

    card.className = `flood-alert-card card flood-alert--${risk.class}`;
    statusEl.innerHTML = `Nguy cơ: ${risk.level}`;
    badge.textContent = `RỦI RO: ${risk.level.toUpperCase()}`;

    const rainVal = RT.current?.rain?.['1h'] || 0;
    detailsEl.innerHTML = `
      Trạm gần nhất: <b>${station ? station.name : 'N/A'}</b> (${station ? station.waterLevel : '—'}m).<br>
      Lượng mưa hiện tại: <b>${rainVal}mm/h</b>. Gió: <b>${mps2kmh(RT.current?.wind?.speed || 0)}km/h</b>.
    `;
    adviceEl.textContent = risk.advice;
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
            <span class="hydro-card__time"> ${now}</span>
          </div>
        </div>`;
    }).join('');
  }

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

  function init3DEarth() {
    const container = $('earthGlobe');
    if (!container || window.earthScene) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: container, antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    window.earthScene = { scene, camera, renderer, container };

    const earthGeo = new THREE.SphereGeometry(0.6, 64, 64);
    const earthTexture = new THREE.TextureLoader().load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
    const earthBump = new THREE.TextureLoader().load('https://unpkg.com/three-globe/example/img/earth-topology.png');
    const earthSpec = new THREE.TextureLoader().load('https://unpkg.com/three-globe/example/img/earth-water.png');

    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      bumpMap: earthBump,
      bumpScale: 0.015,
      specularMap: earthSpec,
      specular: new THREE.Color('grey'),
      shininess: 15
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    const cloudGeo = new THREE.SphereGeometry(0.61, 64, 64);
    const cloudTexture = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png');
    const cloudMat = new THREE.MeshPhongMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);

    const atmoGeo = new THREE.SphereGeometry(0.65, 64, 64);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x72a6ff,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmosphere);

    const ambientLight = new THREE.AmbientLight(0x333333, 0.4);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    const gpsMarkerGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const gpsMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    window.gpsMarker = new THREE.Mesh(gpsMarkerGeo, gpsMat);
    earth.add(window.gpsMarker);

    camera.position.z = 1.7;

    let mouseDown = false, rotX = 0, rotY = 0, targetRotX = 0, targetRotY = 0;
    const autoRotateSpeed = 0.0008;

    function animate() {
      requestAnimationFrame(animate);

      targetRotY += autoRotateSpeed;

      rotY += (targetRotY - rotY) * 0.1;
      rotX += (targetRotX - rotX) * 0.1;

      earth.rotation.y = rotY;
      earth.rotation.x = rotX * 0.3;
      clouds.rotation.y = rotY + 0.002;
      clouds.rotation.x = rotX * 0.3 + 0.001;
      atmosphere.rotation.y = rotY;
      atmosphere.rotation.x = rotX * 0.3;

      renderer.render(scene, camera);
    }

    let prevMouse = { x: 0, y: 0 };
    container.addEventListener('mousedown', (e) => {
      mouseDown = true;
      container.style.cursor = 'grabbing';
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    document.addEventListener('mouseup', () => {
      mouseDown = false;
      container.style.cursor = 'grab';
    });
    container.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const deltaX = e.clientX - prevMouse.x;
      const deltaY = e.clientY - prevMouse.y;
      targetRotY += deltaX * 0.01;
      targetRotX += deltaY * 0.01;
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    container.addEventListener('touchstart', (e) => {
      mouseDown = true;
      container.style.cursor = 'grabbing';
      if (e.touches.length > 0) {
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });
    container.addEventListener('touchend', () => {
      mouseDown = false;
      container.style.cursor = 'grab';
    });
    container.addEventListener('touchmove', (e) => {
      if (!mouseDown || e.touches.length === 0) return;
      e.preventDefault();
      const deltaX = e.touches[0].clientX - prevMouse.x;
      const deltaY = e.touches[0].clientY - prevMouse.y;
      targetRotY += deltaX * 0.01;
      targetRotX += deltaY * 0.01;
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    });

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', resize);

    window.updateGPSMarker = (lat = RT.lat, lon = RT.lon) => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lon + 180) * Math.PI / 180;
      window.gpsMarker.position.set(
        0.61 * Math.sin(phi) * Math.cos(theta),
        0.61 * Math.cos(phi),
        0.61 * Math.sin(phi) * Math.sin(theta)
      );
    };
    window.updateGPSMarker();

    animate();
    resize();
  }

  function initUnitToggle() {
    const toggleBtn = $('unitToggle');
    if (!toggleBtn) return;

    function updateToggleDisplay() {
      const unit = RT.unit();
      toggleBtn.textContent = unit;
      const label = $('tempUnitLabel');
      if (label) label.textContent = unit;
    }

    toggleBtn.addEventListener('click', () => {
      RT.isFahrenheit = !RT.isFahrenheit;
      updateToggleDisplay();
      saveSettings();
      toast(`🌡️ Chuyển sang ${RT.unit()}`, 'success');
      refreshAll();
    });

    updateToggleDisplay();
  }

  function initHeaderFavorite() {
    const btn = $('headerFavBtn');
    if (!btn) return;

    function update() {
      const currentId = findIdByCoords(RT.lat, RT.lon);
      const isFav = currentId && RT.favorites.includes(currentId);
      btn.classList.toggle('active', !!isFav);
      btn.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
    }

    function findIdByCoords(lat, lon) {
      if (!window.WARDS) return null;
      const w = window.WARDS.find(w => Math.abs(w.lat - lat) < 0.001 && Math.abs(w.lon - lon) < 0.001);
      return w ? w.id : null;
    }

    btn.addEventListener('click', () => {
      const currentId = findIdByCoords(RT.lat, RT.lon);
      if (!currentId) return toast('Vị trí này không hỗ trợ gắn sao', 'warn');
      toggleFavorite(currentId);
      update();
    });

    window.updateHeaderFavoriteState = update;
    update();
  }

  function initThemeToggle() {
    const themeBtn = $('themeBtn');
    const themeDropdown = $('themeDropdown');
    const root = document.documentElement;
    const savedTheme = 'toweather';
    root.setAttribute('data-theme', savedTheme);
    localStorage.setItem('rt_theme', savedTheme);

    if (themeDropdown) themeDropdown.remove();
    if (themeBtn) themeBtn.remove();
  }

  const STEMLab = {
    calcHeatIndex: (t, rh) => {
      if (t < 27) return t;
      let hi = 0.5 * (t * 1.8 + 32 + 61.0 + ((t * 1.8 + 32 - 68.0) * 1.2) + (rh * 0.094));
      if (hi > 80) {
        const tf = t * 1.8 + 32;
        hi = -42.379 + 2.04901523 * tf + 10.14333127 * rh - 0.22475541 * tf * rh -
          0.00683783 * tf * tf - 0.05481717 * rh * rh + 0.00122874 * tf * tf * rh +
          0.00085282 * tf * rh * rh - 0.00000199 * tf * tf * rh * rh;
      }
      return (hi - 32) / 1.8;
    },
    calcWindChill: (t, v) => {
      if (t > 10 || v < 4.8) return t;
      return 13.12 + 0.6215 * t - 11.37 * Math.pow(v, 0.16) + 0.3965 * t * Math.pow(v, 0.16);
    },
    calcET0: (tMin, tMax, tAvg, lat) => {
      const ra = 15;
      return 0.0023 * (tAvg + 17.8) * Math.pow(tMax - tMin, 0.5) * ra;
    },
    calcWBGT: (t, rh, wind, uv) => {
      const tw = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
        Math.atan(t + rh) - Math.atan(rh - 1.676331) +
        0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
      const tg = t + (uv * 0.5);
      return 0.7 * tw + 0.2 * tg + 0.1 * t;
    }
  };

  function renderSTEMLab() {
    const d = RT.current;
    if (!d) return;
    const t = d.main.temp;
    const rh = d.main.humidity;
    const wind = mps2kmh(d.wind.speed);
    const uv = RT.onecall?.current?.uvi || 0;

    const hi = STEMLab.calcHeatIndex(t, rh);
    const wc = STEMLab.calcWindChill(t, wind);
    const wbgt = STEMLab.calcWBGT(t, rh, wind, uv);

    let tMin = t - 2, tMax = t + 2;
    if (RT.forecast?.list) {
      const todayTemps = RT.forecast.list.slice(0, 8).map(i => i.main.temp);
      tMin = Math.min(...todayTemps);
      tMax = Math.max(...todayTemps);
    }
    const et0 = STEMLab.calcET0(tMin, tMax, t, RT.lat);

    setTxt('stemHI', RT.dispT(hi) + '°');
    setTxt('stemWC', RT.dispT(wc) + '°');
    setTxt('stemET', et0.toFixed(2) + ' mm');
    setTxt('stemWBGT', RT.dispT(wbgt) + '°');
  }

  let trendChartInstance = null;
  function renderTrendChart() {
    const canvas = $('trendChart');
    if (!canvas || !RT.forecast?.list) return;

    const byDay = {};
    RT.forecast.list.forEach(item => {
      const date = new Date(item.dt * 1000).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' });
      if (!byDay[date]) byDay[date] = { temps: [], rains: [] };
      byDay[date].temps.push(item.main.temp);
      byDay[date].rains.push((item.pop || 0) * 10);
    });

    const labels = Object.keys(byDay).slice(0, 7);
    const tempData = labels.map(l => (byDay[l].temps.reduce((a, b) => a + b) / byDay[l].temps.length).toFixed(1));
    const rainData = labels.map(l => (byDay[l].rains.reduce((a, b) => a + b) / byDay[l].rains.length).toFixed(1));

    if (trendChartInstance) trendChartInstance.destroy();

    const info = $('trendChartInfo');
    if (info) info.style.display = 'none';

    trendChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Lượng mưa (mm)',
            data: rainData,
            backgroundColor: 'rgba(59, 158, 255, 0.45)',
            borderColor: 'rgba(59, 158, 255, 0.8)',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'yRain',
            order: 2
          },
          {
            label: 'Nhiệt độ (°C)',
            data: tempData,
            type: 'line',
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 3,
            pointBackgroundColor: '#f59e0b',
            tension: 0.4,
            yAxisID: 'yTemp',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: { usePointStyle: true }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          yRain: {
            type: 'linear', position: 'left',
            title: { display: true, text: 'Lượng mưa (mm)', color: '#3b9eff', font: { weight: 'bold' } },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            ticks: { color: '#3b9eff' },
            beginAtZero: true
          },
          yTemp: {
            type: 'linear', position: 'right',
            title: { display: true, text: 'Nhiệt độ (°C)', color: '#f59e0b', font: { weight: 'bold' } },
            grid: { display: false },
            ticks: { color: '#f59e0b' }
          }
        }
      }
    });
  }

  function removeReportUI() {
    const btnSave = document.getElementById('btnSaveReport');
    if (btnSave) btnSave.remove();
  }

  async function init() {
    initUnitToggle();

    initHeaderFavorite();
    initThemeToggle();
    injectCSS();
    injectHTML();
    removeReportUI();
    setupNotifications();
    await loadCropsData();
    patchSelectWard();
    startLiveClock();
    initGPSButton();
    initSearchOverlay();
    initSMSModal();
    initHeroParticles();
    init3DEarth();

    const coords = window.WARDS_COORDS || [];
    if (coords.length) {
      const c = coords.find(c => c.id === 1) || coords[0];
      setLocation(c.lat, c.lon, window.WARDS?.[0]?.name || DEFAULT_NAME);
    }

    const initialRefresh = refreshAll();

    triggerGPS(true);

    await initialRefresh;

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

    console.log(' Mô phỏng dự báo thời tiết Cà Mau — sẵn sàng (Cà Mau mới + cũ). °C/°F toggle restored!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 900);
  }
})();
