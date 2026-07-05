const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');
const { createPinCredentials } = require('../lib/pin-auth');
const { logAction } = require('./audit.service');

async function getAllOperators(sessionRole) {
  if (!rbac.PERMISSIONS.listOperators.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const rows = await all(
    'SELECT id, full_name, login, role, duty_status FROM operators ORDER BY full_name',
  );
  return { ok: true, data: rows };
}

async function createOperator(sessionOperatorId, sessionRole, payload) {
  if (!rbac.PERMISSIONS.manageOperators.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  const creds = createPinCredentials(payload.pin);
  try {
    const result = await run(
      `INSERT INTO operators (full_name, login, pin_code, pin_hash, pin_salt, role)
       VALUES (?, ?, '', ?, ?, ?)`,
      [payload.full_name, payload.login, creds.pin_hash, creds.pin_salt, payload.role],
    );
    const row = await get(
      'SELECT id, full_name, login, role, duty_status FROM operators WHERE id = ?',
      [result.insertId],
    );
    await logAction(sessionOperatorId, `Создан оператор ${row.full_name}`);
    return { ok: true, data: row };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'Логин уже занят.' };
    }
    return { ok: false, error: error.message };
  }
}

async function updateOperator(sessionOperatorId, sessionRole, operatorId, payload) {
  if (!rbac.PERMISSIONS.manageOperators.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  if (payload.pin) {
    const creds = createPinCredentials(payload.pin);
    await run(
      'UPDATE operators SET full_name=?, login=?, role=?, pin_hash=?, pin_salt=?, pin_code=? WHERE id=?',
      [payload.full_name, payload.login, payload.role, creds.pin_hash, creds.pin_salt, '', operatorId],
    );
  } else {
    await run(
      'UPDATE operators SET full_name=?, login=?, role=? WHERE id=?',
      [payload.full_name, payload.login, payload.role, operatorId],
    );
  }
  const row = await get(
    'SELECT id, full_name, login, role, duty_status FROM operators WHERE id = ?',
    [operatorId],
  );
  await logAction(sessionOperatorId, `Обновлён оператор ${row.full_name}`);
  return { ok: true, data: row };
}

async function deleteOperator(sessionOperatorId, sessionRole, operatorId) {
  if (!rbac.PERMISSIONS.manageOperators.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  if (operatorId === sessionOperatorId) {
    return { ok: false, error: 'Нельзя удалить собственную учётную запись.' };
  }
  const row = await get('SELECT full_name FROM operators WHERE id = ?', [operatorId]);
  if (!row) return { ok: false, error: 'Оператор не найден.' };
  try {
    await run('DELETE FROM operators WHERE id = ?', [operatorId]);
    await logAction(sessionOperatorId, `Удалён оператор ${row.full_name}`);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Невозможно удалить: есть связанные записи.' };
  }
}

function normalizeKpiRow(row) {
  if (!row) return {};
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value) || 0]),
  );
}

async function fetchOperationalOverview() {
  return get(`
    SELECT
      (SELECT COUNT(*) FROM missions WHERE status = 'К выполнению') AS planned_missions,
      (SELECT COUNT(*) FROM missions WHERE status = 'Выполняется') AS active_missions,
      (SELECT COUNT(*) FROM missions WHERE status = 'Завершено') AS completed_missions,
      (SELECT COUNT(*) FROM drones WHERE status = 'Готов') AS drones_ready,
      (SELECT COUNT(*) FROM drones WHERE status = 'В полете') AS drones_in_air,
      (SELECT COUNT(*) FROM drones WHERE status = 'Запланирован') AS drones_planned,
      (SELECT COUNT(*) FROM drones WHERE status = 'На ТО') AS drones_on_maintenance,
      (SELECT COUNT(*) FROM drones WHERE status = 'Ремонт') AS drones_in_repair,
      (SELECT COUNT(*) FROM drones WHERE status = 'Диагностика') AS drones_in_diagnostics,
      (SELECT COUNT(*) FROM sectors WHERE risk_level = 'Высокий' AND is_active = 1) AS high_risk_sectors,
      (SELECT COUNT(*) FROM operators WHERE role = 'Оператор' AND duty_status = 'В миссии') AS operators_in_mission
  `);
}

async function fetchPilotKPIs(operatorId) {
  return get(
    `SELECT
      (SELECT COUNT(*) FROM missions WHERE operator_id = ? AND status = 'К выполнению') AS planned_missions,
      (SELECT COUNT(*) FROM missions WHERE operator_id = ? AND status = 'Выполняется') AS active_missions,
      (SELECT COUNT(*) FROM missions WHERE operator_id = ? AND status = 'Завершено') AS completed_missions,
      (SELECT COUNT(*) FROM audit_logs WHERE operator_id = ?) AS total_actions`,
    [operatorId, operatorId, operatorId, operatorId],
  );
}

async function fetchTechnicianKPIs(operatorId) {
  return get(
    `SELECT
      (SELECT COUNT(*) FROM maintenance_logs WHERE operator_id = ?) AS maintenance_records,
      (SELECT COUNT(*) FROM maintenance_logs WHERE operator_id = ? AND closed_at IS NULL) AS open_maintenance_sessions,
      (SELECT COUNT(*) FROM battery_inspection_logs WHERE operator_id = ?) AS battery_inspections,
      (SELECT COUNT(*) FROM batteries WHERE status = 'Требуется проверка') AS batteries_pending_inspection`,
    [operatorId, operatorId, operatorId],
  );
}

async function buildOperatorKpis(operatorId, role) {
  if (role === 'Техник') {
    return normalizeKpiRow(await fetchTechnicianKPIs(operatorId));
  }
  if (role === 'Руководитель' || role === 'Администратор') {
    return normalizeKpiRow(await fetchOperationalOverview());
  }
  return normalizeKpiRow(await fetchPilotKPIs(operatorId));
}

async function getOperatorProfile(sessionOperatorId, targetOperatorId) {
  const operatorId = targetOperatorId ?? sessionOperatorId;
  const row = await get(
    'SELECT id, full_name, login, role, duty_status FROM operators WHERE id = ?',
    [operatorId],
  );
  if (!row) return { ok: false, error: 'Оператор не найден.' };

  const kpis = await buildOperatorKpis(operatorId, row.role);
  return { ok: true, data: { ...row, kpis } };
}

async function getOperatorKPIs(sessionOperatorId) {
  const op = await get('SELECT id, role FROM operators WHERE id = ?', [sessionOperatorId]);
  if (!op) return { ok: false, error: 'NOT_FOUND' };

  const kpis = await buildOperatorKpis(sessionOperatorId, op.role);
  return { ok: true, data: kpis };
}

async function getAuditLogs(sessionRole, limit = 50, sinceTimestamp = null) {
  if (!rbac.PERMISSIONS.syncAdmin.includes(sessionRole) && !rbac.PERMISSIONS.dashboardRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  let sql = `SELECT al.*, o.full_name AS operator_name FROM audit_logs al
             LEFT JOIN operators o ON o.id = al.operator_id`;
  const params = [];
  if (sinceTimestamp) {
    sql += ' WHERE al.timestamp > ?';
    params.push(sinceTimestamp);
  }
  sql += ' ORDER BY al.timestamp DESC LIMIT ?';
  params.push(limit);
  const rows = await all(sql, params);
  return { ok: true, data: rows };
}

module.exports = {
  getAllOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  getOperatorProfile,
  getOperatorKPIs,
  getAuditLogs,
  buildOperatorKpis,
};
