const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');
const { logAction } = require('./audit.service');

async function getMaintenanceLogs(sessionRole) {
  if (!rbac.PERMISSIONS.maintenanceRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const rows = await all(`
    SELECT ml.*, d.name AS drone_name, d.serial_number AS drone_serial, o.full_name AS operator_name
    FROM maintenance_logs ml
    INNER JOIN drones d ON d.id = ml.drone_id
    INNER JOIN operators o ON o.id = ml.operator_id
    ORDER BY ml.maintenance_date DESC, ml.id DESC
  `);
  return { ok: true, data: rows };
}

async function addMaintenanceLog(sessionOperatorId, sessionRole, payload) {
  if (!rbac.PERMISSIONS.maintenanceWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  const result = await run(
    `INSERT INTO maintenance_logs (drone_id, operator_id, maintenance_date, work_type, description, hours_at_service)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      payload.drone_id,
      sessionOperatorId,
      payload.maintenance_date ?? new Date().toISOString().slice(0, 10),
      payload.work_type,
      payload.description ?? null,
      payload.hours_at_service ?? null,
    ],
  );
  const row = await get('SELECT * FROM maintenance_logs WHERE id = ?', [result.insertId]);
  await logAction(sessionOperatorId, `Открыто ТО борта ID ${payload.drone_id}: ${payload.work_type}`);
  return { ok: true, data: row };
}

async function completeMaintenance(sessionOperatorId, sessionRole, droneId) {
  if (!rbac.PERMISSIONS.maintenanceWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  const drone = await get('SELECT * FROM drones WHERE id = ?', [droneId]);
  if (!drone) return { ok: false, error: 'Борт не найден.' };
  if (!['На ТО', 'Ремонт', 'Диагностика'].includes(drone.status)) {
    return { ok: false, error: 'Завершение доступно только для бортов на ТО/ремонте/диагностике.' };
  }

  await run(
    `UPDATE maintenance_logs SET closed_at = NOW()
     WHERE drone_id = ? AND closed_at IS NULL`,
    [droneId],
  );
  await run(`UPDATE drones SET status = 'Готов' WHERE id = ?`, [droneId]);
  await logAction(sessionOperatorId, `Завершено обслуживание борта ${drone.serial_number}`);
  const updated = await get('SELECT * FROM drones WHERE id = ?', [droneId]);
  return { ok: true, data: updated };
}

module.exports = { getMaintenanceLogs, addMaintenanceLog, completeMaintenance };
