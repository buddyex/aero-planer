const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');
const { logAction } = require('./audit.service');

async function getDrones(sessionRole) {
  if (!rbac.PERMISSIONS.fleetRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const rows = await all('SELECT * FROM drones ORDER BY id');
  return { ok: true, data: rows };
}

async function addDrone(sessionOperatorId, sessionRole, droneData) {
  if (!rbac.PERMISSIONS.fleetWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  try {
    const result = await run(
      `INSERT INTO drones (name, serial_number, max_wind_speed, battery_capacity, payload_capacity, flight_time_max, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        droneData.name,
        droneData.serial_number,
        droneData.max_wind_speed,
        droneData.battery_capacity,
        droneData.payload_capacity,
        droneData.flight_time_max,
        droneData.status || 'Готов',
      ],
    );
    const row = await get('SELECT * FROM drones WHERE id = ?', [result.insertId]);
    await logAction(sessionOperatorId, `Добавлен борт ${row.serial_number}`);
    return { ok: true, data: row };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'Борт с таким серийным номером уже существует.' };
    }
    return { ok: false, error: error.message };
  }
}

async function updateDrone(sessionOperatorId, sessionRole, id, droneData) {
  if (!rbac.PERMISSIONS.fleetWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  await run(
    `UPDATE drones SET name=?, serial_number=?, max_wind_speed=?, battery_capacity=?,
     payload_capacity=?, flight_time_max=?, status=? WHERE id=?`,
    [
      droneData.name,
      droneData.serial_number,
      droneData.max_wind_speed,
      droneData.battery_capacity,
      droneData.payload_capacity,
      droneData.flight_time_max,
      droneData.status,
      id,
    ],
  );
  const row = await get('SELECT * FROM drones WHERE id = ?', [id]);
  await logAction(sessionOperatorId, `Обновлён борт ${row.serial_number}`);
  return { ok: true, data: row };
}

async function deleteDrone(sessionOperatorId, sessionRole, id) {
  if (!rbac.PERMISSIONS.fleetWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  const drone = await get('SELECT serial_number FROM drones WHERE id = ?', [id]);
  if (!drone) return { ok: false, error: 'Борт не найден.' };
  try {
    await run('DELETE FROM drones WHERE id = ?', [id]);
    await logAction(sessionOperatorId, `Удалён борт ${drone.serial_number}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: 'Невозможно удалить борт: есть связанные записи.' };
  }
}

module.exports = { getDrones, addDrone, updateDrone, deleteDrone };
