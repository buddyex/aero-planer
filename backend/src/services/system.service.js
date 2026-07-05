const { get, all } = require('../db/pool');
const rbac = require('../lib/rbac');
const { MAINTENANCE_FLIGHT_HOURS_LIMIT } = require('../lib/maintenance-rules');
const systemLogger = require('../lib/system-logger');

const APP_VERSION = '1.0.0';
const SERVER_STARTED_AT = Date.now();

function assertAdmin(sessionRole) {
  if (!rbac.PERMISSIONS.syncAdmin.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  return null;
}

const AUDIT_SUBSYSTEM_LABELS = [
  'Авторизация',
  'Миссии',
  'Секторы / погода',
  'Флот / ТО',
  'АКБ',
  'Персонал',
  'Прочее',
];

const AUDIT_SUBSYSTEM_RULES = [
  { label: 'Авторизация', patterns: [/вход в систему/i, /завершение смены/i] },
  { label: 'Миссии', patterns: [/мисс/i, /предотвращен запуск/i] },
  { label: 'Секторы / погода', patterns: [/сектор/i, /метеоданн/i, /kml/i] },
  { label: 'Флот / ТО', patterns: [/борт/i, /\bто\b/i, /обслуживан/i, /дрон/i] },
  { label: 'АКБ', patterns: [/акб/i] },
  { label: 'Персонал', patterns: [/оператор/i] },
];

function classifyAuditSubsystem(actionText) {
  if (!actionText) return 'Прочее';
  for (const rule of AUDIT_SUBSYSTEM_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(actionText))) {
      return rule.label;
    }
  }
  return 'Прочее';
}

async function pingMysql() {
  try {
    await get('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  }
}

async function getHealth() {
  const mysqlOk = await pingMysql();
  return {
    ok: mysqlOk,
    api: true,
    mysql: mysqlOk,
    websocket: true,
    version: APP_VERSION,
    uptimeSec: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
  };
}

async function getSystemOverview(sessionRole) {
  const forbidden = assertAdmin(sessionRole);
  if (forbidden) return forbidden;

  const [health, kpi, hourlyActivity, auditActions, alertCounts] = await Promise.all([
    getHealth(),
    get(`
      SELECT
        (SELECT COUNT(*) FROM missions WHERE status = 'К выполнению') AS missions_planned,
        (SELECT COUNT(*) FROM missions WHERE status = 'Выполняется') AS missions_active,
        (SELECT COUNT(*) FROM missions WHERE status = 'Ожидает утверждения') AS missions_pending_approval,
        (SELECT COUNT(*) FROM missions WHERE status = 'Завершено') AS missions_completed,
        (SELECT COUNT(*) FROM drones WHERE status = 'Готов') AS drones_ready,
        (SELECT COUNT(*) FROM drones WHERE status = 'В полете') AS drones_in_air,
        (SELECT COUNT(*) FROM drones WHERE status IN ('На ТО', 'Ремонт', 'Диагностика')) AS drones_maintenance,
        (SELECT COUNT(*) FROM operators) AS operators_total,
        (SELECT COUNT(*) FROM audit_logs WHERE timestamp >= NOW() - INTERVAL 24 HOUR) AS audit_logs_24h
    `),
    all(`
      SELECT DATE_FORMAT(timestamp, '%H') AS hour, COUNT(*) AS count
      FROM audit_logs
      WHERE timestamp >= NOW() - INTERVAL 24 HOUR
      GROUP BY DATE_FORMAT(timestamp, '%H')
      ORDER BY hour
    `),
    all(`
      SELECT action_text FROM audit_logs
      WHERE timestamp >= NOW() - INTERVAL 7 DAY
      ORDER BY timestamp DESC
      LIMIT 500
    `),
    get(`
      SELECT
        (SELECT COUNT(*) FROM missions WHERE status = 'Ожидает утверждения') AS pending_approval,
        (SELECT COUNT(*) FROM sectors WHERE risk_level = 'Высокий' AND is_active = 1) AS high_risk_sectors,
        (SELECT COUNT(*) FROM batteries WHERE status = 'Требуется проверка') AS batteries_inspection,
        (SELECT COUNT(*) FROM drones WHERE flight_hours > ?) AS drones_overdue,
        (
          SELECT COUNT(*) FROM sectors s
          WHERE s.is_active = 1
            AND NOT EXISTS (
              SELECT 1 FROM weather_logs wl
              WHERE wl.sector_id = s.id
                AND wl.timestamp >= NOW() - INTERVAL 30 MINUTE
            )
        ) AS stale_weather_sectors
    `, [MAINTENANCE_FLIGHT_HOURS_LIMIT]),
  ]);

  const subsystemMap = new Map(AUDIT_SUBSYSTEM_LABELS.map((label) => [label, 0]));
  for (const row of auditActions) {
    const subsystem = classifyAuditSubsystem(row.action_text);
    subsystemMap.set(subsystem, (subsystemMap.get(subsystem) || 0) + 1);
  }
  const subsystemActivity = AUDIT_SUBSYSTEM_LABELS
    .map((subsystem) => ({ subsystem, count: subsystemMap.get(subsystem) ?? 0 }))
    .filter((row) => row.count > 0);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const hourMap = new Map(hourlyActivity.map((r) => [r.hour, Number(r.count)]));
  const hourlyChart = hours.map((hour) => ({ hour, count: hourMap.get(hour) ?? 0 }));

  const criticalErrors24h = systemLogger
    .readErrorLogs({ sinceHours: 24, limit: 10_000, severity: 'critical' })
    .length;
  const alerts = [];

  if (criticalErrors24h > 0) {
    alerts.push({
      id: 'critical_errors',
      severity: 'critical',
      title: 'Критические ошибки за 24 ч',
      detail: 'Зафиксированы критические системные ошибки. Проверьте журнал ошибок.',
      count: criticalErrors24h,
    });
  }
  if (alertCounts.pending_approval > 0) {
    alerts.push({
      id: 'missions_pending',
      severity: 'warning',
      title: 'Миссии ожидают утверждения',
      detail: 'Есть миссии в статусе «Ожидает утверждения».',
      count: alertCounts.pending_approval,
    });
  }
  if (alertCounts.high_risk_sectors > 0) {
    alerts.push({
      id: 'high_risk_sectors',
      severity: 'warning',
      title: 'Секторы с высоким риском',
      detail: 'Активные секторы с уровнем риска «Высокий».',
      count: alertCounts.high_risk_sectors,
    });
  }
  if (alertCounts.batteries_inspection > 0) {
    alerts.push({
      id: 'batteries_inspection',
      severity: 'warning',
      title: 'АКБ требуют проверки',
      detail: 'Батареи со статусом «Требуется проверка».',
      count: alertCounts.batteries_inspection,
    });
  }
  if (alertCounts.drones_overdue > 0) {
    alerts.push({
      id: 'drones_overdue',
      severity: 'warning',
      title: 'Дроны с превышением налёта',
      detail: `Дроны с налётом более ${MAINTENANCE_FLIGHT_HOURS_LIMIT} ч.`,
      count: alertCounts.drones_overdue,
    });
  }
  if (alertCounts.stale_weather_sectors > 0) {
    alerts.push({
      id: 'stale_weather',
      severity: 'warning',
      title: 'Устаревшие метеоданные',
      detail: 'Секторы без обновления погоды более 30 минут.',
      count: alertCounts.stale_weather_sectors,
    });
  }

  return {
    ok: true,
    data: {
      health,
      kpi: {
        missions_planned: kpi.missions_planned ?? 0,
        missions_active: kpi.missions_active ?? 0,
        missions_pending_approval: kpi.missions_pending_approval ?? 0,
        missions_completed: kpi.missions_completed ?? 0,
        drones_ready: kpi.drones_ready ?? 0,
        drones_in_air: kpi.drones_in_air ?? 0,
        drones_maintenance: kpi.drones_maintenance ?? 0,
        operators_total: kpi.operators_total ?? 0,
        audit_logs_24h: kpi.audit_logs_24h ?? 0,
      },
      alerts,
      charts: {
        hourlyActivity: hourlyChart,
        subsystemActivity,
      },
    },
  };
}

async function getAuditLogsPage(sessionRole, filters = {}) {
  const forbidden = assertAdmin(sessionRole);
  if (forbidden) return forbidden;

  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
  const conditions = [];
  const params = [];

  if (filters.since) {
    conditions.push('al.timestamp >= ?');
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push('al.timestamp <= ?');
    params.push(filters.until);
  }
  if (filters.operatorId) {
    conditions.push('al.operator_id = ?');
    params.push(parseInt(filters.operatorId, 10));
  }
  if (filters.search) {
    conditions.push('al.action_text LIKE ?');
    params.push(`%${String(filters.search).trim()}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = await get(
    `SELECT COUNT(*) AS cnt FROM audit_logs al ${where}`,
    params,
  );

  const rows = await all(
    `SELECT al.id, al.operator_id, al.action_text, al.timestamp, o.full_name AS operator_name
     FROM audit_logs al
     LEFT JOIN operators o ON o.id = al.operator_id
     ${where}
     ORDER BY al.timestamp DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    ok: true,
    data: {
      rows,
      total: totalRow?.cnt ?? 0,
      limit,
      offset,
    },
  };
}

async function getIntegrityReport(sessionRole) {
  const forbidden = assertAdmin(sessionRole);
  if (forbidden) return forbidden;

  const [
    syncQueue,
    pendingMissions,
    batteries,
    drones,
    staleWeather,
    highRisk,
  ] = await Promise.all([
    all(`
      SELECT record_id, target_table, operation, synced, created_at
      FROM sync_queue WHERE synced = 0
      ORDER BY created_at DESC LIMIT 20
    `),
    all(`
      SELECT m.id, m.start_time, o.full_name AS operator_name, s.sector_name
      FROM missions m
      LEFT JOIN operators o ON o.id = m.operator_id
      LEFT JOIN sectors s ON s.id = m.sector_id
      WHERE m.status = 'Ожидает утверждения'
      ORDER BY m.start_time ASC LIMIT 5
    `),
    all(`
      SELECT id, serial_number, cycle_count, status
      FROM batteries WHERE status = 'Требуется проверка'
      ORDER BY cycle_count DESC LIMIT 20
    `),
    all(`
      SELECT id, name, serial_number, flight_hours, status
      FROM drones WHERE flight_hours > ?
      ORDER BY flight_hours DESC LIMIT 20
    `, [MAINTENANCE_FLIGHT_HOURS_LIMIT]),
    all(`
      SELECT s.id, s.sector_name, s.risk_level,
        (SELECT MAX(wl.timestamp) FROM weather_logs wl WHERE wl.sector_id = s.id) AS last_weather
      FROM sectors s
      WHERE s.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM weather_logs wl
          WHERE wl.sector_id = s.id AND wl.timestamp >= NOW() - INTERVAL 30 MINUTE
        )
      ORDER BY s.sector_name LIMIT 20
    `),
    all(`
      SELECT id, sector_name, risk_level
      FROM sectors WHERE risk_level = 'Высокий' AND is_active = 1
      ORDER BY sector_name LIMIT 20
    `),
  ]);

  const checks = [
    {
      id: 'sync_queue_stale',
      category: 'legacy',
      severity: syncQueue.length > 0 ? 'warning' : 'ok',
      title: 'Очередь sync_queue (legacy)',
      count: syncQueue.length,
      detail: 'Необработанные записи очереди синхронизации из legacy-архитектуры.',
      items: syncQueue.map((r) => ({
        id: r.record_id,
        label: `${r.target_table} · ${r.operation}`,
        meta: r.created_at,
      })),
    },
    {
      id: 'missions_pending_approval',
      category: 'missions',
      severity: pendingMissions.length > 0 ? 'warning' : 'ok',
      title: 'Миссии без утверждения',
      count: pendingMissions.length,
      detail: 'Миссии в статусе «Ожидает утверждения».',
      items: pendingMissions.map((m) => ({
        id: m.id,
        label: `${m.sector_name ?? '—'} · ${m.operator_name ?? '—'}`,
        meta: m.start_time,
      })),
    },
    {
      id: 'batteries_inspection_due',
      category: 'fleet',
      severity: batteries.length > 0 ? 'warning' : 'ok',
      title: 'АКБ требуют проверки',
      count: batteries.length,
      detail: 'Батареи со статусом «Требуется проверка».',
      items: batteries.map((b) => ({
        id: b.id,
        label: `${b.serial_number} · ${b.cycle_count} циклов`,
        meta: b.status,
      })),
    },
    {
      id: 'drones_overdue_maintenance',
      category: 'fleet',
      severity: drones.length > 0 ? 'warning' : 'ok',
      title: 'Превышение налёта',
      count: drones.length,
      detail: `Дроны с налётом более ${MAINTENANCE_FLIGHT_HOURS_LIMIT} ч.`,
      items: drones.map((d) => ({
        id: String(d.id),
        label: `${d.name} (${d.serial_number})`,
        meta: `${d.flight_hours} ч · ${d.status}`,
      })),
    },
    {
      id: 'sectors_stale_weather',
      category: 'weather',
      severity: staleWeather.length > 0 ? 'warning' : 'ok',
      title: 'Устаревшие метеоданные',
      count: staleWeather.length,
      detail: 'Секторы без свежих weather_logs (> 30 мин).',
      items: staleWeather.map((s) => ({
        id: String(s.id),
        label: s.sector_name,
        meta: s.last_weather ?? 'нет данных',
      })),
    },
    {
      id: 'high_risk_sectors_active',
      category: 'weather',
      severity: highRisk.length > 0 ? 'warning' : 'ok',
      title: 'Активные секторы высокого риска',
      count: highRisk.length,
      detail: 'Секторы с risk_level = «Высокий».',
      items: highRisk.map((s) => ({
        id: String(s.id),
        label: s.sector_name,
        meta: s.risk_level,
      })),
    },
  ];

  return { ok: true, data: { checks } };
}

function getSystemErrorLogs(sessionRole, filters = {}) {
  const forbidden = assertAdmin(sessionRole);
  if (forbidden) return forbidden;
  const logs = systemLogger.readErrorLogs(filters);
  return { ok: true, data: logs };
}

function getSystemErrorStats(sessionRole, filters = {}) {
  const forbidden = assertAdmin(sessionRole);
  if (forbidden) return forbidden;
  const days = filters.days ?? 30;
  const logs = systemLogger.readErrorLogs({ days, limit: 10_000 });
  const stats = systemLogger.getErrorStats(logs);
  stats.recent24h = systemLogger.getRecentErrorCount(24);
  return { ok: true, data: stats };
}

function reportRendererError(sessionRole, operatorId, payload = {}) {
  if (!sessionRole || !operatorId) {
    return { ok: false, error: 'UNAUTHORIZED' };
  }

  const message = payload.message || payload.error || 'Unknown renderer error';
  const entry = systemLogger.logSystemError({
    subsystem: 'renderer',
    location: payload.location || payload.url || 'renderer',
    error: new Error(message),
    phase: payload.phase || 'runtime',
    severity: payload.severity,
    context: {
      event: payload.type === 'unhandledrejection' ? 'renderer-unhandledrejection' : 'renderer-error',
      operatorId,
      role: sessionRole,
      componentStack: payload.componentStack,
      url: payload.url,
    },
  });

  if (payload.stack && entry) {
    entry.stack = payload.stack;
  }

  return { ok: true, data: { id: entry.id } };
}

module.exports = {
  getHealth,
  getSystemOverview,
  getAuditLogsPage,
  getIntegrityReport,
  getSystemErrorLogs,
  getSystemErrorStats,
  reportRendererError,
  classifyAuditSubsystem,
};
