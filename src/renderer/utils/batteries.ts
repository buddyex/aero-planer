import type { Battery } from '../types';

const BATTERY_INSPECTION_CYCLE_INTERVAL = 50;

export function formatBatteryOptionLabel(
  battery: Pick<Battery, 'serial_number' | 'type' | 'capacity' | 'cycle_count'>,
): string {
  return `${battery.serial_number} — ${battery.type} — ${battery.capacity.toLocaleString('ru-RU')} мАч — ${battery.cycle_count} ц.`;
}

export function isBatteryNearInspection(cycleCount: number): boolean {
  const mod = cycleCount % BATTERY_INSPECTION_CYCLE_INTERVAL;
  return mod >= 45 && mod < BATTERY_INSPECTION_CYCLE_INTERVAL;
}

export function isBatterySelectableForMission(battery: Pick<Battery, 'status' | 'on_active_mission'>): boolean {
  return battery.status === 'Отлично' && !battery.on_active_mission;
}

export function getBatteryStatusSuffix(battery: Pick<Battery, 'status' | 'on_active_mission'>): string | null {
  if (battery.status === 'Требуется проверка') return ' (Требуется проверка)';
  if (battery.status === 'Списано') return ' (Списано)';
  if (battery.on_active_mission) return ' (В миссии)';
  if (battery.status !== 'Отлично') return ` (${battery.status})`;
  return null;
}
