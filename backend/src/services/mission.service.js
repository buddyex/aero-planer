const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');
const { logAction } = require('./audit.service');

const ACTIVE_SECTOR_SQL = 'is_active = 1';
const MAINTENANCE_FLIGHT_HOURS_LIMIT = 100;
const WIND_SAFETY_ERROR = 'Запуск отклонен системой безопасности: превышен ветровой порог';

function mapDbError(error) {
  return error?.sqlMessage || error?.message || 'Ошибка базы данных.';
}

async function getLatestWeatherLogForSector(sectorId) {
  return get(
    `SELECT wind_speed, temperature, precipitation, weather_source, timestamp
     FROM weather_logs WHERE sector_id = ? ORDER BY timestamp DESC LIMIT 1`,
    [sectorId],
  );
}

async function assertWindWithinDroneLimits(droneId, sectorId, operatorId = null) {
  const drone = await get('SELECT id, name, max_wind_speed FROM drones WHERE id = ?', [droneId]);
  if (!drone) throw new Error('Борт БПЛА не найден.');

  const weather = await getLatestWeatherLogForSector(sectorId);
  if (!weather || weather.wind_speed == null) return;

  const windSpeed = Number(weather.wind_speed);
  const maxWind = Number(drone.max_wind_speed);
  if (Number.isFinite(windSpeed) && Number.isFinite(maxWind) && windSpeed > maxWind) {
    await logAction(operatorId, `Системой предотвращен запуск ${drone.name} из-за погодных условий`);
    throw new Error(WIND_SAFETY_ERROR);
  }
}

async function validateApprovedMissionResources(payload, excludeMissionId = null) {
  const drone = await get(
    'SELECT id, status, serial_number, name, flight_hours FROM drones WHERE id = ?',
    [payload.drone_id],
  );
  if (!drone) return { ok: false, error: 'Борт БПЛА не найден.' };
  if (drone.status !== 'Готов') {
    return { ok: false, error: `Борт ${drone.serial_number} недоступен (статус: ${drone.status}).` };
  }
  if ((drone.flight_hours ?? 0) > MAINTENANCE_FLIGHT_HOURS_LIMIT) {
    return {
      ok: false,
      error: `Ошибка АСОИУ: Превышен лимит налёта (>${MAINTENANCE_FLIGHT_HOURS_LIMIT} ч). Требуется плановое ТО.`,
    };
  }

  const pilot = await get(
    'SELECT id, full_name, role, duty_status FROM operators WHERE id = ?',
    [payload.operator_id],
  );
  if (!pilot) return { ok: false, error: 'Оператор не найден.' };
  if (pilot.role === 'Оператор' && pilot.duty_status !== 'Свободен') {
    return { ok: false, error: 'Ошибка АСОИУ: Оператор уже назначен на другую миссию.' };
  }

  if (!payload.battery_id?.trim()) {
    return { ok: false, error: 'Выберите аккумулятор (АКБ) для миссии.' };
  }

  const battery = await get(
    'SELECT id, serial_number, status FROM batteries WHERE id = ?',
    [payload.battery_id.trim()],
  );
  if (!battery) return { ok: false, error: 'АКБ не найдена.' };
  if (battery.status !== 'Отлично') {
    return { ok: false, error: `АКБ ${battery.serial_number} недоступна (статус: ${battery.status}).` };
  }

  const overlapParams = [
    payload.start_time,
    payload.end_time,
    payload.drone_id,
    payload.operator_id,
    payload.battery_id.trim(),
  ];
  let overlapSql = `
    SELECT id FROM missions
    WHERE status IN ('К выполнению', 'Выполняется')
      AND ? < end_time AND ? > start_time
      AND (drone_id = ? OR operator_id = ? OR battery_id = ?)`;
  if (excludeMissionId) {
    overlapSql += ' AND id != ?';
    overlapParams.push(excludeMissionId);
  }
  const overlap = await get(overlapSql, overlapParams);
  if (overlap) {
    return { ok: false, error: 'Ресурсы миссии пересекаются с другой утверждённой миссией.' };
  }

  return { ok: true };
}

const MISSION_SELECT = `
  SELECT
    m.id, m.title, m.operator_id, m.drone_id, m.battery_id, m.sector_id,
    DATE_FORMAT(m.start_time, '%Y-%m-%d %H:%i:%s') AS start_time,
    DATE_FORMAT(m.end_time, '%Y-%m-%d %H:%i:%s') AS end_time,
    m.status, m.creator_id, m.approved_by_id,
    m.route_geometry, m.flight_radius_m, m.flight_altitude_m, m.sync_status,
    d.serial_number AS drone_serial, d.name AS drone_name, d.status AS drone_status,
    d.max_wind_speed AS drone_max_wind,
    b.serial_number AS battery_serial, b.type AS battery_type,
    b.capacity AS battery_capacity, b.cycle_count AS battery_cycle_count,
    o.full_name AS operator_name, o.role AS operator_role,
    cr.full_name AS creator_name, cr.role AS creator_role,
    ap.full_name AS approver_name, ap.role AS approver_role,
    s.sector_name, s.risk_level AS sector_risk_level
  FROM missions m
  INNER JOIN drones d ON d.id = m.drone_id
  LEFT JOIN batteries b ON b.id = m.battery_id
  INNER JOIN operators o ON o.id = m.operator_id
  LEFT JOIN operators cr ON cr.id = m.creator_id
  LEFT JOIN operators ap ON ap.id = m.approved_by_id
  INNER JOIN sectors s ON s.id = m.sector_id`;

async function getMissions(sessionOperatorId, sessionRole) {
  try {
    let sql = MISSION_SELECT;
    const params = [];
    if (!rbac.canViewAllMissions(sessionRole)) {
      sql += ' WHERE m.operator_id = ?';
      params.push(sessionOperatorId);
    }
    sql += ' ORDER BY m.start_time DESC';
    const rows = await all(sql, params);
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, error: mapDbError(error) };
  }
}

async function createMission(payload, sessionOperatorId, sessionRole) {
  try {
    const isOperatorSubmit =
      sessionRole === rbac.ROLES.OPERATOR && rbac.PERMISSIONS.missionSubmit.includes(sessionRole);
    const isManagerCreate =
      sessionRole === rbac.ROLES.ADMIN || sessionRole === rbac.ROLES.HEAD;

    if (!isOperatorSubmit && !isManagerCreate) {
      return { ok: false, error: 'Доступ запрещён: нет прав на создание миссии.' };
    }

    if (!payload.title?.trim()) return { ok: false, error: 'Укажите название миссии.' };
    if (payload.start_time >= payload.end_time) {
      return { ok: false, error: 'Время окончания должно быть позже времени начала.' };
    }

    const sector = await get(
      `SELECT id, center_lat, center_lon FROM sectors WHERE id = ? AND ${ACTIVE_SECTOR_SQL}`,
      [payload.sector_id],
    );
    if (!sector) return { ok: false, error: 'Сектор не найден или деактивирован.' };

    const flightRadiusM = Number(payload.flight_radius_m ?? 500);
    const flightAltitudeM = Number(payload.flight_altitude_m ?? 120);

    let missionStatus;
    let creatorId = sessionOperatorId;
    let approvedById = null;

    if (isOperatorSubmit && !isManagerCreate) {
      if (payload.operator_id !== sessionOperatorId) {
        return { ok: false, error: 'Оператор может создавать миссии только на себя.' };
      }
      missionStatus = 'Ожидает утверждения';
      if (!payload.battery_id?.trim()) {
        return { ok: false, error: 'Выберите аккумулятор (АКБ) для миссии.' };
      }
    } else {
      missionStatus = 'К выполнению';
      approvedById = creatorId;
      const resourceCheck = await validateApprovedMissionResources(payload);
      if (!resourceCheck.ok) return resourceCheck;
      await assertWindWithinDroneLimits(payload.drone_id, payload.sector_id, sessionOperatorId);
    }

    const missionId = uuidv4();
    const routeGeometry = payload.route_geometry?.trim() || null;

    await run(
      `INSERT INTO missions (
        id, title, operator_id, drone_id, battery_id, sector_id,
        start_time, end_time, creator_id, approved_by_id, route_geometry, status,
        flight_radius_m, flight_altitude_m
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        missionId,
        payload.title.trim(),
        payload.operator_id,
        payload.drone_id,
        payload.battery_id.trim(),
        payload.sector_id,
        payload.start_time,
        payload.end_time,
        creatorId,
        approvedById,
        routeGeometry,
        missionStatus,
        flightRadiusM,
        flightAltitudeM,
      ],
    );

    const mission = await get(`${MISSION_SELECT} WHERE m.id = ?`, [missionId]);
    await logAction(sessionOperatorId, `Создана миссия «${mission.title}» (ID ${missionId})`);

    return {
      ok: true,
      data: mission,
      notifyApproval: missionStatus === 'Ожидает утверждения',
    };
  } catch (error) {
    const msg = mapDbError(error);
    if (msg.includes('Ошибка АСОИУ') || msg.includes(WIND_SAFETY_ERROR)) {
      return { ok: false, error: msg };
    }
    return { ok: false, error: msg };
  }
}

async function approveMission(missionId, approverId) {
  try {
    const approver = await get('SELECT role FROM operators WHERE id = ?', [approverId]);
    if (!approver || !rbac.PERMISSIONS.missionApprove.includes(approver.role)) {
      return { ok: false, error: 'Доступ запрещён.' };
    }

    const mission = await get(
      `SELECT id, title, operator_id, drone_id, battery_id, sector_id, start_time, end_time, status
       FROM missions WHERE id = ?`,
      [missionId],
    );
    if (!mission) return { ok: false, error: 'Миссия не найдена.' };
    if (mission.status !== 'Ожидает утверждения') {
      return { ok: false, error: 'Утвердить можно только миссию, ожидающую утверждения.' };
    }

    const resourceCheck = await validateApprovedMissionResources(mission, missionId);
    if (!resourceCheck.ok) return resourceCheck;

    await assertWindWithinDroneLimits(mission.drone_id, mission.sector_id, approverId);

    await run(
      `UPDATE missions SET status = 'К выполнению', approved_by_id = ? WHERE id = ?`,
      [approverId, missionId],
    );

    const updated = await get(`${MISSION_SELECT} WHERE m.id = ?`, [missionId]);
    await logAction(approverId, `Утверждена миссия «${updated.title}» (ID ${missionId})`);
    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: mapDbError(error) };
  }
}

async function rejectMission(missionId, approverId) {
  try {
    const approver = await get('SELECT role FROM operators WHERE id = ?', [approverId]);
    if (!approver || !rbac.PERMISSIONS.missionApprove.includes(approver.role)) {
      return { ok: false, error: 'Доступ запрещён.' };
    }

    const mission = await get('SELECT id, title, status FROM missions WHERE id = ?', [missionId]);
    if (!mission) return { ok: false, error: 'Миссия не найдена.' };
    if (mission.status !== 'Ожидает утверждения') {
      return { ok: false, error: 'Отклонить можно только миссию, ожидающую утверждения.' };
    }

    await run(`UPDATE missions SET status = 'Отклонено' WHERE id = ?`, [missionId]);
    const updated = await get(`${MISSION_SELECT} WHERE m.id = ?`, [missionId]);
    await logAction(approverId, `Отклонена миссия «${updated.title}» (ID ${missionId})`);
    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: mapDbError(error) };
  }
}

async function updateMissionStatus(missionId, newStatus, sessionOperatorId, sessionRole) {
  try {
    const fullMission = await get(
      'SELECT id, title, status, operator_id, drone_id, sector_id, battery_id FROM missions WHERE id = ?',
      [missionId],
    );
    if (!fullMission) return { ok: false, error: 'Миссия не найдена.' };

    if (
      !rbac.canTransitionMissionStatus(
        sessionRole,
        sessionOperatorId,
        fullMission.operator_id,
        newStatus,
      )
    ) {
      return {
        ok: false,
        error:
          newStatus === 'Выполняется' || newStatus === 'Завершено'
            ? 'Запуск и завершение миссии доступны только назначенному оператору.'
            : 'Доступ запрещён: нет прав на управление этой миссией.',
      };
    }

    if (fullMission.status === newStatus) {
      const current = await get(`${MISSION_SELECT} WHERE m.id = ?`, [missionId]);
      return { ok: true, data: current };
    }

    if (newStatus === 'Выполняется') {
      await assertWindWithinDroneLimits(fullMission.drone_id, fullMission.sector_id, sessionOperatorId);
    }

    await run('UPDATE missions SET status = ? WHERE id = ?', [newStatus, missionId]);
    const updated = await get(`${MISSION_SELECT} WHERE m.id = ?`, [missionId]);
    await logAction(
      sessionOperatorId,
      `Статус миссии «${updated.title}» (ID ${missionId}): ${fullMission.status} → ${newStatus}`,
    );
    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: mapDbError(error) };
  }
}

async function updateMission(missionId, payload, sessionOperatorId, sessionRole) {
  try {
    if (!rbac.PERMISSIONS.missionWrite.includes(sessionRole)) {
      return { ok: false, error: 'Доступ запрещён.' };
    }

    const existing = await get(
      'SELECT id, title, operator_id, drone_id, battery_id, sector_id, start_time, end_time, status, route_geometry FROM missions WHERE id = ?',
      [missionId],
    );
    if (!existing) return { ok: false, error: 'Миссия не найдена.' };
    if (existing.status !== 'К выполнению' && existing.status !== 'Ожидает утверждения') {
      return { ok: false, error: 'Редактировать можно только миссию до запуска.' };
    }

    if (!payload.title?.trim()) return { ok: false, error: 'Укажите название миссии.' };
    if (payload.start_time >= payload.end_time) {
      return { ok: false, error: 'Время окончания должно быть позже времени начала.' };
    }

    await assertWindWithinDroneLimits(payload.drone_id, payload.sector_id, sessionOperatorId);

    const routeGeometry =
      payload.route_geometry !== undefined
        ? payload.route_geometry?.trim() || null
        : existing.route_geometry ?? null;

    await run(
      `UPDATE missions SET
        title = ?, operator_id = ?, drone_id = ?, battery_id = ?, sector_id = ?,
        start_time = ?, end_time = ?, flight_radius_m = ?, flight_altitude_m = ?, route_geometry = ?
       WHERE id = ?`,
      [
        payload.title.trim(),
        payload.operator_id,
        payload.drone_id,
        payload.battery_id.trim(),
        payload.sector_id,
        payload.start_time,
        payload.end_time,
        Number(payload.flight_radius_m ?? 500),
        Number(payload.flight_altitude_m ?? 120),
        routeGeometry,
        missionId,
      ],
    );

    const mission = await get(`${MISSION_SELECT} WHERE m.id = ?`, [missionId]);
    await logAction(sessionOperatorId, `Обновлена миссия «${mission.title}» (ID ${mission.id})`);
    return { ok: true, data: mission };
  } catch (error) {
    return { ok: false, error: mapDbError(error) };
  }
}

async function getMissionForPdf(missionId) {
  const selectSql = MISSION_SELECT.replace(
    's.risk_level AS sector_risk_level',
    's.risk_level AS sector_risk_level, wl.temperature, wl.wind_speed, wl.precipitation, wl.weather_source',
  );

  return get(
    `${selectSql}
     LEFT JOIN (
       SELECT wl1.*
       FROM weather_logs wl1
       INNER JOIN (
         SELECT sector_id, MAX(timestamp) AS max_ts
         FROM weather_logs GROUP BY sector_id
       ) wl2 ON wl1.sector_id = wl2.sector_id AND wl1.timestamp = wl2.max_ts
     ) wl ON wl.sector_id = m.sector_id
     WHERE m.id = ?`,
    [missionId],
  );
}

async function assertMissionDocumentAccess(missionId, sessionOperatorId, sessionRole) {
  const mission = await get(
    'SELECT id, status, operator_id FROM missions WHERE id = ?',
    [missionId],
  );
  if (!mission) {
    return { ok: false, status: 404, error: 'Миссия не найдена.' };
  }
  if (mission.status !== 'Завершено') {
    return {
      ok: false,
      status: 403,
      error: 'Документы доступны только после завершения миссии.',
    };
  }
  if (
    !rbac.canDownloadMissionDocuments(
      sessionRole,
      sessionOperatorId,
      mission.operator_id,
      mission.status,
    )
  ) {
    return { ok: false, status: 403, error: 'Недостаточно прав для скачивания документов миссии.' };
  }
  return { ok: true, data: mission };
}

module.exports = {
  getMissions,
  createMission,
  approveMission,
  rejectMission,
  updateMission,
  updateMissionStatus,
  getMissionForPdf,
  assertMissionDocumentAccess,
  MISSION_SELECT,
  WIND_SAFETY_ERROR,
};
