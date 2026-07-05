import type { Mission, MissionStatus } from '../types';
import { parseMissionTime } from './weather';

export function formatMissionId(id: string): string {
  if (!id) return '—';
  return id.length > 8 ? id.slice(0, 8) : id;
}

function missionDayKey(startTime: string): string {
  const d = parseMissionTime(startTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatMissionDayForSheet(startTime: string): string {
  const d = parseMissionTime(startTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Номер полётного листа: ПЛ-ДД.ММ.ГГГГ-NNN (порядковый номер миссии за день старта). */
export function getFlightSheetNumber(
  mission: Pick<Mission, 'id' | 'start_time'>,
  allMissions: Pick<Mission, 'id' | 'start_time'>[] = [],
): string {
  const dayKey = missionDayKey(mission.start_time);
  const pool = allMissions.length > 0 ? allMissions : [mission];

  const sameDay = pool.filter((m) => missionDayKey(m.start_time) === dayKey);
  sameDay.sort((a, b) => {
    const timeDiff =
      parseMissionTime(a.start_time).getTime() - parseMissionTime(b.start_time).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  const index = sameDay.findIndex((m) => m.id === mission.id);
  const seq = index >= 0 ? index + 1 : sameDay.length + 1;
  const datePart = formatMissionDayForSheet(mission.start_time);

  return `ПЛ-${datePart}-${String(seq).padStart(3, '0')}`;
}

export const MISSION_STATUS_SHORT: Record<MissionStatus, string> = {
  'Ожидает утверждения': 'На согл.',
  'К выполнению': 'К выполнению',
  Выполняется: 'В работе',
  Завершено: 'Готово',
  Отменено: 'Отмена',
  Отклонено: 'Отклонено',
};

/** Статус занятости оператора в контексте конкретной миссии (не зависит от рассинхрона БД). */
export function getOperatorAssignmentStatus(
  mission: Pick<Mission, 'status'>,
): 'Свободен' | 'Запланирован' | 'В миссии' | null {
  switch (mission.status) {
    case 'Выполняется':
      return 'В миссии';
    case 'К выполнению':
    case 'Ожидает утверждения':
      return 'Запланирован';
    default:
      return null;
  }
}

/** Подпись кнопки перехода в целевой статус (не текущий). */
export const MISSION_TRANSITION_LABEL: Partial<Record<MissionStatus, string>> = {
  Выполняется: 'Запустить миссию',
  Завершено: 'Завершить миссию',
};

export function missionStatusClass(status: MissionStatus): string {
  switch (status) {
    case 'Ожидает утверждения':
      return 'mission-status--pending';
    case 'К выполнению':
      return 'mission-status--planned';
    case 'Выполняется':
      return 'mission-status--active';
    case 'Завершено':
      return 'mission-status--done';
    case 'Отменено':
      return 'mission-status--cancelled';
    case 'Отклонено':
      return 'mission-status--rejected';
    default:
      return '';
  }
}

export function isEditableMissionStatus(status: MissionStatus): boolean {
  return status === 'К выполнению' || status === 'Ожидает утверждения';
}
