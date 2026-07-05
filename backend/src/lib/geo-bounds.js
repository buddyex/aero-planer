/** Допустимые координаты WGS-84 (весь земной шар) */
const GEO_BOUNDS = {
  latMin: -90,
  latMax: 90,
  lonMin: -180,
  lonMax: 180,
};

function inRange(value, min, max) {
  return value >= min && value <= max;
}

function looksLikeSwappedCoords(lat, lon) {
  return (Math.abs(lat) > 90 && Math.abs(lon) <= 90) || Math.abs(lon) > 180;
}

function validateCoords(lat, lon) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { ok: false, message: 'Координаты должны быть числами.' };
  }

  if (looksLikeSwappedCoords(latitude, longitude)) {
    return {
      ok: false,
      message:
        `Похоже, широта и долгота перепутаны (${latitude}, ${longitude}). ` +
        'Широта: −90…90°, долгота: −180…180°. В KML порядок: долгота, широта.',
    };
  }

  if (!inRange(latitude, GEO_BOUNDS.latMin, GEO_BOUNDS.latMax)) {
    return {
      ok: false,
      message: `Широта ${latitude}° вне допустимого диапазона ${GEO_BOUNDS.latMin}…${GEO_BOUNDS.latMax}°.`,
    };
  }

  if (!inRange(longitude, GEO_BOUNDS.lonMin, GEO_BOUNDS.lonMax)) {
    return {
      ok: false,
      message: `Долгота ${longitude}° вне допустимого диапазона ${GEO_BOUNDS.lonMin}…${GEO_BOUNDS.lonMax}°.`,
    };
  }

  return { ok: true, latitude, longitude };
}

function validatePolygon(ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return { ok: false, message: 'Полигон должен содержать минимум 3 точки.' };
  }

  const normalized = [];
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) {
      return { ok: false, message: 'Некорректный формат точки полигона.' };
    }
    const check = validateCoords(point[0], point[1]);
    if (!check.ok) {
      return check;
    }
    normalized.push([check.latitude, check.longitude]);
  }

  return { ok: true, ring: normalized };
}

function computeCentroid(ring) {
  let latSum = 0;
  let lonSum = 0;
  const count = ring.length;
  for (const [lat, lon] of ring) {
    latSum += lat;
    lonSum += lon;
  }
  return { lat: latSum / count, lon: lonSum / count };
}

function computeBoundingRadiusKm(ring, centerLat, centerLon) {
  let maxDist = 0;
  for (const [lat, lon] of ring) {
    const dLat = lat - centerLat;
    const dLon = lon - centerLon;
    const distKm = Math.sqrt(dLat ** 2 + dLon ** 2) * 111;
    if (distKm > maxDist) maxDist = distKm;
  }
  return Math.max(5, Math.min(60, Math.ceil(maxDist)));
}

module.exports = {
  GEO_BOUNDS,
  validateCoords,
  validatePolygon,
  computeCentroid,
  computeBoundingRadiusKm,
};
