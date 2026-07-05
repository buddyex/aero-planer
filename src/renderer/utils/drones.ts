import type { Drone, DroneStatus } from '../types';

/** Нормализация статуса из БД (legacy-значения и пробелы) */
export function normalizeDroneStatus(status: unknown): DroneStatus {
  const raw = String(status ?? '').trim();
  const legacyMap: Record<string, DroneStatus> = {
    Готов: 'Готов',
    Запланирован: 'Запланирован',
    'На ТО': 'На ТО',
    'На обслуживании': 'На ТО',
    Ремонт: 'Ремонт',
    Списан: 'Ремонт',
    Диагностика: 'Диагностика',
    'В полете': 'В полете',
    'В полёте': 'В полете',
  };
  return legacyMap[raw] ?? 'Готов';
}

export function mapDroneRow(row: Record<string, unknown>): Drone {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    serial_number: String(row.serial_number ?? ''),
    max_wind_speed: Number(row.max_wind_speed),
    battery_capacity: Number(row.battery_capacity),
    payload_capacity: Number(row.payload_capacity),
    flight_time_max: Number(row.flight_time_max),
    flight_hours: row.flight_hours != null ? Number(row.flight_hours) : 0,
    status: normalizeDroneStatus(row.status),
  };
}

export function countDronesByStatus(drones: Drone[], status: DroneStatus): number {
  return drones.filter((d) => d.status === status).length;
}
