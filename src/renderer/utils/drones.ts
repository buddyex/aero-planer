import type { Drone, DroneStatus } from '../types';
import type { DroneRow } from '../../shared/types/api.types';

/** Нормализация статуса из БД (legacy-значения и пробелы) */
export function normalizeDroneStatus(status: unknown): DroneStatus {
  const raw = String(status ?? '').trim();
  const legacyMap: Record<string, DroneStatus> = {
    Готов: 'Готов',
    Запланирован: 'Запланирован',
    'На ТО': 'На ТО',
    'На обслуживании': 'На ТО',
    Ремонт: 'Ремонт',
    Диагностика: 'Диагностика',
    'В полете': 'В полете',
    'В полёте': 'В полете',
    Списан: 'Списан',
  };
  return legacyMap[raw] ?? 'Готов';
}

export function mapDroneRow(row: DroneRow | Record<string, unknown>): Drone {
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
    photo_url: row.photo_url != null && String(row.photo_url).trim() ? String(row.photo_url) : null,
    written_off_at: row.written_off_at != null ? String(row.written_off_at) : null,
    written_off_reason: row.written_off_reason != null ? String(row.written_off_reason) : null,
  };
}

/** Absolute or proxied URL for a drone photo stored as `/uploads/...`. */
export function resolveDronePhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  if (/^https?:\/\//i.test(apiBase)) {
    try {
      return `${new URL(apiBase).origin}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
    } catch {
      return photoUrl;
    }
  }
  return photoUrl;
}

export function countDronesByStatus(drones: Drone[], status: DroneStatus): number {
  return drones.filter((d) => d.status === status).length;
}
