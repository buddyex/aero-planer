const fs = require('fs');
const path = require('path');
const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');
const { validateDronePayload } = require('../lib/validate');
const { logAction } = require('./audit.service');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const DRONE_UPLOAD_DIR = path.join(UPLOADS_ROOT, 'drones');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const ACTIVE_MISSION_STATUSES = ['Ожидает утверждения', 'К выполнению', 'Выполняется'];

function ensureUploadDir() {
  fs.mkdirSync(DRONE_UPLOAD_DIR, { recursive: true });
}

function unlinkPhotoFile(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return;
  if (!photoUrl.startsWith('/uploads/drones/')) return;
  const filename = path.basename(photoUrl);
  if (!filename || filename === '.' || filename === '..') return;
  const fullPath = path.join(DRONE_UPLOAD_DIR, filename);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    /* ignore missing/unreadable files */
  }
}

function normalizeReason(reason) {
  if (reason == null) return null;
  const text = String(reason).trim();
  if (!text) return null;
  return text.slice(0, 512);
}

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

  const validation = validateDronePayload(droneData);
  if (!validation.ok) return validation;

  try {
    const result = await run(
      `INSERT INTO drones (name, serial_number, max_wind_speed, battery_capacity, payload_capacity, flight_time_max, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        droneData.name.trim(),
        droneData.serial_number.trim(),
        droneData.max_wind_speed,
        droneData.battery_capacity,
        droneData.payload_capacity,
        droneData.flight_time_max,
        'Готов',
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

  const validation = validateDronePayload(droneData);
  if (!validation.ok) return validation;

  const existing = await get('SELECT status FROM drones WHERE id = ?', [id]);
  if (!existing) {
    return { ok: false, error: 'Борт не найден.' };
  }
  if (existing.status === 'Списан') {
    return {
      ok: false,
      error: 'Списанный борт нельзя редактировать. Восстановите его в строй или оставьте в архиве.',
    };
  }

  // Статус меняется только через write-off / restore / триггеры — не из формы CRUD
  await run(
    `UPDATE drones SET name=?, serial_number=?, max_wind_speed=?, battery_capacity=?,
     payload_capacity=?, flight_time_max=? WHERE id=?`,
    [
      droneData.name.trim(),
      droneData.serial_number.trim(),
      droneData.max_wind_speed,
      droneData.battery_capacity,
      droneData.payload_capacity,
      droneData.flight_time_max,
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
  const drone = await get('SELECT serial_number, photo_url, status FROM drones WHERE id = ?', [id]);
  if (!drone) return { ok: false, error: 'Борт не найден.' };

  const missionLinks = await get(
    `SELECT COUNT(*) AS cnt FROM missions WHERE drone_id = ?`,
    [id],
  );
  const missionCount = Number(missionLinks?.cnt ?? 0);
  if (missionCount > 0) {
    return {
      ok: false,
      error: `Нельзя удалить борт ${drone.serial_number}: есть связанные миссии. Используйте списание.`,
    };
  }

  try {
    await run('DELETE FROM drones WHERE id = ?', [id]);
    unlinkPhotoFile(drone.photo_url);
    await logAction(sessionOperatorId, `Удалён борт ${drone.serial_number}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `Невозможно удалить борт ${drone.serial_number}: есть связанные записи. Используйте списание.`,
    };
  }
}

async function writeOffDrone(sessionOperatorId, sessionRole, id, reason) {
  if (!rbac.PERMISSIONS.fleetWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }

  const drone = await get('SELECT * FROM drones WHERE id = ?', [id]);
  if (!drone) return { ok: false, error: 'Борт не найден.' };

  if (drone.status === 'Списан') {
    return { ok: false, error: `Борт ${drone.serial_number} уже списан.` };
  }
  if (drone.status === 'В полете') {
    return { ok: false, error: `Нельзя списать борт ${drone.serial_number}: он в полёте.` };
  }
  if (drone.status === 'Запланирован') {
    return {
      ok: false,
      error: `Нельзя списать борт ${drone.serial_number}: он запланирован. Сначала снимите назначение с миссии.`,
    };
  }

  const activeMissions = await get(
    `SELECT COUNT(*) AS cnt,
            SUM(status = 'Выполняется') AS flying_cnt,
            SUM(status = 'К выполнению') AS planned_cnt,
            SUM(status = 'Ожидает утверждения') AS pending_cnt
     FROM missions WHERE drone_id = ? AND status IN (?, ?, ?)`,
    [id, ...ACTIVE_MISSION_STATUSES],
  );
  const flying = Number(activeMissions?.flying_cnt ?? 0);
  const planned = Number(activeMissions?.planned_cnt ?? 0);
  const pending = Number(activeMissions?.pending_cnt ?? 0);
  if (flying > 0) {
    return {
      ok: false,
      error: `Нельзя списать борт ${drone.serial_number}: есть выполняющаяся миссия.`,
    };
  }
  if (planned > 0) {
    return {
      ok: false,
      error: `Нельзя списать борт ${drone.serial_number}: есть миссия «К выполнению». Сначала отмените её.`,
    };
  }
  if (pending > 0) {
    return {
      ok: false,
      error: `Нельзя списать борт ${drone.serial_number}: есть миссия на утверждении. Отклоните её или смените борт.`,
    };
  }

  const openTo = await get(
    `SELECT COUNT(*) AS cnt FROM maintenance_logs
     WHERE drone_id = ? AND closed_at IS NULL
       AND work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика')`,
    [id],
  );
  if (Number(openTo?.cnt ?? 0) > 0) {
    return {
      ok: false,
      error: `Нельзя списать борт ${drone.serial_number}: есть открытое ТО/ремонт/диагностика. Сначала закройте запись.`,
    };
  }

  const writtenOffReason = normalizeReason(reason);
  await run(
    `UPDATE drones
     SET status = 'Списан', written_off_at = NOW(), written_off_reason = ?
     WHERE id = ?`,
    [writtenOffReason, id],
  );

  const row = await get('SELECT * FROM drones WHERE id = ?', [id]);
  await logAction(
    sessionOperatorId,
    `Списан борт ${drone.serial_number}${writtenOffReason ? `: ${writtenOffReason}` : ''}`,
  );
  return { ok: true, data: row };
}

async function restoreDrone(sessionOperatorId, sessionRole, id) {
  if (sessionRole !== rbac.ROLES.ADMIN) {
    return { ok: false, error: 'Восстановление списанного борта доступно только администратору.' };
  }

  const drone = await get('SELECT * FROM drones WHERE id = ?', [id]);
  if (!drone) return { ok: false, error: 'Борт не найден.' };
  if (drone.status !== 'Списан') {
    return { ok: false, error: `Борт ${drone.serial_number} не списан.` };
  }

  const openTo = await get(
    `SELECT COUNT(*) AS cnt FROM maintenance_logs
     WHERE drone_id = ? AND closed_at IS NULL
       AND work_type IN ('Плановое ТО', 'Ремонт', 'Диагностика')`,
    [id],
  );
  const hasOpenTo = Number(openTo?.cnt ?? 0) > 0;
  const hours = Number(drone.flight_hours ?? 0);
  const nextStatus = hasOpenTo || hours >= 100 ? 'На ТО' : 'Готов';

  await run(
    `UPDATE drones
     SET status = ?, written_off_at = NULL, written_off_reason = NULL
     WHERE id = ?`,
    [nextStatus, id],
  );

  const row = await get('SELECT * FROM drones WHERE id = ?', [id]);
  await logAction(sessionOperatorId, `Восстановлен борт ${drone.serial_number} → ${nextStatus}`);
  return { ok: true, data: row };
}

async function uploadDronePhoto(sessionOperatorId, sessionRole, id, file) {
  if (!rbac.PERMISSIONS.fleetPhotoWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }

  if (!file) {
    return { ok: false, error: 'Файл фотографии не передан.' };
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return { ok: false, error: 'Допустимы только JPEG, PNG или WebP.' };
  }

  const drone = await get('SELECT id, serial_number, photo_url, status FROM drones WHERE id = ?', [id]);
  if (!drone) {
    return { ok: false, error: 'Борт не найден.' };
  }
  if (drone.status === 'Списан') {
    return { ok: false, error: 'Нельзя менять фото списанного борта.' };
  }

  ensureUploadDir();
  const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
  const filename = `drone-${id}-${Date.now()}${ext}`;
  const destPath = path.join(DRONE_UPLOAD_DIR, filename);
  const photoUrl = `/uploads/drones/${filename}`;

  try {
    fs.writeFileSync(destPath, file.buffer);
  } catch (error) {
    return { ok: false, error: `Не удалось сохранить файл: ${error.message}` };
  }

  await run('UPDATE drones SET photo_url = ? WHERE id = ?', [photoUrl, id]);
  unlinkPhotoFile(drone.photo_url);

  const row = await get('SELECT * FROM drones WHERE id = ?', [id]);
  await logAction(sessionOperatorId, `Обновлено фото борта ${drone.serial_number}`);
  return { ok: true, data: row };
}

async function deleteDronePhoto(sessionOperatorId, sessionRole, id) {
  if (!rbac.PERMISSIONS.fleetPhotoWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }

  const drone = await get('SELECT id, serial_number, photo_url, status FROM drones WHERE id = ?', [id]);
  if (!drone) {
    return { ok: false, error: 'Борт не найден.' };
  }
  if (drone.status === 'Списан') {
    return { ok: false, error: 'Нельзя менять фото списанного борта.' };
  }

  await run('UPDATE drones SET photo_url = NULL WHERE id = ?', [id]);
  unlinkPhotoFile(drone.photo_url);

  const row = await get('SELECT * FROM drones WHERE id = ?', [id]);
  await logAction(sessionOperatorId, `Удалено фото борта ${drone.serial_number}`);
  return { ok: true, data: row };
}

module.exports = {
  getDrones,
  addDrone,
  updateDrone,
  deleteDrone,
  writeOffDrone,
  restoreDrone,
  uploadDronePhoto,
  deleteDronePhoto,
  DRONE_UPLOAD_DIR,
  UPLOADS_ROOT,
  ALLOWED_MIME,
};
