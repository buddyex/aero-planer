const OPERATOR_ROLES = ['Администратор', 'Руководитель', 'Техник', 'Оператор'];

const ROLES = {
  ADMIN: 'Администратор',
  HEAD: 'Руководитель',
  TECH: 'Техник',
  OPERATOR: 'Оператор',
};

const PERMISSIONS = {
  manageOperators: [ROLES.ADMIN],
  maintenanceWrite: [ROLES.ADMIN, ROLES.TECH],
  fleetWrite: [ROLES.HEAD, ROLES.TECH],
  missionWrite: [ROLES.ADMIN, ROLES.HEAD],
  missionSubmit: [ROLES.OPERATOR],
  missionApprove: [ROLES.ADMIN, ROLES.HEAD],
  sectorWrite: [ROLES.ADMIN, ROLES.HEAD, ROLES.OPERATOR],
  manualWeather: [ROLES.ADMIN, ROLES.HEAD, ROLES.OPERATOR],
  forceWeatherSync: [ROLES.ADMIN],
  listOperators: [ROLES.ADMIN, ROLES.HEAD],
  syncAdmin: [ROLES.ADMIN],
  dashboardRead: [ROLES.ADMIN, ROLES.HEAD, ROLES.OPERATOR],
  scheduleRead: [ROLES.ADMIN, ROLES.HEAD, ROLES.OPERATOR],
  fleetRead: [ROLES.ADMIN, ROLES.HEAD, ROLES.TECH],
  maintenanceRead: [ROLES.ADMIN, ROLES.TECH],
  weatherRead: [ROLES.ADMIN, ROLES.HEAD, ROLES.OPERATOR],
  profileRead: OPERATOR_ROLES,
  messagesRead: OPERATOR_ROLES,
  messagesWrite: OPERATOR_ROLES,
};

function canViewAllMissions(role) {
  return role === ROLES.ADMIN || role === ROLES.HEAD;
}

function isAssignedMissionOperator(userId, missionOperatorId) {
  return userId === missionOperatorId;
}

function canStartMission(role, userId, missionOperatorId) {
  return role === ROLES.OPERATOR && isAssignedMissionOperator(userId, missionOperatorId);
}

function canCompleteMission(role, userId, missionOperatorId) {
  return role === ROLES.OPERATOR && isAssignedMissionOperator(userId, missionOperatorId);
}

function canCancelMission(role, userId, missionOperatorId) {
  if (role === ROLES.ADMIN || role === ROLES.HEAD) return true;
  if (role === ROLES.OPERATOR) return isAssignedMissionOperator(userId, missionOperatorId);
  return false;
}

function canManageMission(role, userId, missionOperatorId) {
  return (
    canStartMission(role, userId, missionOperatorId) ||
    canCompleteMission(role, userId, missionOperatorId) ||
    canCancelMission(role, userId, missionOperatorId)
  );
}

function canDownloadMissionDocuments(role, userId, missionOperatorId, missionStatus) {
  if (missionStatus !== 'Завершено') return false;
  if (role === ROLES.ADMIN || role === ROLES.HEAD) return true;
  if (role === ROLES.OPERATOR) return isAssignedMissionOperator(userId, missionOperatorId);
  return false;
}

function canTransitionMissionStatus(role, userId, missionOperatorId, targetStatus) {
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

module.exports = {
  OPERATOR_ROLES,
  ROLES,
  PERMISSIONS,
  canViewAllMissions,
  canStartMission,
  canCompleteMission,
  canCancelMission,
  canManageMission,
  canDownloadMissionDocuments,
  canTransitionMissionStatus,
};
