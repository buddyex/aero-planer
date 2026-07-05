import type { Precipitation, RiskLevel } from '../types';

export function calculateRisk(
  windSpeed: number,
  temperature: number,
  precipitation: Precipitation,
): RiskLevel {
  if (windSpeed > 14 || temperature < -20) return 'Высокий';
  if ((windSpeed >= 9 && windSpeed <= 14) || precipitation === 'Туман') return 'Средний';
  return 'Низкий';
}

/** Нормализует дату/время из API (ISO или «YYYY-MM-DD HH:mm:ss») в локальный формат БД. */
export function normalizeDateTime(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : formatDateTime(value);
  }

  const str = String(value).trim();
  if (!str) return '';

  if (str.includes('T')) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) return formatDateTime(parsed);
  }

  return str;
}

export function parseMissionTime(value: string | null | undefined): Date {
  if (!value?.trim()) return new Date(NaN);

  const trimmed = value.trim();
  if (trimmed.includes('T')) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const [datePart, timePart = '00:00:00'] = trimmed.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDisplayTime(value: string): string {
  const d = value.includes('T') ? new Date(value) : parseMissionTime(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMetric(value: number | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}
