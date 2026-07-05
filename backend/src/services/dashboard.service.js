const { get, all } = require('../db/pool');
const rbac = require('../lib/rbac');

async function getDashboardStats(sessionRole) {
  if (!rbac.PERMISSIONS.dashboardRead.includes(sessionRole)) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const stats = await get(`
    SELECT
      (SELECT COUNT(*) FROM missions WHERE status = 'К выполнению') AS planned_missions,
      (SELECT COUNT(*) FROM missions WHERE status = 'Выполняется') AS active_missions,
      (SELECT COUNT(*) FROM missions WHERE status = 'Завершено') AS completed_missions,
      (SELECT COUNT(*) FROM missions WHERE status = 'Ожидает утверждения') AS pending_approvals,
      (SELECT COUNT(*) FROM drones WHERE status = 'Готов') AS drones_ready,
      (SELECT COUNT(*) FROM drones WHERE status = 'В полете') AS drones_in_air,
      (SELECT COUNT(*) FROM drones WHERE status = 'Запланирован') AS drones_planned,
      (SELECT COUNT(*) FROM drones WHERE status = 'На ТО') AS drones_on_maintenance,
      (SELECT COUNT(*) FROM drones WHERE status = 'Ремонт') AS drones_in_repair,
      (SELECT COUNT(*) FROM drones WHERE status = 'Диагностика') AS drones_in_diagnostics,
      (SELECT COUNT(*) FROM sectors WHERE risk_level = 'Высокий' AND is_active = 1) AS high_risk_sectors,
      (SELECT COUNT(*) FROM operators WHERE role = 'Оператор' AND duty_status = 'В миссии') AS operators_in_mission
  `);

  return { ok: true, data: stats };
}

module.exports = { getDashboardStats };
