import type { Battery } from '../types';

export function formatBatteryOptionLabel(battery: Pick<Battery, 'serial_number' | 'type' | 'capacity' | 'cycle_count'>): string {
  return `${battery.serial_number} — ${battery.type} — ${battery.capacity.toLocaleString('ru-RU')} мАч — ${battery.cycle_count} ц.`;
}
