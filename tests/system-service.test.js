const systemService = require('../backend/src/services/system.service');

jest.mock('../backend/src/db/pool', () => ({
  get: jest.fn(),
  all: jest.fn(),
}));

jest.mock('../backend/src/lib/system-logger', () => ({
  readErrorLogs: jest.fn(() => []),
  getErrorStats: jest.fn(() => ({
    total: 0,
    todayCount: 0,
    criticalCount: 0,
    lastTimestamp: null,
    bySubsystem: {},
    bySeverity: { critical: 0, error: 0, warning: 0 },
    byDay: [],
    topLocations: [],
  })),
  getRecentErrorCount: jest.fn(() => 0),
  logSystemError: jest.fn(() => ({ id: 'test-id' })),
}));

const pool = require('../backend/src/db/pool');

describe('system.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getSystemOverview запрещён не-админу', async () => {
    const result = await systemService.getSystemOverview('Оператор');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('FORBIDDEN');
  });

  test('getIntegrityReport возвращает checks', async () => {
    pool.all.mockImplementation(async (sql) => {
      if (sql.includes('sync_queue')) return [];
      if (sql.includes('Ожидает утверждения')) return [];
      if (sql.includes('batteries')) return [];
      if (sql.includes('flight_hours')) return [];
      if (sql.includes('weather_logs')) return [];
      if (sql.includes('risk_level')) return [];
      return [];
    });

    const result = await systemService.getIntegrityReport('Администратор');
    expect(result.ok).toBe(true);
    expect(result.data.checks).toHaveLength(6);
    expect(result.data.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'sync_queue_stale',
        'missions_pending_approval',
        'batteries_inspection_due',
        'drones_overdue_maintenance',
        'sectors_stale_weather',
        'high_risk_sectors_active',
      ]),
    );
  });

  test('classifyAuditSubsystem группирует события по подсистемам', () => {
    expect(systemService.classifyAuditSubsystem('Вход в систему: Admin')).toBe('Авторизация');
    expect(systemService.classifyAuditSubsystem('Создана миссия «1» (ID abc)')).toBe('Миссии');
    expect(systemService.classifyAuditSubsystem('Ручной ввод метеоданных для сектора ID 2')).toBe('Секторы / погода');
    expect(systemService.classifyAuditSubsystem('Добавлен борт DR-001')).toBe('Флот / ТО');
    expect(systemService.classifyAuditSubsystem('Добавлена АКБ BAT-1')).toBe('АКБ');
    expect(systemService.classifyAuditSubsystem('Создан оператор Иванов')).toBe('Персонал');
    expect(systemService.classifyAuditSubsystem('')).toBe('Прочее');
  });

  test('getAuditLogsPage возвращает rows и total', async () => {
    pool.get.mockResolvedValueOnce({ cnt: 1 });
    pool.all.mockResolvedValueOnce([
      {
        id: 'abc',
        operator_id: 1,
        action_text: 'Тест',
        timestamp: '2026-01-01T00:00:00.000Z',
        operator_name: 'Admin',
      },
    ]);

    const result = await systemService.getAuditLogsPage('Администратор', { limit: 10, offset: 0 });
    expect(result.ok).toBe(true);
    expect(result.data.total).toBe(1);
    expect(result.data.rows).toHaveLength(1);
  });

  test('reportRendererError доступен авторизованному пользователю', async () => {
    const result = await systemService.reportRendererError('Оператор', 2, {
      message: 'Test error',
      type: 'error',
    });
    expect(result.ok).toBe(true);
    expect(result.data.id).toBe('test-id');
  });
});
