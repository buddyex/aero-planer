const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveErrorMessage,
  extractMessage,
} = require('../backend/src/lib/error-catalog');
const systemLogger = require('../backend/src/lib/system-logger');

describe('error-catalog', () => {
  test('ER_* MySQL → понятное русское сообщение', () => {
    const err = new Error('Duplicate entry');
    err.code = 'ER_DUP_ENTRY';
    const result = resolveErrorMessage({
      error: err,
      subsystem: 'mysql',
      location: 'createMission',
    });
    expect(result.messageRu).toMatch(/MySQL/i);
    expect(result.severity).toBe('error');
  });

  test('fallback для неизвестной ошибки', () => {
    const result = resolveErrorMessage({
      error: new Error('something weird'),
      subsystem: 'api',
      location: 'test',
    });
    expect(result.messageRu).toMatch(/API/);
  });

  test('extractMessage из строки', () => {
    expect(extractMessage('plain text')).toBe('plain text');
  });

  test('weather-cascade-fallback → сообщение о резервном OpenMeteo', () => {
    const result = resolveErrorMessage({
      error: new Error('CheckWX: down | NOAA: down'),
      subsystem: 'weather',
      location: 'fetchWeatherCascade',
      context: {
        event: 'weather-cascade-fallback',
        failedSources: ['CheckWX', 'NOAA'],
        successSource: 'OpenMeteo',
      },
    });
    expect(result.messageRu).toMatch(/CheckWX, NOAA/);
    expect(result.messageRu).toMatch(/OpenMeteo/);
    expect(result.severity).toBe('warning');
  });

  test('weather-sync-summary → сводка по секторам', () => {
    const result = resolveErrorMessage({
      error: new Error('CheckWX: 8/8'),
      subsystem: 'weather',
      location: 'syncAllSectorsWeather',
      context: {
        event: 'weather-sync-summary',
        sectorsTotal: 8,
        openMeteoUsed: 8,
      },
    });
    expect(result.messageRu).toMatch(/8 секторам/);
    expect(result.messageRu).toMatch(/OpenMeteo/);
    expect(result.severity).toBe('warning');
  });
});

describe('system-logger', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aero-logs-'));
    systemLogger.setLogsDir(tempDir);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('logSystemError записывает JSONL и readErrorLogs читает', () => {
    const entry = systemLogger.logSystemError({
      subsystem: 'mysql',
      location: 'query',
      error: Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
      phase: 'runtime',
      severity: 'error',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.messageRu).toMatch(/MySQL/i);

    const logs = systemLogger.readErrorLogs({ days: 1, limit: 10 });
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(entry.id);
  });

  test('getErrorStats агрегирует по подсистемам и серьёзности', () => {
    systemLogger.logSystemError({
      subsystem: 'api',
      location: 'fetchWeather',
      error: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      phase: 'runtime',
      severity: 'warning',
    });
    systemLogger.logSystemError({
      subsystem: 'mysql',
      location: 'createMission',
      error: Object.assign(new Error('constraint'), { code: 'ER_NO_REFERENCED_ROW_2' }),
      phase: 'runtime',
    });

    const logs = systemLogger.readErrorLogs({ days: 1 });
    const stats = systemLogger.getErrorStats(logs);

    expect(stats.total).toBe(2);
    expect(stats.bySubsystem.api).toBe(1);
    expect(stats.bySubsystem.mysql).toBe(1);
    expect(stats.bySeverity.warning).toBe(1);
    expect(stats.topLocations.length).toBeGreaterThan(0);
    expect(stats.byDay).toHaveLength(7);
  });

  test('фильтр по severity', () => {
    systemLogger.logSystemError({
      subsystem: 'renderer',
      location: 'test',
      error: new Error('critical fail'),
      severity: 'critical',
    });
    systemLogger.logSystemError({
      subsystem: 'renderer',
      location: 'test2',
      error: new Error('warn'),
      severity: 'warning',
    });

    const criticalOnly = systemLogger.readErrorLogs({ days: 1, severity: 'critical' });
    expect(criticalOnly).toHaveLength(1);
    expect(criticalOnly[0].severity).toBe('critical');
  });
});
