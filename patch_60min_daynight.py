import re

filepath = r'c:\Users\admin\Documents\weather\script.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ============================================================
# 1. Add isDayNow() Helper
# ============================================================
is_day_now_fn = """  function isDayNow() {
    const sys = RT.current?.sys;
    if (sys?.sunrise && sys?.sunset) {
      const now = Date.now() / 1000;
      return now >= sys.sunrise && now < sys.sunset;
    }
    const h = new Date().getHours();
    return h >= 6 && h < 18;
  }

  function sunEventIcon(dtSec) {"""

if "function isDayNow() {" not in content:
    content = content.replace("  function sunEventIcon(dtSec) {", is_day_now_fn, 1)
    print("Added isDayNow() helper")

# ============================================================
# 2. Update renderFarmAlert (60-min + Day/Night)
# ============================================================
new_farm_alert = """  function renderFarmAlert() {
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
    const nextTemp = nextHour.temp ?? curTemp;
    
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const nextWind = mps2kmh(nextHour.wind || 0);
    
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const nextRain = nextHour.rain || curRain;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));
    const nextPop = Math.round((nextHour.pop || 0) * 100);

    const isDay = isDayNow();

    const hasStorm = (nextHour.weather?.id || 0) >= 200 && (nextHour.weather?.id || 0) < 300;
    const hasHeat = nextTemp >= 35;
    const hasWind = nextWind >= 28;
    const hasHeavyRain = nextRain >= 10 || nextPop >= 70;

    const warnHeat = nextTemp >= 32;
    const warnWind = nextWind >= 22;
    const warnRain = nextRain >= 5 || nextPop >= 50;

    const details = [];
    if (hasStorm) details.push('⚠️ Nguy hiểm: Dông sét 60 phút tới (mã 2xx)');
    if (hasHeavyRain) details.push(`⚠️ Nguy hiểm: Mưa lớn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% ≥ 10mm/70%)`);
    if (hasWind) details.push(`⚠️ Nguy hiểm: Gió mạnh 60 phút tới (${nextWind.toFixed(1)} km/h ≥ 28 km/h)`);
    if (hasHeat) {
      const advice = isDay ? "Tưới nước buổi sáng sớm, che lưới cho cây trồng" : "Theo dõi nhiệt đất, chuẩn bị tưới sáng sớm mai";
      details.push(`⚠️ Nguy hiểm: Nắng nóng cực đại (${nextTemp.toFixed(1)}°C ≥ 35°C) — ${advice}`);
    }

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(`⚡ Cảnh báo: Mưa/xác suất cao 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% ≥ 5mm/50%)`);
    if (!hasWind && warnWind) warnDetails.push(`⚡ Cảnh báo: Gió khá mạnh 60 phút tới (${nextWind.toFixed(1)} km/h ≥ 22 km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(`⚡ Cảnh báo: Nhiệt tăng 60 phút tới (${nextTemp.toFixed(1)}°C ≥ 32°C)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const crops = getCropsForWard(wardInfo);
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Cảnh báo Nông nghiệp (60 phút tới)</strong>: Nguy hiểm tại vị trí GPS.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Cây trồng: ${crops.join(', ') || 'Đang cập nhật'}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Cảnh báo Nông nghiệp (60 phút tới)</strong>: Theo dõi tại vị trí GPS.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Nông nghiệp ổn định (60 phút tới)</strong>: Thuận lợi tại vị trí GPS.` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Cây trồng: ${crops.join(', ') || 'Đang cập nhật'}</span>`;
    }
  }"""

content = re.sub(r'  function renderFarmAlert\(\) \{.*?  \}', new_farm_alert, content, flags=re.DOTALL)

# ============================================================
# 3. Update renderAquaAlert (60-min + Day/Night)
# ============================================================
new_aqua_alert = """  function renderAquaAlert() {
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
    if (hasStorm) details.push('⚠️ Nguy hiểm: Dông sét gây sốc nước 60 phút tới');
    if (hasHeavyRain) details.push(`⚠️ Nguy hiểm: Mưa lớn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% ≥ 10mm/70%)`);
    if (hasWind) details.push(`⚠️ Nguy hiểm: Gió mạnh 60 phút tới (${nextWind.toFixed(1)}km/h ≥ 28km/h)`);
    if (hasHeat) {
        const advice = isDay ? "Che mát ao nuôi, tăng sục khí oxy" : "Tăng sục khí oxy (nhiệt nước còn cao), kiểm tra oxy hòa tan";
        details.push(`⚠️ Nguy hiểm: Nắng nóng cực đại (${nextHeatIndex.toFixed(1)}°C ≥ 35°C) \u2014 ${advice}`);
    }
    if (hasHighTide) {
        const caution = isDay ? "Gia cố bờ bao, kiểm tra cống" : "Kiểm tra bờ bao bằng đèn pin, đề phòng sạt lở túi khí ban đêm";
        details.push(`⚠️ Nguy hiểm: Mực triều (${waterLvl.toFixed(2)}m > 2.5m) \u2014 Cảnh báo ngập vùng nuôi tôm! ${caution}`);
    }

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(`⚡ Cảnh báo: Biến động độ mặn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}%)`);
    if (!hasWind && warnWind) warnDetails.push(`⚡ Cảnh báo: Gió khá mạnh 60 phút tới (${nextWind.toFixed(1)}km/h ≥ 22km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(`⚡ Cảnh báo: Nhiệt tăng 60 phút tới (${nextHeatIndex.toFixed(1)}°C ≥ 31°C)`);
    if (!hasHighTide && warnHighTide) warnDetails.push(`⚡ Cảnh báo: Mực nước cao (${waterLvl.toFixed(2)}m > 2.0m)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Thủy sản (60 phút tới - Nguy hiểm)</strong>: Rủi ro cao tại vị trí GPS.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}${nearestSt ? ' (Trạm: ' + nearestSt.name + ')' : ''}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Thủy sản (60 phút tới - Cảnh báo)</strong>: Theo dõi tại vị trí GPS.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Thủy sản ổn định (60 phút tới)</strong>: Không có rủi ro tại GPS.` +
        `<span class="farm-meta">Vị trí: ${locLabel} (GPS) · Nguồn: OpenWeatherMap</span>`;
    }
  }"""

content = re.sub(r'  function renderAquaAlert\(\) \{.*?  \}', new_aqua_alert, content, flags=re.DOTALL)

# ============================================================
# 4. Update renderRoadAlert (60-min + Day/Night)
# ============================================================
new_road_alert = """  function renderRoadAlert() {
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
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const nextWind = mps2kmh(nextHour.wind || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const nextRain = nextHour.rain || curRain;
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
    if (hasStorm) details.push('⚠️ Nguy hiểm: Dông sét 60 phút tới, hạn chế di chuyển');
    if (hasHeavyRain) details.push(`⚠️ Nguy hiểm: Mưa lớn 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}% ≥ 10mm/70%)`);
    if (hasWind) details.push(`⚠️ Nguy hiểm: Gió mạnh 60 phút tới (${nextWind.toFixed(1)}km/h ≥ 28km/h)`);
    if (hasHeat) details.push(`⚠️ Nguy hiểm: Nắng nóng cực đại (${nextTemp.toFixed(1)}°C ≥ 35°C) \u2014 ${isDay ? "Dễ mất nước, say nắng" : "Cần bù nước, nhiệt đường còn cao"}`);
    if (hasLowVis) {
        const advice = isDay ? "Bật đèn sương mù, đi chậm" : "Bật đèn chiếu sáng xa/gần, chú ý quan sát vật cản";
        details.push(`⚠️ Nguy hiểm: Tầm nhìn thấp (${visibilityKm.toFixed(1)}km < 2km) \u2014 ${advice}`);
    }

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(`⚡ Cảnh báo: Có mưa 60 phút tới (${nextRain.toFixed(1)}mm/h / ${nextPop}%)`);
    if (!hasWind && warnWind) warnDetails.push(`⚡ Cảnh báo: Gió khá mạnh 60 phút tới (${nextWind.toFixed(1)}km/h ≥ 22km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(`⚡ Cảnh báo: Nhiệt cao 60 phút tới (${nextTemp.toFixed(1)}°C ≥ 31°C)`);
    if (!hasLowVis && warnVis) warnDetails.push(`⚡ Cảnh báo: Tầm nhìn giảm 60 phút tới (${visibilityKm.toFixed(1)}km < 4km)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Giao thông (60 phút tới - Nguy hiểm)</strong>: Điều kiện không an toàn tại GPS.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Giao thông (60 phút tới - Cảnh báo)</strong>: Chú ý quan sát tại GPS.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Giao thông ổn định (60 phút tới)</strong>: Thuận lợi tại GPS.` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    }
  }"""

content = re.sub(r'  function renderRoadAlert\(\) \{.*?  \}', new_road_alert, content, flags=re.DOTALL)

# ============================================================
# 5. Update Dashboards (60-min Trend & Advice)
# ============================================================

# Update renderRoadDashboard
new_road_dash_logic = """    const next = getInterpolated24h().slice(0, 1);
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
        current: `${curRain.toFixed(1)} mm/h \u00b7 ${curPop}%`,
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
        current: hasStorm ? 'Có dông' : 'Không',
        trend: nxtHasStorm ? '60 phút tới: có khả năng' : 'Ổn định',
        level: nxtHasStorm ? 'danger' : 'ok',
        advice: nxtHasStorm ? 'Tránh di chuyển ngoài trời' : 'Bình thường'
      },
      {
        name: 'Tầm nhìn',
        threshold: '<2 km',
        current: visibilityKm != null ? `${visibilityKm.toFixed(1)} km` : '\u2014',
        trend: visibilityKm != null ? `Dự báo: ~${visibilityKm.toFixed(1)} km` : '\u2014',
        level: visibilityKm != null && visibilityKm < 2 ? 'danger' : (visibilityKm != null && visibilityKm < 4 ? 'warn' : 'ok'),
        advice: visibilityKm != null && visibilityKm < 4 ? (isDay ? 'Bật đèn sương mù' : 'Kiểm tra đèn chiếu sáng') : 'Bình thường'
      },
      {
        name: 'Nắng nóng',
        threshold: '≥31°C',
        current: curTemp != null ? `${curTemp.toFixed(1)}°C` : '\u2014',
        trend: `60 phút tới: ${nxtTemp.toFixed(1)}°C`,
        level: nxtTemp >= 35 ? 'danger' : (nxtTemp >= 31 ? 'warn' : 'ok'),
        advice: nxtTemp >= 35 ? 'Che nắng, tránh say nắng' : 'Bình thường'
      }
    ];"""

content = re.sub(r'    const next = getInterpolated24h\(\)\.slice\(0, 12\);.*?    const rows = \[.*?    \];', 
                 new_road_dash_logic, content, count=1, flags=re.DOTALL)

# Update renderFarmDashboard
new_farm_dash_logic = """    const next = getInterpolated24h().slice(0, 1);
    const cur = RT.current;
    const curTemp = cur.main?.temp ?? null;
    const curFeels = cur.main?.feels_like ?? null;
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
        current: curTemp != null ? `${curTemp.toFixed(1)}°C` : '\u2014',
        trend: `60 phút tới: ${nxtTemp.toFixed(1)}°C`,
        level: nxtTemp >= 35 ? 'danger' : (nxtTemp >= 33 ? 'warn' : 'ok'),
        advice: nxtTemp >= 35 ? (isDay ? 'Tưới nước sáng sớm, che lưới' : 'Chuẩn bị tưới sáng mai') : 'Bình thường'
      },
      {
        name: 'Mưa lớn',
        threshold: '≥10mm/h hoặc ≥70%',
        current: `${curRain.toFixed(1)} mm/h \u00b7 ${curPop}%`,
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
    ];"""

content = re.sub(r'    const next = getInterpolated24h\(\)\.slice\(0, 12\);.*?    const rows = \[.*?    \];', 
                 new_farm_dash_logic, content, count=1, flags=re.DOTALL)

# Update renderAquaDashboard
new_aqua_dash_logic = """    const next = getInterpolated24h().slice(0, 1);
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
        current: waterLvlAqua != null ? waterLvlAqua.toFixed(2) + 'm' : '\u2014',
        trend: `Trạm: ${nearestStAqua ? nearestStAqua.name : '\u2014'}`,
        level: waterLvlAqua != null && waterLvlAqua > 2.5 ? 'danger' : (waterLvlAqua != null && waterLvlAqua > 2.0 ? 'warn' : 'ok'),
        advice: waterLvlAqua != null && waterLvlAqua > 2.5 ? (isDay ? '⚠️ Gia cố bờ bao' : '⚠️ Kiểm tra bờ bao bằng đèn pin') : 'Bình thường'
      },
      {
        name: 'Mưa lớn',
        threshold: '≥10mm/h hoặc ≥70%',
        current: `${curRain.toFixed(1)} mm/h \u00b7 ${curPop}%`,
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
        current: curTemp != null ? `${curTemp.toFixed(1)}°C` : '\u2014',
        trend: `60 phút tới: ${nxtTemp.toFixed(1)}°C`,
        level: nxtTemp >= 31 ? 'warn' : 'ok',
        advice: nxtTemp >= 31 ? (isDay ? 'Sục khí/che mát' : 'Tăng oxy hòa tan đêm') : 'Bình thường'
      }
    ];"""

content = re.sub(r'    const next = getInterpolated24h\(\)\.slice\(0, 12\);.*?    const rows = \[.*?    \];', 
                 new_aqua_dash_logic, content, count=1, flags=re.DOTALL)

with open(filepath, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Applied 60-minute real-time window and day/night advice updates to dashboards and alerts.")
