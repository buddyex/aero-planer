const { weatherHttpGet } = require('../weather-http-client');
const { buildNoaaBbox, knotsToMps, mapMetarConditions } = require('../weather-normalize');

const NOAA_METAR_URL = 'https://aviationweather.gov/api/data/metar';

function normalizeNoaaRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function mapNoaaEntry(entry, lat, lon) {
  if (!entry) {
    throw new Error('NOAA: пустой ответ METAR.');
  }

  const temp = entry.temp ?? entry.temperature;
  if (temp == null || !Number.isFinite(Number(temp))) {
    throw new Error('NOAA: отсутствует температура.');
  }

  let windSpeed;
  if (entry.wspd != null && Number.isFinite(Number(entry.wspd))) {
    windSpeed = knotsToMps(entry.wspd);
  } else if (entry.windSpeedKt != null && Number.isFinite(Number(entry.windSpeedKt))) {
    windSpeed = knotsToMps(entry.windSpeedKt);
  } else {
    throw new Error('NOAA: отсутствует скорость ветра.');
  }

  return {
    temp: Number(temp),
    wind_speed: windSpeed,
    conditions: mapMetarConditions(entry.wxString ?? entry.wx, entry.fltCat),
    raw_metar: entry.rawOb ?? entry.raw_text ?? null,
    station_icao: entry.icaoId ?? entry.icao ?? null,
    observed_at: entry.obsTime ?? entry.reportTime ?? null,
    source_used: 'NOAA',
    coordinates: { lat: Number(lat), lon: Number(lon) },
  };
}

async function fetchFromNoaa(lat, lon, options = {}) {
  const bbox = buildNoaaBbox(lat, lon);
  const url = `${NOAA_METAR_URL}?bbox=${bbox}&format=json`;
  const payload = await weatherHttpGet(url, { timeout: options.timeoutMs });

  const rows = normalizeNoaaRows(payload);
  if (rows.length === 0) {
    throw new Error('NOAA: нет METAR в bbox.');
  }

  return mapNoaaEntry(rows[0], lat, lon);
}

module.exports = {
  fetchFromNoaa,
  mapNoaaEntry,
};
