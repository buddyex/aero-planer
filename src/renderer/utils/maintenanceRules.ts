export const MAINTENANCE_FLIGHT_HOURS_LIMIT = 100;

export function isDroneBlockedByFlightHours(flightHours: number | undefined): boolean {
  return (flightHours ?? 0) >= MAINTENANCE_FLIGHT_HOURS_LIMIT;
}

export function isDroneNearMaintenance(flightHours: number | undefined): boolean {
  const hours = flightHours ?? 0;
  return hours > 90 && hours < MAINTENANCE_FLIGHT_HOURS_LIMIT;
}
