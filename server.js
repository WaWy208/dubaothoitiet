require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const mongoUri = resolveMongoUri();
const dbName = process.env.MONGODB_DB || 'weather_app';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

let clientPromise;
let dbState = {
  available: false,
  checkedAt: null,
  error: null
};

function cleanEnvValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function resolveMongoUri() {
  const configuredUri = cleanEnvValue(
    process.env.MONGODB_URI
    || process.env.DATABASE_URL
    || process.env.MONGO_URL
    || process.env.MONGO_URI
  );

  if (configuredUri) return configuredUri;
  return isProduction ? '' : 'mongodb://127.0.0.1:27017';
}

function assertMongoConfig() {
  if (!mongoUri) {
    throw new Error('Missing MongoDB connection string. Set MONGODB_URI, DATABASE_URL, MONGO_URL, or MONGO_URI.');
  }

  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Invalid MongoDB URI. It must start with mongodb:// or mongodb+srv://');
  }
}

function updateDbState(available, error = null) {
  dbState = {
    available,
    checkedAt: new Date().toISOString(),
    error: error ? error.message : null
  };
}

function getDbStatus() {
  return {
    configured: Boolean(mongoUri),
    available: dbState.available,
    checkedAt: dbState.checkedAt,
    error: dbState.error
  };
}

function handleDbFailure(error) {
  clientPromise = null;
  updateDbState(false, error);
  return error;
}

function createLocationKey(lat, lon) {
  const safeLat = Number.isFinite(lat) ? lat.toFixed(2) : '0.00';
  const safeLon = Number.isFinite(lon) ? lon.toFixed(2) : '0.00';
  return `${safeLat},${safeLon}`;
}

function toDayKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weatherSummaryFromCode(code) {
  if (code == null) return { icon: '☁️', desc: 'Không rõ' };
  if (code === 0) return { icon: '☀️', desc: 'Trời quang' };
  if (code <= 3) return { icon: '🌤️', desc: 'Ít mây' };
  if (code <= 48) return { icon: '🌫️', desc: 'Sương mù' };
  if (code <= 67) return { icon: '🌧️', desc: 'Mưa nhẹ' };
  if (code <= 77) return { icon: '❄️', desc: 'Tuyết' };
  if (code <= 82) return { icon: '🌦️', desc: 'Mưa rào' };
  if (code <= 99) return { icon: '⛈️', desc: 'Giông sét' };
  return { icon: '☁️', desc: 'Nhiều mây' };
}

async function fetchOpenMeteoHistory(lat, lon, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: toDayKey(startDate),
    end_date: toDayKey(endDate),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code',
    hourly: 'relative_humidity_2m',
    timezone: 'auto'
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP ${response.status}`);
  }
  return response.json();
}

function buildHistoryDocsFromArchive(location, archiveData) {
  const daily = archiveData?.daily;
  if (!daily?.time?.length) return [];

  return daily.time.map((dayKey, index) => {
    let meanHumidity = null;
    if (Array.isArray(archiveData?.hourly?.relative_humidity_2m)) {
      const hours = archiveData.hourly.relative_humidity_2m.slice(index * 24, (index + 1) * 24);
      if (hours.length) {
        meanHumidity = Math.round(hours.reduce((sum, value) => sum + value, 0) / hours.length);
      }
    }

    const weather = weatherSummaryFromCode(daily.weather_code?.[index]);
    return {
      dayKey,
      locationKey: createLocationKey(location.lat, location.lon),
      location: location.name,
      district: location.district || null,
      locationId: location.id ?? null,
      lat: location.lat,
      lon: location.lon,
      hi: daily.temperature_2m_max?.[index] != null ? Math.round(daily.temperature_2m_max[index]) : null,
      lo: daily.temperature_2m_min?.[index] != null ? Math.round(daily.temperature_2m_min[index]) : null,
      rain: daily.precipitation_sum?.[index] != null ? Math.round(daily.precipitation_sum[index]) : null,
      humidity: meanHumidity,
      wind: daily.wind_speed_10m_max?.[index] != null ? Math.round(daily.wind_speed_10m_max[index]) : null,
      icon: weather.icon,
      desc: weather.desc,
      source: 'bulk-sync',
      updatedAt: new Date()
    };
  });
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const results = [];

  async function consume() {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => consume());
  await Promise.all(workers);
  return results;
}

async function getDb() {
  if (!clientPromise) {
    assertMongoConfig();
    const client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });
    clientPromise = client.connect().catch((error) => {
      throw handleDbFailure(error);
    });
  }

  const client = await clientPromise.catch((error) => {
    throw handleDbFailure(error);
  });
  const db = client.db(dbName);

  await Promise.all([
    db.collection('weather_history').createIndex({ locationKey: 1, dayKey: 1 }, { unique: true }),
    db.collection('weather_history').createIndex({ createdAt: -1 }),
    db.collection('weather_reports').createIndex({ createdAt: -1 })
  ]).catch((error) => {
    throw handleDbFailure(error);
  });

  updateDbState(true);

  return db;
}

app.get('/api/health', async (_req, res) => {
  try {
    await getDb();
    res.json({ ok: true, database: dbName, db: getDbStatus() });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: dbName,
      db: getDbStatus(),
      error: error.message
    });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const limit = Math.min(Math.max(Number(req.query.days || 7), 1), 30);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ ok: false, error: 'lat and lon are required' });
    }

    const db = await getDb();
    const items = await db.collection('weather_history')
      .find({ locationKey: createLocationKey(lat, lon) })
      .sort({ dayKey: -1 })
      .limit(limit)
      .toArray();

    return res.json({ ok: true, items: items.reverse(), db: getDbStatus() });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      items: [],
      degraded: true,
      db: getDbStatus(),
      error: error.message
    });
  }
});

app.post('/api/save-report', async (req, res) => {
  try {
    const payload = req.body || {};
    const lat = Number(payload.lat);
    const lon = Number(payload.lon);
    const dayKey = payload.dayKey || toDayKey(payload.time || new Date());
    const db = await getDb();

    let historyId = null;

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const historyDoc = {
        dayKey,
        locationKey: createLocationKey(lat, lon),
        location: payload.location || 'Unknown',
        lat,
        lon,
        hi: payload.history?.hi ?? null,
        lo: payload.history?.lo ?? null,
        rain: payload.history?.rain ?? null,
        humidity: payload.history?.humidity ?? null,
        wind: payload.history?.wind ?? null,
        icon: payload.history?.icon ?? null,
        desc: payload.history?.desc ?? null,
        source: payload.history?.source || 'live',
        updatedAt: new Date()
      };

      const historyResult = await db.collection('weather_history').findOneAndUpdate(
        { locationKey: historyDoc.locationKey, dayKey },
        {
          $set: historyDoc,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, returnDocument: 'after' }
      );

      historyId = historyResult?.value?._id || null;
    }

    const reportDoc = {
      location: payload.location || 'Unknown',
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      dayKey,
      current: payload.current || null,
      history: payload.history || null,
      forecast_24h: Array.isArray(payload.forecast_24h) ? payload.forecast_24h : [],
      createdAt: new Date(payload.time || Date.now())
    };

    const reportResult = await db.collection('weather_reports').insertOne(reportDoc);

    return res.json({
      ok: true,
      saved: true,
      historyId: historyId ? String(historyId) : null,
      reportId: String(reportResult.insertedId),
      db: getDbStatus()
    });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      saved: false,
      degraded: true,
      db: getDbStatus(),
      error: error.message
    });
  }
});

app.post('/api/sync-locations', async (req, res) => {
  try {
    const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
    const days = Math.min(Math.max(Number(req.body?.days || 7), 1), 14);

    if (!locations.length) {
      return res.status(400).json({ ok: false, error: 'locations are required' });
    }

    const db = await getDb();
    const endDate = new Date();
    endDate.setHours(12, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));

    let syncedLocations = 0;
    let syncedDays = 0;
    const errors = [];

    await runWithConcurrency(locations, 5, async (location) => {
      try {
        if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon) || !location.name) {
          throw new Error('Invalid location payload');
        }

        const archiveData = await fetchOpenMeteoHistory(location.lat, location.lon, startDate, endDate);
        const docs = buildHistoryDocsFromArchive(location, archiveData);

        if (!docs.length) {
          throw new Error('No history rows returned');
        }

        const operations = docs.map((doc) => ({
          updateOne: {
            filter: { locationKey: doc.locationKey, dayKey: doc.dayKey },
            update: {
              $set: doc,
              $setOnInsert: { createdAt: new Date() }
            },
            upsert: true
          }
        }));

        await db.collection('weather_history').bulkWrite(operations, { ordered: false });
        syncedLocations += 1;
        syncedDays += docs.length;
      } catch (error) {
        errors.push({ name: location.name || 'Unknown', error: error.message });
      }
    });

    return res.json({
      ok: true,
      syncedLocations,
      syncedDays,
      totalLocations: locations.length,
      failedLocations: errors.length,
      errors: errors.slice(0, 10),
      db: getDbStatus()
    });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      degraded: true,
      syncedLocations: 0,
      syncedDays: 0,
      totalLocations: Array.isArray(req.body?.locations) ? req.body.locations.length : 0,
      failedLocations: 0,
      errors: [],
      db: getDbStatus(),
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Weather server listening on http://localhost:${port}`);
  console.log(`MongoDB database: ${dbName}`);
  console.log(`MongoDB mode: ${isProduction ? 'env-only' : 'local-or-env'}`);
  console.log(`MongoDB URI configured: ${mongoUri ? 'yes' : 'no'}`);
  if (!mongoUri) {
    console.warn('MongoDB is not configured. Set MONGODB_URI, DATABASE_URL, MONGO_URL, or MONGO_URI in your deploy environment.');
  }
});
