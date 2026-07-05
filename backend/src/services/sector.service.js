const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../db/pool');
const rbac = require('../lib/rbac');
const { logAction } = require('./audit.service');
const kmlService = require('./kml.service');
const { fetchWeatherCascade, OfflineWeatherError } = require('../lib/weather-cascade-service');

const ACTIVE_SECTOR_SQL = 'is_active = 1';

async function getSectorsRisk(sessionRole) {
  if (!rbac.PERMISSIONS.weatherRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const rows = await all(`
    SELECT s.*,
      wl.wind_speed, wl.temperature, wl.precipitation, wl.weather_source, wl.timestamp AS last_update
    FROM sectors s
    LEFT JOIN (
      SELECT wl1.*
      FROM weather_logs wl1
      INNER JOIN (
        SELECT sector_id, MAX(timestamp) AS max_ts FROM weather_logs GROUP BY sector_id
      ) wl2 ON wl1.sector_id = wl2.sector_id AND wl1.timestamp = wl2.max_ts
    ) wl ON wl.sector_id = s.id
    WHERE s.is_active = 1
    ORDER BY s.sector_name
  `);

  return {
    ok: true,
    data: rows.map((row) => ({
      ...row,
      coordinates: row.center_lat != null ? { lat: row.center_lat, lon: row.center_lon } : null,
    })),
  };
}

async function createSector(sessionOperatorId, sessionRole, sectorName, centerLat, centerLon, radiusKm = 20, options = {}) {
  if (!rbac.PERMISSIONS.sectorWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  try {
    const result = await run(
      `INSERT INTO sectors (sector_name, center_lat, center_lon, radius_km, boundary_polygon, shape_type, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        sectorName.trim(),
        centerLat,
        centerLon,
        radiusKm,
        options.boundary_polygon ?? null,
        options.shape_type ?? 'circle',
      ],
    );
    const row = await get('SELECT * FROM sectors WHERE id = ?', [result.insertId]);
    await logAction(sessionOperatorId, `Создан сектор «${sectorName}»`);
    return { ok: true, data: row };
  } catch (error) {
    return { ok: false, error: error.sqlMessage || error.message };
  }
}

async function updateSectorBoundary(sessionOperatorId, sessionRole, sectorId, payload) {
  if (!rbac.PERMISSIONS.sectorWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  await run(
    `UPDATE sectors SET center_lat=?, center_lon=?, radius_km=?, boundary_polygon=?, shape_type=? WHERE id=?`,
    [
      payload.center_lat,
      payload.center_lon,
      payload.radius_km,
      payload.boundary_polygon ?? null,
      payload.shape_type ?? 'circle',
      sectorId,
    ],
  );
  const row = await get(`SELECT * FROM sectors WHERE id = ? AND ${ACTIVE_SECTOR_SQL}`, [sectorId]);
  return { ok: true, data: row };
}

async function deleteSector(sessionOperatorId, sessionRole, sectorId) {
  if (!rbac.PERMISSIONS.sectorWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  await run('UPDATE sectors SET is_active = 0 WHERE id = ?', [sectorId]);
  await logAction(sessionOperatorId, `Деактивирован сектор ID ${sectorId}`);
  return { ok: true };
}

async function importSectorsFromKmlContent(kmlText, sessionOperatorId, sessionRole) {
  if (!rbac.PERMISSIONS.sectorWrite.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  const placemarks = kmlService.parseKmlContent(kmlText);
  const imported = [];
  for (const pm of placemarks) {
    const prepared = kmlService.prepareSectorFromKmlPlacemark(pm);
    if (!prepared.ok) continue;
    const result = await run(
      `INSERT INTO sectors (sector_name, center_lat, center_lon, radius_km, boundary_polygon, shape_type, is_active)
       VALUES (?, ?, ?, ?, ?, 'polygon', 1)`,
      [
        prepared.sector_name,
        prepared.center_lat,
        prepared.center_lon,
        prepared.radius_km,
        prepared.boundary_polygon,
      ],
    );
    imported.push(result.insertId);
  }
  await logAction(sessionOperatorId, `Импортировано секторов из KML: ${imported.length}`);
  return { ok: true, data: { importedCount: imported.length } };
}

async function exportSectorsKml(sectorId = null) {
  let sectors;
  if (sectorId) {
    const row = await get('SELECT * FROM sectors WHERE id = ? AND is_active = 1', [sectorId]);
    sectors = row ? [row] : [];
  } else {
    sectors = await all('SELECT * FROM sectors WHERE is_active = 1');
  }
  return { ok: true, data: kmlService.exportSectorsToKml(sectors) };
}

async function exportMissionKml(missionId) {
  const mission = await get(
    'SELECT id, title, sector_id, route_geometry FROM missions WHERE id = ?',
    [missionId],
  );
  if (!mission) return { ok: false, error: 'Миссия не найдена.' };
  const sector = await get('SELECT * FROM sectors WHERE id = ?', [mission.sector_id]);
  if (!sector) return { ok: false, error: 'Сектор не найден.' };
  const kml = kmlService.exportMissionToKml(sector, mission.title, mission.route_geometry);
  return { ok: true, data: kml };
}

async function getLatestCachedWeatherTimestamp() {
  const row = await get('SELECT MAX(timestamp) AS cachedAt FROM weather_logs');
  return row?.cachedAt ?? null;
}

async function syncWeatherAPI(sessionOperatorId, sessionRole, sectorId, lat, lon, options = {}) {
  if (!rbac.PERMISSIONS.weatherRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  try {
    const sector = await get(`SELECT * FROM sectors WHERE id = ? AND ${ACTIVE_SECTOR_SQL}`, [sectorId]);
    if (!sector) return { ok: false, error: 'Сектор не найден.' };

    const result = await fetchWeatherCascade(lat, lon, {
      radiusKm: sector.radius_km,
      suppressLog: options.suppressLog === true,
      timeoutMs: options.timeoutMs,
    });
    const id = uuidv4();
    await run(
      `INSERT INTO weather_logs (id, sector_id, wind_speed, temperature, precipitation, weather_source, timestamp, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`,
      [
        id,
        sectorId,
        result.wind_speed,
        result.temperature,
        result.precipitation,
        result.source_used,
      ],
    );

    const log = await get('SELECT * FROM weather_logs WHERE id = ?', [id]);
    return { ok: true, data: log, source: result.source_used };
  } catch (error) {
    if (error instanceof OfflineWeatherError || error?.code === 'OFFLINE_WEATHER') {
      return { ok: false, error: error.message, code: 'OFFLINE_WEATHER' };
    }
    return { ok: false, error: error.message };
  }
}

function buildCachedWeatherResponse({ sectors, results, cachedAt, failureReason }) {
  return {
    ok: true,
    data: results,
    syncedAt: new Date().toISOString(),
    freshCount: 0,
    cachedCount: sectors.length,
    totalSectors: sectors.length,
    sourcesUsed: [],
    isCached: true,
    cachedAt,
    failureReason,
  };
}

async function syncAllSectorsWeather(sessionOperatorId, sessionRole) {
  const sectors = await all(`SELECT id, center_lat, center_lon FROM sectors WHERE ${ACTIVE_SECTOR_SQL}`);

  if (sectors.length === 0) {
    return {
      ok: true,
      data: [],
      syncedAt: new Date().toISOString(),
      freshCount: 0,
      totalSectors: 0,
      sourcesUsed: [],
      isCached: false,
    };
  }

  const bulkOptions = { suppressLog: true, timeoutMs: 8000 };
  const results = [];
  const sourcesUsed = new Set();

  const probe = await syncWeatherAPI(
    sessionOperatorId,
    sessionRole,
    sectors[0].id,
    sectors[0].center_lat,
    sectors[0].center_lon,
    bulkOptions,
  );
  results.push(probe);

  if (probe.ok) {
    if (probe.source) sourcesUsed.add(probe.source);
  } else if (probe.code === 'OFFLINE_WEATHER') {
    const cachedAt = await getLatestCachedWeatherTimestamp();
    if (cachedAt) {
      return buildCachedWeatherResponse({
        sectors,
        results,
        cachedAt,
        failureReason: 'Погодные API недоступны.',
      });
    }
    return {
      ok: false,
      error: 'OFFLINE_WEATHER',
      message: 'Все погодные API недоступны. Введите данные вручную для допуска к полётам.',
    };
  }

  for (let index = 1; index < sectors.length; index += 1) {
    const sector = sectors[index];
    const result = await syncWeatherAPI(
      sessionOperatorId,
      sessionRole,
      sector.id,
      sector.center_lat,
      sector.center_lon,
      bulkOptions,
    );
    results.push(result);
    if (result.ok && result.source) {
      sourcesUsed.add(result.source);
    }
  }

  const freshCount = results.filter((r) => r.ok).length;

  if (freshCount === 0) {
    const cachedAt = await getLatestCachedWeatherTimestamp();
    if (cachedAt) {
      return buildCachedWeatherResponse({
        sectors,
        results,
        cachedAt,
        failureReason: 'Не удалось обновить метеоданные из внешних источников.',
      });
    }
    return {
      ok: false,
      error: 'OFFLINE_WEATHER',
      message: 'Все погодные API недоступны. Введите данные вручную для допуска к полётам.',
    };
  }

  return {
    ok: true,
    data: results,
    syncedAt: new Date().toISOString(),
    freshCount,
    totalSectors: sectors.length,
    sourcesUsed: [...sourcesUsed],
    isCached: false,
  };
}

async function insertManualWeather(sessionOperatorId, sessionRole, sectorId, windSpeed, temperature, precipitation) {
  if (!rbac.PERMISSIONS.manualWeather.includes(sessionRole)) {
    return { ok: false, error: 'Доступ запрещён.' };
  }
  const id = uuidv4();
  await run(
    `INSERT INTO weather_logs (id, sector_id, wind_speed, temperature, precipitation, weather_source, timestamp, sync_status)
     VALUES (?, ?, ?, ?, ?, 'Manual', NOW(), 1)`,
    [id, sectorId, windSpeed, temperature, precipitation],
  );
  const log = await get('SELECT * FROM weather_logs WHERE id = ?', [id]);
  await logAction(sessionOperatorId, `Ручной ввод метеоданных для сектора ID ${sectorId}`);
  return { ok: true, data: log };
}

async function getWeather(lat, lon) {
  try {
    const result = await fetchWeatherCascade(lat, lon);
    return {
      ok: true,
      data: {
        wind_speed: result.wind_speed,
        temperature: result.temperature,
        precipitation: result.precipitation,
        timestamp: new Date().toISOString(),
        isCached: false,
      },
      source: result.source_used,
      coordinates: { lat: parseFloat(lat), lon: parseFloat(lon) },
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  getSectorsRisk,
  createSector,
  updateSectorBoundary,
  deleteSector,
  importSectorsFromKmlContent,
  exportSectorsKml,
  exportMissionKml,
  syncWeatherAPI,
  syncAllSectorsWeather,
  insertManualWeather,
  getWeather,
};
