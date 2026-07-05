export const MAINTENANCE_FLIGHT_HOURS_LIMIT = 100;

export function isDroneBlockedByFlightHours(flightHours: number | undefined): boolean {
  return (flightHours ?? 0) > MAINTENANCE_FLIGHT_HOURS_LIMIT;
}
