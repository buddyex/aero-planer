const MAINTENANCE_FLIGHT_HOURS_LIMIT = 100;

function isDroneBlockedByFlightHours(flightHours) {
  return flightHours > MAINTENANCE_FLIGHT_HOURS_LIMIT;
}

module.exports = { MAINTENANCE_FLIGHT_HOURS_LIMIT, isDroneBlockedByFlightHours };
