const { getCheckWxApiKey } = require('./weather-config');
const { fetchFromCheckWx } = require('./weather-providers/checkwx-provider');
const { fetchFromNoaa } = require('./weather-providers/noaa-provider');
const { fetchFromOpenMeteo } = require('./weather-providers/openmeteo-provider');
const systemLogger = require('./system-logger');

const SOURCE_ERROR_KEYS = {
  CheckWX: 'checkwx',
  NOAA: 'noaa',
  OpenMeteo: 'openMeteo',
};

const CHECKWX_MISSING_KEY_MESSAGE = '401 Unauthorized (Missing API Key)';

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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

function formatProviderErrorMessage(error) {
  if (!error) return 'Unknown error';
  const status = error.status ?? error.response?.status;
  const message = error.message || String(error);
  if (status != null && !message.includes(String(status))) {
    return `${status} ${message}`;
  }
  return message;
}

/**
 * Maps cascade failedSources to API error keys: checkwx / noaa / openMeteo.
 */
function formatProviderErrors(failedSources = []) {
  const errors = {};
  for (const entry of failedSources) {
    const key = SOURCE_ERROR_KEYS[entry.source] || String(entry.source).toLowerCase();
    errors[key] = formatProviderErrorMessage(entry.error);
  }
  return errors;
}

function normalizeCascadeResult(result) {
  return {
    ...result,
    temperature: result.temperature ?? result.temp,
    precipitation: result.precipitation ?? result.conditions,
  };
}

function buildCascadeMeta(failedSources, successSource) {
  if (failedSources.length === 0) return null;
  return {
    failedSources: failedSources.map((f) => f.source),
    failedDetails: failedSources.map((f) => ({
      source: f.source,
      message: formatProviderErrorMessage(f.error),
    })),
    successSource,
  };
}

function logCascadeFallback(failedSources, result, latitude, longitude) {
  const failedNames = failedSources.map((f) => f.source);
  systemLogger.logSystemError({
    error: new Error(failedSources.map((f) => `${f.source}: ${formatProviderErrorMessage(f.error)}`).join(' | ')),
    subsystem: 'weather',
    location: 'fetchWeatherCascade',
    severity: 'warning',
    context: {
      event: 'weather-cascade-fallback',
      failedSources: failedNames,
      failedDetails: failedSources.map((f) => ({
        source: f.source,
        message: formatProviderErrorMessage(f.error),
      })),
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
      failedDetails: failedSources.map((f) => ({
        source: f.source,
        message: formatProviderErrorMessage(f.error),
      })),
      latitude,
      longitude,
    },
  });
}

function finishSuccess(result, failedSources, latitude, longitude, suppressLog) {
  const normalized = normalizeCascadeResult(result);
  const cascadeMeta = buildCascadeMeta(failedSources, normalized.source_used);
  if (cascadeMeta && !suppressLog) {
    logCascadeFallback(failedSources, normalized, latitude, longitude);
  }
  if (cascadeMeta) {
    return { ...normalized, cascadeMeta };
  }
  return normalized;
}

/**
 * Каскадный запрос метеоданных: CheckWX → NOAA → OpenMeteo.
 * @throws {OfflineWeatherError}
 */
async function fetchWeatherCascade(lat, lon, options = {}) {
  const coords = parseCoordinates(lat, lon);
  if (!coords) {
    throw new OfflineWeatherError('Некорректные координаты.', {
      attemptedSources: [],
      failedSources: [
        { source: 'OpenMeteo', error: new Error('Invalid coordinates') },
      ],
      lastError: new Error('Invalid coordinates'),
    });
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
  } else {
    attemptedSources.push('CheckWX');
    failedSources.push({
      source: 'CheckWX',
      error: new Error(CHECKWX_MISSING_KEY_MESSAGE),
    });
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
  formatProviderErrors,
  CHECKWX_MISSING_KEY_MESSAGE,
};
