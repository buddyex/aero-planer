const operatorService = require('../backend/src/services/operator.service');

jest.mock('../backend/src/db/pool', () => ({
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn(),
}));

const pool = require('../backend/src/db/pool');

describe('operator.service KPIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getOperatorKPIs для администратора возвращает operational overview', async () => {
    pool.get
      .mockResolvedValueOnce({ id: 1, role: 'Администратор' })
      .mockResolvedValueOnce({
        planned_missions: 3,
        active_missions: 1,
        completed_missions: 5,
        drones_ready: 4,
        drones_in_air: 0,
        drones_planned: 1,
        drones_on_maintenance: 2,
        drones_in_repair: 0,
        drones_in_diagnostics: 1,
        high_risk_sectors: 2,
        operators_in_mission: 1,
      });

    const result = await operatorService.getOperatorKPIs(1);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      planned_missions: 3,
      active_missions: 1,
      completed_missions: 5,
      drones_ready: 4,
      drones_in_air: 0,
      drones_planned: 1,
      drones_on_maintenance: 2,
      drones_in_repair: 0,
      drones_in_diagnostics: 1,
      high_risk_sectors: 2,
      operators_in_mission: 1,
    });
  });

  test('getOperatorKPIs для оператора возвращает персональные KPI', async () => {
    pool.get
      .mockResolvedValueOnce({ id: 2, role: 'Оператор' })
      .mockResolvedValueOnce({
        planned_missions: 2,
        active_missions: 1,
        completed_missions: 4,
        total_actions: 12,
      });

    const result = await operatorService.getOperatorKPIs(2);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      planned_missions: 2,
      active_missions: 1,
      completed_missions: 4,
      total_actions: 12,
    });
  });

  test('getOperatorKPIs для техника возвращает KPI обслуживания', async () => {
    pool.get
      .mockResolvedValueOnce({ id: 3, role: 'Техник' })
      .mockResolvedValueOnce({
        maintenance_records: 7,
        open_maintenance_sessions: 2,
        battery_inspections: 5,
        batteries_pending_inspection: 1,
      });

    const result = await operatorService.getOperatorKPIs(3);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      maintenance_records: 7,
      open_maintenance_sessions: 2,
      battery_inspections: 5,
      batteries_pending_inspection: 1,
    });
  });

  test('getOperatorProfile включает kpis', async () => {
    pool.get
      .mockResolvedValueOnce({
        id: 2,
        full_name: 'Иванов',
        login: 'ivanov',
        role: 'Оператор',
        duty_status: 'Свободен',
      })
      .mockResolvedValueOnce({
        planned_missions: 1,
        active_missions: 0,
        completed_missions: 2,
        total_actions: 3,
      });

    const result = await operatorService.getOperatorProfile(1, 2);
    expect(result.ok).toBe(true);
    expect(result.data.kpis).toEqual({
      planned_missions: 1,
      active_missions: 0,
      completed_missions: 2,
      total_actions: 3,
    });
  });
});
