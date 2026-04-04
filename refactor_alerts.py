import re

filepath = r'c:\Users\admin\Documents\weather\script.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ============================================================
# 1. Update renderFarmAlert to show current values & levels
# ============================================================
old_farm_start = "  function renderFarmAlert() {"
# I will replace the logic inside to grab current values
new_farm_logic = """  function renderFarmAlert() {
    const banner = $('farmAlert');
    if (!banner) return;

    const items = getInterpolated24h();
    if (!items.length || !RT.current) {
      banner.hidden = true;
      return;
    }

    const nextItems = items.slice(0, 2);
    const cur = RT.current;
    const curTemp = cur.main?.temp ?? 0;
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));

    const hasStorm = nextItems.some(i => (i.weather?.id || 0) >= 200 && (i.weather?.id || 0) < 300);
    const hasHeat = curTemp >= 35 || nextItems.slice(0,1).some(i => i.temp >= 35);
    const hasWind = curWind >= 28;
    const hasHeavyRain = curRain >= 10 || curPop >= 70;

    const warnHeat = curTemp >= 32 || nextItems.slice(0,1).some(i => i.temp >= 32);
    const warnWind = curWind >= 22;
    const warnRain = curRain >= 5 || curPop >= 50;

    const details = [];
    if (hasStorm) details.push('⚠️ Nguy hiểm: Dông sét (mã 2xx)');
    if (hasHeavyRain) details.push(`⚠️ Nguy hiểm: Mưa lớn (${curRain.toFixed(1)}mm/h / ${curPop}% ≥ 10mm/70%)`);
    if (hasWind) details.push(`⚠️ Nguy hiểm: Gió mạnh (${curWind.toFixed(1)} km/h ≥ 28 km/h)`);
    if (hasHeat) details.push(`⚠️ Nguy hiểm: Nắng nóng (${curTemp.toFixed(1)}°C ≥ 35°C) — Tưới nước buổi sáng sớm, che lưới cho cây trồng`);

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(`⚡ Cảnh báo: Mưa vừa/xác suất cao (${curRain.toFixed(1)}mm/h / ${curPop}% ≥ 5mm/50%)`);
    if (!hasWind && warnWind) warnDetails.push(`⚡ Cảnh báo: Gió khá mạnh (${curWind.toFixed(1)} km/h ≥ 22 km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(`⚡ Cảnh báo: Nhiệt độ cao (${curTemp.toFixed(1)}°C ≥ 32°C)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const crops = getCropsForWard(wardInfo);
    const locLabel = wardInfo
      ? `${wardInfo.name} · ${wardInfo.district}`
      : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Cảnh báo Nông nghiệp (Nguy hiểm)</strong>: Điều kiện bất lợi tại GPS.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `${crops.length ? ` Cây trồng chính: ${crops.join(', ')}.` : ''}` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Nguồn: OpenWeatherMap</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Cảnh báo Nông nghiệp (Theo dõi)</strong>: Có tín hiệu cần lưu ý tại GPS.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Nguồn: OpenWeatherMap</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Nông nghiệp ổn định</strong>: Điều kiện thuận lợi tại GPS.` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel} · Cây trồng: ${crops.join(', ') || 'Đang cập nhật'}</span>`;
    }
  }"""

# Find the end of the existing renderFarmAlert
content = re.sub(r'  function renderFarmAlert\(\) \{.*?  \}', new_farm_logic, content, flags=re.DOTALL)
print("Updated renderFarmAlert with detail values")

# ============================================================
# 2. Update renderAquaAlert to show current values & levels
# ============================================================
new_aqua_logic = """  function renderAquaAlert() {
    const banner = $('aquaAlert');
    if (!banner) return;

    const items = getInterpolated24h();
    if (!items.length || !RT.current) {
      banner.hidden = true;
      return;
    }

    const nextItems = items.slice(0, 2);
    const cur = RT.current;
    const curTemp = cur.main?.temp ?? 0;
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));
    const heatIndex = cur.main?.feels_like ?? curTemp;

    const hasStorm = nextItems.some(i => (i.weather?.id || 0) >= 200 && (i.weather?.id || 0) < 300);
    const hasWind = curWind >= 28;
    const hasHeavyRain = curRain >= 10 || curPop >= 70;
    const hasHeat = heatIndex >= 35;

    const nearestSt = getNearestStationData();
    const waterLvl = nearestSt ? parseFloat(nearestSt.waterLevel) : null;
    const hasHighTide = waterLvl != null && waterLvl > 2.5;
    const warnHighTide = waterLvl != null && waterLvl > 2.0 && waterLvl <= 2.5;

    const warnWind = curWind >= 22;
    const warnRain = curRain >= 5 || curPop >= 50;
    const warnHeat = heatIndex >= 31;

    const details = [];
    if (hasStorm) details.push('⚠️ Nguy hiểm: Dông sét gây sốc nước');
    if (hasHeavyRain) details.push(`⚠️ Nguy hiểm: Mưa lớn (${curRain.toFixed(1)}mm/h / ${curPop}% ≥ 10mm/70%)`);
    if (hasWind) details.push(`⚠️ Nguy hiểm: Gió mạnh (${curWind.toFixed(1)}km/h ≥ 28km/h)`);
    if (hasHeat) details.push(`⚠️ Nguy hiểm: Nắng nóng (${heatIndex.toFixed(1)}°C ≥ 35°C) — Giảm oxy, tăng nhiệt nước`);
    if (hasHighTide) details.push(`⚠️ Nguy hiểm: Mực triều (${waterLvl.toFixed(2)}m > 2.5m) — Cảnh báo ngập vùng nuôi tôm!`);

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(`⚡ Cảnh báo: Mưa/ẩm (${curRain.toFixed(1)}mm/h / ${curPop}% ≥ 5mm/50%)`);
    if (!hasWind && warnWind) warnDetails.push(`⚡ Cảnh báo: Gió khá mạnh (${curWind.toFixed(1)}km/h ≥ 22km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(`⚡ Cảnh báo: Nhiệt tăng (${heatIndex.toFixed(1)}°C ≥ 31°C)`);
    if (!hasHighTide && warnHighTide) warnDetails.push(`⚡ Cảnh báo: Mực nước cao (${waterLvl.toFixed(2)}m > 2.0m)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Khuyến cáo Thủy sản (Nguy hiểm)</strong>: Rủi ro cao tại GPS.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}${nearestSt ? ' (Trạm: ' + nearestSt.name + ')' : ''}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Khuyến cáo Thủy sản (Cảnh báo)</strong>: Cần theo dõi tại GPS.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Thủy sản ổn định</strong>: Điều kiện thuận lợi tại vị trí GPS.` +
        `<span class="farm-meta">Vị trí: ${locLabel} (GPS) · Nguồn: OpenWeatherMap</span>`;
    }
  }"""

content = re.sub(r'  function renderAquaAlert\(\) \{.*?  \}', new_aqua_logic, content, flags=re.DOTALL)
print("Updated renderAquaAlert with detail values")

# ============================================================
# 3. Update renderRoadAlert to show current values & levels
# ============================================================
new_road_logic = """  function renderRoadAlert() {
    const banner = $('roadAlert');
    if (!banner) return;

    const items = getInterpolated24h();
    if (!items.length || !RT.current) {
      banner.hidden = true;
      return;
    }

    const cur = RT.current;
    const curTemp = cur.main?.temp ?? 0;
    const curWind = mps2kmh(cur.wind?.speed || 0);
    const curRain = cur.rain?.['1h'] || cur.rain?.['3h'] || 0;
    const curPop = Math.round(((RT.forecast?.list?.[0]?.pop ?? 0) * 100));
    const visibilityKm = cur.visibility != null ? (cur.visibility / 1000) : null;

    const nextItems = items.slice(0, 2);
    const hasStorm = nextItems.some(i => (i.weather?.id || 0) >= 200 && (i.weather?.id || 0) < 300);
    const hasWind = curWind >= 28;
    const hasHeavyRain = curRain >= 10 || curPop >= 70;
    const hasHeat = curTemp >= 35;
    const hasLowVis = visibilityKm != null && visibilityKm < 2;

    const warnWind = curWind >= 22;
    const warnRain = curRain >= 5 || curPop >= 50;
    const warnHeat = curTemp >= 31;
    const warnVis = visibilityKm != null && visibilityKm < 4;

    const details = [];
    if (hasStorm) details.push('⚠️ Nguy hiểm: Dông sét, hạn chế di chuyển');
    if (hasHeavyRain) details.push(`⚠️ Nguy hiểm: Mưa lớn (${curRain.toFixed(1)}mm/h / ${curPop}% ≥ 10mm/70%) — Đường ngập`);
    if (hasWind) details.push(`⚠️ Nguy hiểm: Gió mạnh (${curWind.toFixed(1)}km/h ≥ 28km/h) — Chú ý vật cản`);
    if (hasHeat) details.push(`⚠️ Nguy hiểm: Nắng nóng (${curTemp.toFixed(1)}°C ≥ 35°C) — Dễ mất nước`);
    if (hasLowVis) details.push(`⚠️ Nguy hiểm: Tầm nhìn thấp (${visibilityKm.toFixed(1)}km < 2km) — Bật đèn`);

    const warnDetails = [];
    if (!hasHeavyRain && warnRain) warnDetails.push(`⚡ Cảnh báo: Có mưa (${curRain.toFixed(1)}mm/h / ${curPop}% ≥ 5mm/50%)`);
    if (!hasWind && warnWind) warnDetails.push(`⚡ Cảnh báo: Gió khá mạnh (${curWind.toFixed(1)}km/h ≥ 22km/h)`);
    if (!hasHeat && warnHeat) warnDetails.push(`⚡ Cảnh báo: Nhiệt cao (${curTemp.toFixed(1)}°C ≥ 31°C)`);
    if (!hasLowVis && warnVis) warnDetails.push(`⚡ Cảnh báo: Tầm nhìn giảm (${visibilityKm.toFixed(1)}km < 4km)`);

    const wardInfo = window.WARDS_COORDS ? nearestWard(RT.lat, RT.lon)?.ward : null;
    const locLabel = wardInfo ? `${wardInfo.name} · ${wardInfo.district}` : (RT.name || 'Khu vực hiện tại');

    if (details.length) {
      banner.classList.remove('is-safe', 'is-warn');
      banner.hidden = false;
      banner.dataset.level = 'danger';
      banner.innerHTML =
        `<strong>Giao thông (Nguy hiểm)</strong>: Điều kiện không an toàn tại GPS.` +
        `<div class="farm-detail">` + details.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else if (warnDetails.length) {
      banner.classList.remove('is-safe'); banner.classList.add('is-warn');
      banner.hidden = false;
      banner.dataset.level = 'warn';
      banner.innerHTML =
        `<strong>Giao thông (Cảnh báo)</strong>: Chú ý quan sát tại vị trí GPS.` +
        `<div class="farm-detail">` + warnDetails.map(d => `• ${d}`).join('<br>') + `</div>` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    } else {
      banner.classList.remove('is-warn'); banner.classList.add('is-safe');
      banner.hidden = false;
      banner.dataset.level = 'ok';
      banner.innerHTML =
        `<strong>Giao thông ổn định</strong>: Điều kiện thuận lợi tại GPS.` +
        `<span class="farm-meta">Vị trí GPS: ${locLabel}</span>`;
    }
  }"""

content = re.sub(r'  function renderRoadAlert\(\) \{.*?  \}', new_road_logic, content, flags=re.DOTALL)
print("Updated renderRoadAlert with detail values")

with open(filepath, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print('File saved successfully.')
