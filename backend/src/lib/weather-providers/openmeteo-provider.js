const { weatherHttpGet } = require('../weather-http-client');
const { mapWeatherCodeToPrecipitation } = require('../weather-normalize');

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

function buildOpenMeteoUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,wind_speed_10m,precipitation,weather_code',
    wind_speed_unit: 'ms',
    timezone: 'auto',
  });
  return `${OPEN_METEO_BASE}?${params.toString()}`;
}

function mapOpenMeteoPayload(payload, lat, lon) {
  const current = payload?.current;
  if (!current) {
    throw new Error('OpenMeteo: отсутствует поле current.');
  }
  if (current.temperature_2m === undefined || current.wind_speed_10m === undefined) {
    throw new Error('OpenMeteo: отсутствуют temperature_2m или wind_speed_10m.');
  }

  const temp = Number(current.temperature_2m);
  const windSpeed = Number(current.wind_speed_10m);
  if (!Number.isFinite(temp) || !Number.isFinite(windSpeed)) {
    throw new Error('OpenMeteo: некорректные числовые значения.');
  }

  return {
    temp,
    wind_speed: windSpeed,
    conditions: mapWeatherCodeToPrecipitation(
      current.weather_code,
      current.precipitation ?? 0,
    ),
    raw_metar: null,
    station_icao: null,
    observed_at: null,
    source_used: 'OpenMeteo',
    coordinates: { lat: Number(lat), lon: Number(lon) },
  };
}

async function fetchFromOpenMeteo(lat, lon, options = {}) {
  const url = buildOpenMeteoUrl(lat, lon);
  const payload = await weatherHttpGet(url, { timeout: options.timeoutMs });
  return mapOpenMeteoPayload(payload, lat, lon);
}

module.exports = {
  fetchFromOpenMeteo,
  buildOpenMeteoUrl,
  mapOpenMeteoPayload,
};
