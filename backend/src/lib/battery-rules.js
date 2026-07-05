const BATTERY_INSPECTION_CYCLE_INTERVAL = 50;
const BATTERY_MIN_CAPACITY_PERCENT = 80;

function requiresInspectionAtCycle(cycleCount) {
  return cycleCount > 0 && cycleCount % BATTERY_INSPECTION_CYCLE_INTERVAL === 0;
}

function isBatteryAvailableForMission(status) {
  return status === 'Отлично';
}

function validateBatteryInspectionPayload(payload = {}, batteryStatus = '') {
  if (batteryStatus !== 'Требуется проверка') {
    return {
      ok: false,
      error: `Проверка доступна только для АКБ со статусом «Требуется проверка» (текущий: «${batteryStatus}»).`,
    };
  }

  const result = String(payload.result ?? '').trim();
  if (result !== 'Пройдена' && result !== 'Не пройдена') {
    return { ok: false, error: 'Укажите результат проверки: «Пройдена» или «Не пройдена».' };
  }

  const capacityPercent = Number(payload.capacity_percent);
  if (!Number.isFinite(capacityPercent) || capacityPercent < 0 || capacityPercent > 100) {
    return { ok: false, error: 'Укажите фактическую ёмкость в процентах (0–100).' };
  }

  if (result === 'Пройдена') {
    if (
      !payload.visual_ok ||
      !payload.connectors_ok ||
      !payload.balance_ok ||
      !payload.test_cycle_ok
    ) {
      return {
        ok: false,
        error: 'Для результата «Пройдена» все пункты чек-листа должны быть отмечены.',
      };
    }
    if (capacityPercent < BATTERY_MIN_CAPACITY_PERCENT) {
      return {
        ok: false,
        error: `Ёмкость ниже допустимого порога (${BATTERY_MIN_CAPACITY_PERCENT}%). АКБ не может быть допущена к эксплуатации.`,
      };
    }
  } else if (!String(payload.notes ?? '').trim()) {
    return { ok: false, error: 'При результате «Не пройдена» необходимо указать комментарий.' };
  }

  return { ok: true };
}

module.exports = {
  BATTERY_INSPECTION_CYCLE_INTERVAL,
  BATTERY_MIN_CAPACITY_PERCENT,
  requiresInspectionAtCycle,
  isBatteryAvailableForMission,
  validateBatteryInspectionPayload,
};
