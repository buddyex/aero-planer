import type { OperatorRole } from '../../renderer/types';

export const OPERATOR_ROLES: OperatorRole[] = [
  'Администратор',
  'Руководитель',
  'Техник',
  'Оператор',
];

export const RBAC_PERMISSIONS = {
  manageOperators: ['Администратор'] as OperatorRole[],
  maintenanceWrite: ['Администратор', 'Техник'] as OperatorRole[],
  fleetWrite: ['Руководитель', 'Техник'] as OperatorRole[],
  missionWrite: ['Администратор', 'Руководитель'] as OperatorRole[],
  missionSubmit: ['Оператор'] as OperatorRole[],
  missionApprove: ['Администратор', 'Руководитель'] as OperatorRole[],
  sectorWrite: ['Администратор', 'Руководитель', 'Оператор'] as OperatorRole[],
  manualWeather: ['Администратор', 'Руководитель', 'Оператор'] as OperatorRole[],
  forceWeatherSync: ['Администратор'] as OperatorRole[],
  listOperators: ['Администратор', 'Руководитель'] as OperatorRole[],
  syncAdmin: ['Администратор'] as OperatorRole[],
  dashboardRead: ['Администратор', 'Руководитель', 'Оператор'] as OperatorRole[],
  scheduleRead: ['Администратор', 'Руководитель', 'Оператор'] as OperatorRole[],
  fleetRead: ['Администратор', 'Руководитель', 'Техник'] as OperatorRole[],
  maintenanceRead: ['Администратор', 'Техник'] as OperatorRole[],
  weatherRead: ['Администратор', 'Руководитель', 'Оператор'] as OperatorRole[],
};

export function hasRole(role: OperatorRole, allowed: OperatorRole[]): boolean {
  return allowed.includes(role);
}
