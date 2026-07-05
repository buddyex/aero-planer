const { validateDroneStatusOnCreate } = require('../backend/src/lib/domain');
const pinAuth = require('../backend/src/lib/pin-auth');
const rbac = require('../backend/src/lib/rbac');

describe('pin-auth', () => {
  test('hash and verify pin', () => {
    const salt = pinAuth.generateSalt();
    const hash = pinAuth.hashPin('1234', salt);
    expect(pinAuth.verifyPin('1234', hash, salt)).toBe(true);
    expect(pinAuth.verifyPin('9999', hash, salt)).toBe(false);
  });
});

describe('rbac', () => {
  test('canManageMission allows operator only own missions', () => {
    expect(rbac.canManageMission('Оператор', 2, 2)).toBe(true);
    expect(rbac.canManageMission('Оператор', 2, 3)).toBe(false);
    expect(rbac.canManageMission('Руководитель', 1, 99)).toBe(true);
  });

  test('canStartMission allows only assigned operator', () => {
    expect(rbac.canStartMission('Оператор', 2, 2)).toBe(true);
    expect(rbac.canStartMission('Оператор', 2, 3)).toBe(false);
    expect(rbac.canStartMission('Руководитель', 1, 99)).toBe(false);
    expect(rbac.canStartMission('Администратор', 1, 99)).toBe(false);
  });

  test('canCancelMission allows supervisor and assigned operator', () => {
    expect(rbac.canCancelMission('Руководитель', 1, 99)).toBe(true);
    expect(rbac.canCancelMission('Оператор', 2, 2)).toBe(true);
    expect(rbac.canCancelMission('Оператор', 2, 3)).toBe(false);
  });

  test('canTransitionMissionStatus blocks supervisor from starting mission', () => {
    expect(rbac.canTransitionMissionStatus('Руководитель', 1, 99, 'Выполняется')).toBe(false);
    expect(rbac.canTransitionMissionStatus('Руководитель', 1, 99, 'Отменено')).toBe(true);
  });

  test('missionSubmit and missionApprove permissions', () => {
    expect(rbac.PERMISSIONS.missionSubmit).toContain('Оператор');
    expect(rbac.PERMISSIONS.missionApprove).toContain('Руководитель');
    expect(rbac.PERMISSIONS.missionApprove).toContain('Администратор');
  });
});

describe('domain drone rules', () => {
  test('addDrone ignores non-ready status', () => {
    expect(validateDroneStatusOnCreate('Готов')).toBe(true);
    expect(validateDroneStatusOnCreate(undefined)).toBe(true);
    expect(validateDroneStatusOnCreate('На ТО')).toBe(false);
  });
});
