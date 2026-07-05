const { weatherHttpGet } = require('../weather-http-client');
const { getCheckWxApiKey } = require('../weather-config');
const { kmToRadiusMiles, mapMetarConditions } = require('../weather-normalize');

const CHECKWX_BASE = 'https://api.checkwx.com';

function buildCheckWxUrl(lat, lon, radiusKm) {
  const radiusMi = kmToRadiusMiles(radiusKm);
  return `${CHECKWX_BASE}/v2/metar/lat/${lat}/lon/${lon}/radius/${radiusMi}`;
}

function mapCheckWxEntry(entry, lat, lon) {
  if (!entry) {
    throw new Error('CheckWX: пустой ответ METAR.');
  }

  const temp = entry.temperature?.celsius ?? entry.temp;
  const windMps = entry.wind?.speed?.mps;
  const windKts = entry.wind?.speed?.kts;

  let windSpeed;
  if (windMps != null && Number.isFinite(Number(windMps))) {
    windSpeed = Number(windMps);
  } else if (windKts != null && Number.isFinite(Number(windKts))) {
    windSpeed = Number(windKts) / 1.94384;
  } else {
    throw new Error('CheckWX: отсутствует скорость ветра.');
  }

  if (temp == null || !Number.isFinite(Number(temp))) {
    throw new Error('CheckWX: отсутствует температура.');
  }

  return {
    temp: Number(temp),
    wind_speed: windSpeed,
    conditions: mapMetarConditions(entry.wx_string, entry.flight_category),
    raw_metar: entry.raw_text ?? null,
    station_icao: entry.icao ?? null,
    observed_at: entry.observed ?? null,
    source_used: 'CheckWX',
    coordinates: { lat: Number(lat), lon: Number(lon) },
  };
}

async function fetchFromCheckWx(lat, lon, radiusKm = 20, options = {}) {
  const apiKey = getCheckWxApiKey();
  if (!apiKey) {
    throw new Error('CHECKWX_SKIPPED');
  }

  const url = buildCheckWxUrl(lat, lon, radiusKm);
  const payload = await weatherHttpGet(url, {
    headers: { 'X-API-Key': apiKey },
    timeout: options.timeoutMs,
  });

  const entries = payload?.data;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('CheckWX: нет METAR в радиусе.');
  }

  return mapCheckWxEntry(entries[0], lat, lon);
}

module.exports = {
  fetchFromCheckWx,
  buildCheckWxUrl,
  mapCheckWxEntry,
};
