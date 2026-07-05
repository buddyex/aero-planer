const {
  isDroneBlockedByFlightHours,
  MAINTENANCE_FLIGHT_HOURS_LIMIT,
} = require('../backend/src/lib/maintenance-rules');

describe('Maintenance: блокировка по налёту', () => {
  test('flight_hours = 100 → не заблокирован', () => {
    expect(isDroneBlockedByFlightHours(100)).toBe(false);
  });

  test('flight_hours = 100.01 → заблокирован', () => {
    expect(isDroneBlockedByFlightHours(100.01)).toBe(true);
  });

  test('flight_hours = 150, status На ТО → всё равно заблокирован для полёта', () => {
    expect(isDroneBlockedByFlightHours(150)).toBe(true);
  });

  test('порог = 100', () => {
    expect(MAINTENANCE_FLIGHT_HOURS_LIMIT).toBe(100);
  });
});
