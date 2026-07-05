const { getCheckWxApiKey } = require('./weather-config');
const { fetchFromCheckWx } = require('./weather-providers/checkwx-provider');
const { fetchFromNoaa } = require('./weather-providers/noaa-provider');
const { fetchFromOpenMeteo } = require('./weather-providers/openmeteo-provider');
const systemLogger = require('./system-logger');

class OfflineWeatherError extends Error {
  constructor(message, { attemptedSources = [], lastError = null, failedSources = [] } = {}) {
    super(message);
    this.name = 'OfflineWeatherError';
    this.code = 'OFFLINE_WEATHER';
    this.attemptedSources = attemptedSources;
    this.lastError = lastError;
    this.failedSources = failedSources;
  }
}

function parseCoordinates(lat, lon) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function buildCascadeMeta(failedSources, successSource) {
  if (failedSources.length === 0) return null;
  return {
    failedSources: failedSources.map((f) => f.source),
    failedDetails: failedSources.map((f) => ({ source: f.source, message: f.error.message })),
    successSource,
  };
}

function logCascadeFallback(failedSources, result, latitude, longitude) {
  const failedNames = failedSources.map((f) => f.source);
  systemLogger.logSystemError({
    error: new Error(failedSources.map((f) => `${f.source}: ${f.error.message}`).join(' | ')),
    subsystem: 'weather',
    location: 'fetchWeatherCascade',
    severity: 'warning',
    context: {
      event: 'weather-cascade-fallback',
      failedSources: failedNames,
      successSource: result.source_used,
      latitude,
      longitude,
    },
  });
}

function logCascadeTotalFailure(attemptedSources, failedSources, latitude, longitude) {
  systemLogger.logSystemError({
    error: failedSources[failedSources.length - 1]?.error ?? new Error('All weather sources failed'),
    subsystem: 'weather',
    location: 'fetchWeatherCascade',
    severity: 'error',
    context: {
      event: 'weather-cascade-total-failure',
      attemptedSources,
      failedSources: failedSources.map((f) => f.source),
      latitude,
      longitude,
    },
  });
}

function finishSuccess(result, failedSources, latitude, longitude, suppressLog) {
  const cascadeMeta = buildCascadeMeta(failedSources, result.source_used);
  if (cascadeMeta && !suppressLog) {
    logCascadeFallback(failedSources, result, latitude, longitude);
  }
  if (cascadeMeta) {
    return { ...result, cascadeMeta };
  }
  return result;
}

/**
 * Каскадный запрос метеоданных: CheckWX → NOAA → OpenMeteo.
 * @throws {OfflineWeatherError}
 */
async function fetchWeatherCascade(lat, lon, options = {}) {
  const coords = parseCoordinates(lat, lon);
  if (!coords) {
    throw new Error('Некорректные координаты.');
  }

  const { latitude, longitude } = coords;
  const radiusKm = options.radiusKm ?? 20;
  const suppressLog = options.suppressLog === true;
  const timeoutMs = options.timeoutMs;
  const failedSources = [];
  const attemptedSources = [];

  if (getCheckWxApiKey()) {
    attemptedSources.push('CheckWX');
    try {
      const result = await fetchFromCheckWx(latitude, longitude, radiusKm, { timeoutMs });
      return finishSuccess(result, failedSources, latitude, longitude, suppressLog);
    } catch (error) {
      failedSources.push({ source: 'CheckWX', error });
    }
  }

  attemptedSources.push('NOAA');
  try {
    const result = await fetchFromNoaa(latitude, longitude, { timeoutMs });
    return finishSuccess(result, failedSources, latitude, longitude, suppressLog);
  } catch (error) {
    failedSources.push({ source: 'NOAA', error });
  }

  attemptedSources.push('OpenMeteo');
  try {
    const result = await fetchFromOpenMeteo(latitude, longitude, { timeoutMs });
    return finishSuccess(result, failedSources, latitude, longitude, suppressLog);
  } catch (error) {
    failedSources.push({ source: 'OpenMeteo', error });
  }

  const lastError = failedSources[failedSources.length - 1]?.error ?? null;
  if (!suppressLog) {
    logCascadeTotalFailure(attemptedSources, failedSources, latitude, longitude);
  }

  throw new OfflineWeatherError('Все погодные API недоступны. Переключитесь на ручной ввод.', {
    attemptedSources,
    lastError,
    failedSources,
  });
}

module.exports = {
  fetchWeatherCascade,
  OfflineWeatherError,
};
