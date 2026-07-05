import type { Precipitation } from '../types';
import { formatMetric } from './weather';

export type MissionWeatherRiskLevel = 'critical' | 'warning' | 'ok' | 'unknown';

export interface MissionWeatherRisk {
  level: MissionWeatherRiskLevel;
  message: string;
  windBlocked: boolean;
}

export function evaluateMissionWeatherRisk(
  windSpeed: number | undefined,
  maxWindSpeed: number | undefined,
  precipitation: Precipitation | undefined,
): MissionWeatherRisk {
  if (windSpeed == null || maxWindSpeed == null) {
    return {
      level: 'unknown',
      message: 'Нет данных о погоде или ТТХ борта для оценки риска.',
      windBlocked: false,
    };
  }

  if (windSpeed > maxWindSpeed) {
    return {
      level: 'critical',
      message: `КРИТИЧЕСКИЙ РИСК: Ветер в секторе (${formatMetric(windSpeed)} м/с) превышает допуск БПЛА (${formatMetric(maxWindSpeed)} м/с)`,
      windBlocked: true,
    };
  }

  if (precipitation === 'Дождь' || precipitation === 'Снег') {
    return {
      level: 'warning',
      message: 'ПРЕДУПРЕЖДЕНИЕ: Осадки. Требуется влагозащита.',
      windBlocked: false,
    };
  }

  return {
    level: 'ok',
    message: 'Полет разрешен',
    windBlocked: false,
  };
}

export function buildBlockedLaunchAuditMessage(droneModelName: string): string {
  return `Системой предотвращен запуск ${droneModelName} из-за погодных условий`;
}

export async function logBlockedLaunchAttempt(
  _droneModelName: string,
  _operatorId?: number | null,
): Promise<void> {
  // Аудит записывается на стороне main process при отклонении запуска.
}
