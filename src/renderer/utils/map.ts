import type { RiskLevel } from '../types';

/** Центр Удмуртской Республики (Ижевск) */
export const UDMURT_MAP_CENTER: [number, number] = [56.85, 53.21];
export const UDMURT_MAP_ZOOM = 8;

export const RISK_COLORS: Record<RiskLevel, string> = {
  Низкий: '#22c55e',
  Средний: '#f59e0b',
  Высокий: '#ef4444',
};

export function kmToMeters(km: number): number {
  return km * 1000;
}

export function parseSectorPolygon(sector: {
  boundary_polygon?: string | null;
}): [number, number][] | null {
  if (!sector.boundary_polygon) return null;
  try {
    const parsed = JSON.parse(sector.boundary_polygon) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [Number(point[0]), Number(point[1])] as [number, number]);
  } catch {
    return null;
  }
}
