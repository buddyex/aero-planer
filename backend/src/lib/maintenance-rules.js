const MAINTENANCE_FLIGHT_HOURS_LIMIT = 100;

function isDroneBlockedByFlightHours(flightHours) {
  return flightHours >= MAINTENANCE_FLIGHT_HOURS_LIMIT;
}

function isDroneNearMaintenance(flightHours) {
  const hours = flightHours ?? 0;
  return hours > 90 && hours < MAINTENANCE_FLIGHT_HOURS_LIMIT;
}

module.exports = {
  MAINTENANCE_FLIGHT_HOURS_LIMIT,
  isDroneBlockedByFlightHours,
  isDroneNearMaintenance,
};
