jest.mock('../backend/src/lib/weather-http-client', () => ({
  weatherHttpGet: jest.fn(),
  CASCADE_TIMEOUT_MS: 3000,
}));

jest.mock('../backend/src/lib/system-logger', () => ({
  logSystemError: jest.fn(),
}));

const { weatherHttpGet } = require('../backend/src/lib/weather-http-client');
const systemLogger = require('../backend/src/lib/system-logger');
const {
  fetchWeatherCascade,
  OfflineWeatherError,
} = require('../backend/src/lib/weather-cascade-service');

const LAT = 56.85;
const LON = 53.22;
const RADIUS_KM = 20;

const CHECKWX_URL_RE = /api\.checkwx\.com\/v2\/metar\/lat/;
const NOAA_URL_RE = /aviationweather\.gov\/api\/data\/metar/;
const OPENMETEO_URL_RE = /api\.open-meteo\.com\/v1\/forecast/;

const checkWxPayload = {
  results: 1,
  data: [{
    icao: 'USII',
    raw_text: 'METAR USII 031200Z 27008KT 9999 FEW030 M02/M08 Q1018',
    observed: '2026-07-03T12:00:00Z',
    temperature: { celsius: -2 },
    wind: { speed: { mps: 4.1, kts: 8 } },
    flight_category: 'VFR',
  }],
};

const noaaPayload = {
  data: [{
    icaoId: 'USII',
    rawOb: 'METAR USII 031200Z 27008KT 9999 FEW030 M02/M08 Q1018',
    temp: -2,
    wspd: 8,
    wxString: null,
  }],
};

const openMeteoPayload = {
  current: {
    temperature_2m: -2,
    wind_speed_10m: 4.1,
    precipitation: 0,
    weather_code: 0,
  },
};

function mockHttpByUrl(handlers) {
  weatherHttpGet.mockImplementation((url) => {
    if (CHECKWX_URL_RE.test(url)) return handlers.checkwx();
    if (NOAA_URL_RE.test(url)) return handlers.noaa();
    if (OPENMETEO_URL_RE.test(url)) return handlers.openmeteo();
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function countCallsByPattern(pattern) {
  return weatherHttpGet.mock.calls.filter(([url]) => pattern.test(url)).length;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CHECKWX_API_KEY = 'test-key';
});

describe('WeatherCascadeService: каскадный fallback', () => {
  test('1: CheckWX 200 OK → source_used CheckWX, остальные API не вызываются', async () => {
    mockHttpByUrl({
      checkwx: () => Promise.resolve(checkWxPayload),
      noaa: () => Promise.reject(new Error('NOAA should not be called')),
      openmeteo: () => Promise.reject(new Error('OpenMeteo should not be called')),
    });

    const result = await fetchWeatherCascade(LAT, LON, { radiusKm: RADIUS_KM });

    expect(result.source_used).toBe('CheckWX');
    expect(result.temp).toBe(-2);
    expect(result.wind_speed).toBeCloseTo(4.1, 1);
    expect(result.raw_metar).toContain('METAR USII');
    expect(result.station_icao).toBe('USII');
    expect(result.coordinates).toEqual({ lat: LAT, lon: LON });

    expect(countCallsByPattern(CHECKWX_URL_RE)).toBe(1);
    expect(countCallsByPattern(NOAA_URL_RE)).toBe(0);
    expect(countCallsByPattern(OPENMETEO_URL_RE)).toBe(0);
    expect(systemLogger.logSystemError).not.toHaveBeenCalled();
  });

  test('2: CheckWX 500, NOAA 200 OK → source_used NOAA', async () => {
    mockHttpByUrl({
      checkwx: () => Promise.reject(
        Object.assign(new Error('CheckWX HTTP 500'), { status: 500 }),
      ),
      noaa: () => Promise.resolve(noaaPayload),
      openmeteo: () => Promise.reject(new Error('OpenMeteo should not be called')),
    });

    const result = await fetchWeatherCascade(LAT, LON, { radiusKm: RADIUS_KM });

    expect(result.source_used).toBe('NOAA');
    expect(result.temp).toBe(-2);
    expect(result.wind_speed).toBeCloseTo(8 / 1.94384, 1);
    expect(result.raw_metar).toContain('METAR USII');

    expect(countCallsByPattern(CHECKWX_URL_RE)).toBe(1);
    expect(countCallsByPattern(NOAA_URL_RE)).toBe(1);
    expect(countCallsByPattern(OPENMETEO_URL_RE)).toBe(0);

    expect(systemLogger.logSystemError).toHaveBeenCalledTimes(1);
    expect(systemLogger.logSystemError.mock.calls[0][0]).toMatchObject({
      subsystem: 'weather',
      severity: 'warning',
      context: {
        event: 'weather-cascade-fallback',
        failedSources: ['CheckWX'],
        successSource: 'NOAA',
      },
    });
  });

  test('3: CheckWX и NOAA падают, OpenMeteo 200 OK → source_used OpenMeteo', async () => {
    mockHttpByUrl({
      checkwx: () => Promise.reject(new Error('CheckWX down')),
      noaa: () => Promise.reject(new Error('NOAA down')),
      openmeteo: () => Promise.resolve(openMeteoPayload),
    });

    const result = await fetchWeatherCascade(LAT, LON, { radiusKm: RADIUS_KM });

    expect(result.source_used).toBe('OpenMeteo');
    expect(result.temp).toBe(-2);
    expect(result.wind_speed).toBeCloseTo(4.1, 1);
    expect(result.conditions).toBe('Ясно');
    expect(result.raw_metar).toBeNull();

    expect(countCallsByPattern(CHECKWX_URL_RE)).toBe(1);
    expect(countCallsByPattern(NOAA_URL_RE)).toBe(1);
    expect(countCallsByPattern(OPENMETEO_URL_RE)).toBe(1);

    expect(systemLogger.logSystemError).toHaveBeenCalledTimes(1);
    expect(systemLogger.logSystemError.mock.calls[0][0]).toMatchObject({
      subsystem: 'weather',
      severity: 'warning',
      context: {
        event: 'weather-cascade-fallback',
        failedSources: ['CheckWX', 'NOAA'],
        successSource: 'OpenMeteo',
      },
    });
  });

  test('4: все API недоступны → OfflineWeatherError', async () => {
    const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND'), {
      code: 'ENOTFOUND',
    });

    mockHttpByUrl({
      checkwx: () => Promise.reject(networkError),
      noaa: () => Promise.reject(networkError),
      openmeteo: () => Promise.reject(networkError),
    });

    await expect(fetchWeatherCascade(LAT, LON, { radiusKm: RADIUS_KM }))
      .rejects
      .toThrow(OfflineWeatherError);

    try {
      await fetchWeatherCascade(LAT, LON, { radiusKm: RADIUS_KM });
    } catch (err) {
      expect(err).toBeInstanceOf(OfflineWeatherError);
      expect(err.code).toBe('OFFLINE_WEATHER');
      expect(err.attemptedSources).toEqual(['CheckWX', 'NOAA', 'OpenMeteo']);
      expect(err.message).toMatch(/недоступн/i);
    }

    expect(systemLogger.logSystemError).toHaveBeenCalled();
    const totalFailureCall = systemLogger.logSystemError.mock.calls.find(
      ([payload]) => payload.context?.event === 'weather-cascade-total-failure',
    );
    expect(totalFailureCall).toBeTruthy();
    expect(totalFailureCall[0]).toMatchObject({
      subsystem: 'weather',
      severity: 'error',
    });

    expect(countCallsByPattern(CHECKWX_URL_RE)).toBeGreaterThanOrEqual(1);
    expect(countCallsByPattern(NOAA_URL_RE)).toBeGreaterThanOrEqual(1);
    expect(countCallsByPattern(OPENMETEO_URL_RE)).toBeGreaterThanOrEqual(1);
  });

  test('5: suppressLog не пишет в журнал при fallback', async () => {
    mockHttpByUrl({
      checkwx: () => Promise.reject(new Error('CheckWX down')),
      noaa: () => Promise.reject(new Error('NOAA down')),
      openmeteo: () => Promise.resolve(openMeteoPayload),
    });

    await fetchWeatherCascade(LAT, LON, { radiusKm: RADIUS_KM, suppressLog: true });

    expect(systemLogger.logSystemError).not.toHaveBeenCalled();
  });
});
