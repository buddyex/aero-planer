import type { MissionStatus, OperatorRole } from '../types';
import { OPERATOR_ROLES } from '../types';

export type AppRoute =
  | 'dashboard'
  | 'schedule'
  | 'fleet'
  | 'maintenance'
  | 'weather'
  | 'profile'
  | 'personnel'
  | 'admin'
  | 'system';

/** RBAC: допустимые роли для каждого маршрута приложения */
export const ROUTE_ALLOWED_ROLES: Record<AppRoute, OperatorRole[]> = {
  dashboard: ['Администратор', 'Руководитель', 'Оператор'],
  schedule: ['Администратор', 'Руководитель', 'Оператор'],
  fleet: ['Администратор', 'Руководитель', 'Техник'],
  maintenance: ['Администратор', 'Техник'],
  weather: ['Администратор', 'Руководитель', 'Оператор'],
  profile: OPERATOR_ROLES,
  personnel: OPERATOR_ROLES,
  admin: ['Администратор'],
  system: ['Администратор'],
};

function buildRoleRoutes(): Record<OperatorRole, AppRoute[]> {
  const result = Object.fromEntries(
    OPERATOR_ROLES.map((role) => [role, [] as AppRoute[]]),
  ) as Record<OperatorRole, AppRoute[]>;

  for (const [route, roles] of Object.entries(ROUTE_ALLOWED_ROLES) as [AppRoute, OperatorRole[]][]) {
    for (const role of roles) {
      if (!result[role].includes(route)) {
        result[role].push(route);
      }
    }
  }

  return result;
}

const ROLE_ROUTES = buildRoleRoutes();

const ROLE_PERMISSIONS: Record<OperatorRole, string[]> = {
  Администратор: [
    'Полный доступ к системе',
    'Управление персоналом',
    'Центр мониторинга системы',
    'Метео-центр',
    'Принудительная синхронизация метео',
    'Создание миссий и секторов',
  ],
  Руководитель: [
    'Мониторинг дашборда и аналитики',
    'Управление расписанием миссий',
    'Метео-центр',
    'Управление флотом БПЛА',
  ],
  Техник: ['Управление флотом БПЛА', 'Журнал технического обслуживания'],
  Оператор: [
    'Мониторинг дашборда',
    'Просмотр расписания миссий',
    'Ручной ввод метеоданных',
    'Редактирование границ секторов и KML',
  ],
};

export function canAccessRoute(role: OperatorRole, route: AppRoute): boolean {
  return ROLE_ROUTES[role]?.includes(route) ?? false;
}

export function isRoleAllowed(role: OperatorRole, allowedRoles: OperatorRole[]): boolean {
  return allowedRoles.includes(role);
}

export function getRolePermissions(role: OperatorRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function getDefaultRouteForRole(role: OperatorRole): string {
  if (role === 'Техник') return '/fleet';
  if (canAccessRoute(role, 'dashboard')) return '/';
  return '/profile';
}

export function canCreateMissions(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Руководитель' || role === 'Оператор';
}

export function canApproveMission(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Руководитель';
}

export function canRejectMission(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Руководитель';
}

export function canViewAllMissions(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Руководитель';
}

export function filterMissionsForUser<T extends { operator_id: number }>(
  missions: T[],
  role: OperatorRole | undefined,
  userId: number | null | undefined,
): T[] {
  if (!role || canViewAllMissions(role) || userId == null) {
    return missions;
  }
  if (role === 'Оператор') {
    return missions.filter((mission) => mission.operator_id === userId);
  }
  return [];
}

function isAssignedMissionOperator(userId: number, missionOperatorId: number): boolean {
  return userId === missionOperatorId;
}

/** Запуск и завершение — только назначенный оператор миссии */
export function canStartMission(
  role: OperatorRole,
  userId: number,
  missionOperatorId: number,
): boolean {
  return role === 'Оператор' && isAssignedMissionOperator(userId, missionOperatorId);
}

export function canCompleteMission(
  role: OperatorRole,
  userId: number,
  missionOperatorId: number,
): boolean {
  return role === 'Оператор' && isAssignedMissionOperator(userId, missionOperatorId);
}

/** Отмена — руководитель/администратор или назначенный оператор */
export function canCancelMission(
  role: OperatorRole,
  userId: number,
  missionOperatorId: number,
): boolean {
  if (role === 'Администратор' || role === 'Руководитель') return true;
  if (role === 'Оператор') return isAssignedMissionOperator(userId, missionOperatorId);
  return false;
}

/** Редактирование миссии до запуска — руководитель или администратор */
export function canEditMission(role: OperatorRole, status?: MissionStatus): boolean {
  if (role !== 'Администратор' && role !== 'Руководитель') return false;
  if (!status) return true;
  return status === 'К выполнению' || status === 'Ожидает утверждения';
}

export function canTransitionMissionStatus(
  role: OperatorRole,
  userId: number,
  missionOperatorId: number,
  targetStatus: MissionStatus,
): boolean {
  switch (targetStatus) {
    case 'Выполняется':
      return canStartMission(role, userId, missionOperatorId);
    case 'Завершено':
      return canCompleteMission(role, userId, missionOperatorId);
    case 'Отменено':
      return canCancelMission(role, userId, missionOperatorId);
    default:
      return false;
  }
}

export function canManageMission(
  role: OperatorRole,
  userId: number,
  missionOperatorId: number,
): boolean {
  return (
    canStartMission(role, userId, missionOperatorId) ||
    canCompleteMission(role, userId, missionOperatorId) ||
    canCancelMission(role, userId, missionOperatorId)
  );
}

export function canDownloadFlightSheet(
  role: OperatorRole,
  userId: number,
  missionOperatorId: number,
  missionStatus: MissionStatus,
): boolean {
  if (missionStatus !== 'Завершено') return false;
  if (role === 'Администратор' || role === 'Руководитель') return true;
  if (role === 'Оператор') return userId === missionOperatorId;
  return false;
}

export function getAllowedMissionTransitions(status: MissionStatus): MissionStatus[] {
  switch (status) {
    case 'К выполнению':
      return ['Выполняется', 'Отменено'];
    case 'Выполняется':
      return ['Завершено', 'Отменено'];
    default:
      return [];
  }
}

export function canForceWeatherSync(role: OperatorRole): boolean {
  return role === 'Администратор';
}

export function canManualWeatherInput(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Руководитель' || role === 'Оператор';
}

export function canEditSectorBoundaries(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Руководитель' || role === 'Оператор';
}

export function canCompleteMaintenance(role: OperatorRole): boolean {
  return role === 'Администратор' || role === 'Техник';
}
