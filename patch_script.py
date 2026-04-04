import re

filepath = r'c:\Users\admin\Documents\weather\script.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)
changes = 0

# ============================================================
# Change 1: renderFarmAlert - heat detail includes specific advice
# ============================================================
old1 = "if (hasHeat) details.push('\u1eafng n\u00f3ng (\u226535\u00b0C)');"
new1 = "if (hasHeat) details.push('N\u1eafng n\u00f3ng (\u226535\u00b0C) \u2014 T\u01b0\u1edbi n\u01b0\u1edbc bu\u1ed5i s\u00e1ng s\u1edbm, che l\u01b0\u1edbi cho c\u00e2y tr\u1ed3ng');"

# Search raw
old1_raw = "if (hasHeat) details.push('\u1eafng n\u00f3ng (\u226535\u00b0C)');"
if old1_raw in content:
    content = content.replace(old1_raw, new1, 1)
    print('Change 1 applied (raw match)')
    changes += 1
else:
    # Try with N prefix
    old1b = "if (hasHeat) details.push('N\u1eafng n\u00f3ng (\u226535\u00b0C)');"
    if old1b in content:
        content = content.replace(old1b, new1, 1)
        print('Change 1 applied (N match)')
        changes += 1
    else:
        print('Change 1 NOT FOUND')
        # Print context around hasHeat
        idx = content.find('hasHeat) details.push')
        if idx >= 0:
            print('Context:', repr(content[idx:idx+80]))

# ============================================================
# Change 2: renderFarmDashboard - heat advice for >= 35
# ============================================================
old2 = "advice: maxTemp >= 35 ? 'T\u01b0\u1edbi t\u0103ng \u1ea9m, che ph\u1ee7 c\u00e2y' : 'Theo d\u00f5i nhi\u1ec7t \u0111\u1ed9'"
new2 = "advice: maxTemp >= 35 ? 'T\u01b0\u1edbi n\u01b0\u1edbc bu\u1ed5i s\u00e1ng s\u1edbm, che l\u01b0\u1edbi cho c\u00e2y tr\u1ed3ng' : (maxTemp >= 33 ? 'Theo d\u00f5i nhi\u1ec7t, chu\u1ea9n b\u1ecb l\u01b0\u1edbi che' : 'Theo d\u00f5i nhi\u1ec7t \u0111\u1ed9')"

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Change 2 applied')
    changes += 1
else:
    print('Change 2 NOT FOUND')
    idx = content.find("T\u01b0\u1edbi t\u0103ng \u1ea9m")
    if idx >= 0:
        print('Context:', repr(content[idx-20:idx+100]))

# ============================================================
# Change 3: Insert getNearestStationData() before renderAquaAlert()
# ============================================================
helper_fn = """  function getNearestStationData() {
    const stations = generateHydroData();
    const tideStations = stations.filter(s => s.waterLevel && Number.isFinite(s.lat) && Number.isFinite(s.lon));
    if (!tideStations.length) return null;
    return tideStations.reduce((best, s) => {
      const d = haversine(RT.lat, RT.lon, s.lat, s.lon);
      return !best || d < best.dist ? { s, dist: d } : best;
    }, null)?.s || null;
  }

  function renderAquaAlert() {"""

old3 = "  function renderAquaAlert() {"

if old3 in content:
    content = content.replace(old3, helper_fn, 1)
    print('Change 3 applied (helper fn inserted)')
    changes += 1
else:
    print('Change 3 NOT FOUND')

# ============================================================
# Change 4: Inside renderAquaAlert - add tide check after hasHeat line
# ============================================================
old4 = "    const hasHeat = heatIndex != null && heatIndex >= 35;\n\n    const warnWind"
new4 = """    const hasHeat = heatIndex != null && heatIndex >= 35;

    // --- Tide / water level check ---
    const nearestSt = getNearestStationData();
    const waterLvl = nearestSt ? parseFloat(nearestSt.waterLevel) : null;
    const hasHighTide = waterLvl != null && waterLvl > 2.5;
    const warnHighTide = waterLvl != null && waterLvl > 2.0 && waterLvl <= 2.5;

    const warnWind"""

if old4 in content:
    content = content.replace(old4, new4, 1)
    print('Change 4a applied (LF)')
    changes += 1
else:
    # try CRLF variant
    old4b = "    const hasHeat = heatIndex != null && heatIndex >= 35;\r\n\r\n    const warnWind"
    new4b = new4.replace('\n    const warnWind', '\r\n    const warnWind')
    if old4b in content:
        content = content.replace(old4b, new4b, 1)
        print('Change 4b applied (CRLF)')
        changes += 1
    else:
        print('Change 4 NOT FOUND')
        idx = content.find('heatIndex >= 35')
        if idx >= 0:
            print('Context around hasHeat in aquaAlert:', repr(content[idx:idx+120]))

# ============================================================
# Change 5: In renderAquaAlert - add hasHighTide to details[]
# ============================================================
old5 = "    if (hasHeat) details.push('N\u1eafng n\u00f3ng l\u00e0m t\u0103ng nhi\u1ec7t n\u01b0\u1edbc, gi\u1ea3m oxy h\u00f2a tan');\r\n\r\n    const warnDetails"
new5 = """    if (hasHeat) details.push('N\u1eafng n\u00f3ng l\u00e0m t\u0103ng nhi\u1ec7t n\u01b0\u1edbc, gi\u1ea3m oxy h\u00f2a tan');
    if (hasHighTide) details.push('\\u26a0\\ufe0f M\u1ef1c th\u1ee7y tri\u1ec1u ' + (waterLvl ? waterLvl.toFixed(2) : '?') + 'm (>2.5m) \\u2014 C\u1ea3nh b\u00e1o ng\u1eadp cho v\u00f9ng nu\u00f4i t\u00f4m! Gia c\u1ed1 b\u1edd bao, ki\u1ec3m tra c\u1ed1ng tho\u00e1t.');\r\n\r\n    const warnDetails"""

if old5 in content:
    content = content.replace(old5, new5, 1)
    print('Change 5a applied (CRLF)')
    changes += 1
else:
    old5b = "    if (hasHeat) details.push('N\u1eafng n\u00f3ng l\u00e0m t\u0103ng nhi\u1ec7t n\u01b0\u1edbc, gi\u1ea3m oxy h\u00f2a tan');\n\n    const warnDetails"
    new5b = new5.replace('\r\n\r\n    const warnDetails', '\n\n    const warnDetails')
    if old5b in content:
        content = content.replace(old5b, new5b, 1)
        print('Change 5b applied (LF)')
        changes += 1
    else:
        print('Change 5 NOT FOUND')

# ============================================================
# Change 6: In renderAquaAlert - add warnHighTide to warnDetails[]
# ============================================================
old6 = "    if (!hasHeat && warnHeat) warnDetails.push('Nhi\u1ec7t t\u0103ng (\u226531\u00b0C), theo d\u00f5i oxy h\u00f2a tan');"
new6 = old6 + "\n    if (!hasHighTide && warnHighTide) warnDetails.push('M\u1ef1c n\u01b0\u1edbc ' + (waterLvl ? waterLvl.toFixed(2) : '?') + 'm (>2.0m), theo d\u00f5i tri\u1ec1u c\u01b0\u1eddng');"

if old6 in content:
    content = content.replace(old6, new6, 1)
    print('Change 6 applied')
    changes += 1
else:
    print('Change 6 NOT FOUND')

# ============================================================
# Change 7: renderAquaDashboard - add tide row
# ============================================================
# Find "const rows = [" inside renderAquaDashboard
# Insert tide data lookup before rows, and add a row for tide level
old7 = "    const rows = [\n      {\n        name: 'M\u01b0a l\u1edbn',\n        threshold: '\u226510mm/h ho\u1eb7c \u226570%',\n        current: `${curRain.toFixed(1)} mm/h \u00b7 ${curPop}%`,\n        trend: `Trong 12 gi\u1edd t\u1edbi: max POP ${maxPop}%`,\n        level: (curRain >= 10 || maxPop >= 70) ? 'danger' : (maxPop >= 50 ? 'warn' : 'ok'),\n        advice: (curRain >= 10 || maxPop >= 70) ? 'Theo d\u00f5i \u0111\u1ed9 m\u1eb7n/tho\u00e1t n\u01b0\u1edbc' : 'B\u00ecnh th\u01b0\u1eddng'\n      },"

# CRLF version
old7_cr = old7.replace('\n', '\r\n')

new7_prefix = """    // --- Tide/water level from nearest station ---
    const nearestStAqua = getNearestStationData();
    const waterLvlAqua = nearestStAqua ? parseFloat(nearestStAqua.waterLevel) : null;

    const rows = [
      {
        name: 'Tri\u1ec1u c\u01b0\u1eddng',
        threshold: '>2.5m',
        current: waterLvlAqua != null ? waterLvlAqua.toFixed(2) + 'm' : '\u2014',
        trend: nearestStAqua ? nearestStAqua.name + ' \u00b7 ' + (nearestStAqua.tide || '\u2014') : '\u2014',
        level: waterLvlAqua != null && waterLvlAqua > 2.5 ? 'danger' : (waterLvlAqua != null && waterLvlAqua > 2.0 ? 'warn' : 'ok'),
        advice: waterLvlAqua != null && waterLvlAqua > 2.5 ? '\u26a0\ufe0f C\u1ea3nh b\u00e1o ng\u1eadp v\u00f9ng nu\u00f4i t\u00f4m! Gia c\u1ed1 b\u1edd bao, ki\u1ec3m tra c\u1ed1ng' : (waterLvlAqua != null && waterLvlAqua > 2.0 ? 'Theo d\u00f5i tri\u1ec1u, chu\u1ea9n b\u1ecb gia c\u1ed1' : 'B\u00ecnh th\u01b0\u1eddng')
      },
      {
        name: 'M\u01b0a l\u1edbn',
        threshold: '\u226510mm/h ho\u1eb7c \u226570%',
        current: `${curRain.toFixed(1)} mm/h \u00b7 ${curPop}%`,
        trend: `Trong 12 gi\u1edd t\u1edbi: max POP ${maxPop}%`,
        level: (curRain >= 10 || maxPop >= 70) ? 'danger' : (maxPop >= 50 ? 'warn' : 'ok'),
        advice: (curRain >= 10 || maxPop >= 70) ? 'Theo d\u00f5i \u0111\u1ed9 m\u1eb7n/tho\u00e1t n\u01b0\u1edbc' : 'B\u00ecnh th\u01b0\u1eddng'
      },"""

if old7 in content:
    content = content.replace(old7, new7_prefix, 1)
    print('Change 7a applied (LF)')
    changes += 1
elif old7_cr in content:
    content = content.replace(old7_cr, new7_prefix.replace('\n', '\r\n'), 1)
    print('Change 7b applied (CRLF)')
    changes += 1
else:
    print('Change 7 NOT FOUND')
    idx = content.find("name: 'M\u01b0a l\u1edbn'")
    if idx >= 0:
        print('Context:', repr(content[idx-50:idx+200]))

print(f'\n=== Total changes applied: {changes} ===')

with open(filepath, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print('File saved.')
