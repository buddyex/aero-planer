const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');

async function getAvailableBatteries(sessionRole) {
  try {
    if (!rbac.PERMISSIONS.scheduleRead.includes(sessionRole)) {
      return { ok: false, error: 'FORBIDDEN', message: 'Доступ запрещён.' };
    }

    const rows = await all(`
      SELECT id, serial_number, type, capacity, cycle_count, status
      FROM batteries
      WHERE status = 'Отлично'
        AND NOT EXISTS (
          SELECT 1 FROM missions m
          WHERE m.battery_id = batteries.id
            AND m.status NOT IN ('Завершено', 'Отменено')
        )
      ORDER BY serial_number
    `);

    const pendingRow = await get(
      `SELECT COUNT(*) AS cnt FROM batteries WHERE status = 'Требуется проверка'`,
    );

    return { ok: true, data: rows, pendingInspectionCount: pendingRow?.cnt ?? 0 };
  } catch (error) {
    return { ok: false, error: 'DB_ERROR', message: error.message };
  }
}

async function getAllBatteries(sessionRole) {
  try {
    if (!rbac.PERMISSIONS.maintenanceRead.includes(sessionRole)) {
      return { ok: false, error: 'FORBIDDEN', message: 'Доступ запрещён.' };
    }
    const rows = await all(
      'SELECT id, serial_number, type, capacity, cycle_count, status FROM batteries ORDER BY serial_number',
    );
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: 'DB_ERROR', message: error.message };
  }
}

async function addBattery(sessionOperatorId, sessionRole, serialNumber, type, capacity) {
  try {
    if (!rbac.PERMISSIONS.maintenanceWrite.includes(sessionRole)) {
      return { ok: false, error: 'Доступ запрещён.' };
    }

    const serial = String(serialNumber).trim();
    if (!serial) return { ok: false, error: 'Укажите серийный номер АКБ.' };

    const cap = parseInt(capacity, 10);
    if (!Number.isFinite(cap) || cap <= 0) {
      return { ok: false, error: 'Ёмкость должна быть положительным числом.' };
    }

    const batteryType = type === 'LiIon' ? 'LiIon' : 'LiPo';
    const id = uuidv4();

    await run(
      `INSERT INTO batteries (id, serial_number, type, capacity, cycle_count, status)
       VALUES (?, ?, ?, ?, 0, 'Отлично')`,
      [id, serial, batteryType, cap],
    );

    const row = await get(
      'SELECT id, serial_number, type, capacity, cycle_count, status FROM batteries WHERE id = ?',
      [id],
    );

    const { logAction } = require('./audit.service');
    await logAction(sessionOperatorId, `Добавлена АКБ ${serial} (${batteryType}, ${cap} мАч)`);

    return { ok: true, data: row };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'АКБ с таким серийным номером уже существует.' };
    }
    return { ok: false, error: error.message };
  }
}

async function updateBatteryStatus(sessionOperatorId, sessionRole, batteryId, status) {
  try {
    if (!rbac.PERMISSIONS.maintenanceWrite.includes(sessionRole)) {
      return { ok: false, error: 'Доступ запрещён.' };
    }

    const allowed = ['Отлично', 'Требуется проверка', 'Списано'];
    if (!allowed.includes(status)) {
      return { ok: false, error: 'Недопустимый статус АКБ.' };
    }

    await run('UPDATE batteries SET status = ? WHERE id = ?', [status, batteryId]);
    const row = await get(
      'SELECT id, serial_number, type, capacity, cycle_count, status FROM batteries WHERE id = ?',
      [batteryId],
    );
    if (!row) return { ok: false, error: 'АКБ не найдена.' };

    const { logAction } = require('./audit.service');
    await logAction(sessionOperatorId, `Статус АКБ ${row.serial_number} → «${status}»`);

    return { ok: true, data: row };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getBatteryInspectionLogs(sessionRole) {
  try {
    if (!rbac.PERMISSIONS.maintenanceRead.includes(sessionRole)) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    const rows = await all(`
      SELECT bil.*, b.serial_number AS battery_serial, o.full_name AS operator_name
      FROM battery_inspection_logs bil
      INNER JOIN batteries b ON b.id = bil.battery_id
      INNER JOIN operators o ON o.id = bil.operator_id
      ORDER BY bil.inspection_date DESC, bil.id DESC
    `);
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function completeBatteryInspection(sessionOperatorId, sessionRole, batteryId, payload) {
  try {
    if (!rbac.PERMISSIONS.maintenanceWrite.includes(sessionRole)) {
      return { ok: false, error: 'Доступ запрещён.' };
    }

    const battery = await get('SELECT * FROM batteries WHERE id = ?', [batteryId]);
    if (!battery) return { ok: false, error: 'АКБ не найдена.' };
    if (battery.status !== 'Требуется проверка') {
      return { ok: false, error: 'Проверка доступна только для АКБ со статусом «Требуется проверка».' };
    }

    await run(
      `INSERT INTO battery_inspection_logs (
        battery_id, operator_id, cycle_count_at_inspection,
        visual_ok, connectors_ok, balance_ok, test_cycle_ok,
        capacity_percent, result, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batteryId,
        sessionOperatorId,
        battery.cycle_count,
        payload.visual_ok ? 1 : 0,
        payload.connectors_ok ? 1 : 0,
        payload.balance_ok ? 1 : 0,
        payload.test_cycle_ok ? 1 : 0,
        payload.capacity_percent,
        payload.result,
        payload.notes ?? null,
      ],
    );

    const updated = await get(
      'SELECT id, serial_number, type, capacity, cycle_count, status FROM batteries WHERE id = ?',
      [batteryId],
    );

    const { logAction } = require('./audit.service');
    await logAction(
      sessionOperatorId,
      `Проверка АКБ ${battery.serial_number}: ${payload.result}`,
    );

    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  getAvailableBatteries,
  getAllBatteries,
  addBattery,
  updateBatteryStatus,
  getBatteryInspectionLogs,
  completeBatteryInspection,
};
