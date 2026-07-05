/** Допустимые координаты WGS-84 (весь земной шар) */
export const GEO_BOUNDS = {
  latMin: -90,
  latMax: 90,
  lonMin: -180,
  lonMax: 180,
} as const;

export interface GeoValidationResult {
  ok: boolean;
  message?: string;
  suggestSwap?: boolean;
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Похоже, что широту и долготу перепутали местами */
export function looksLikeSwappedCoords(lat: number, lon: number): boolean {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  return (Math.abs(lat) > 90 && Math.abs(lon) <= 90) || Math.abs(lon) > 180;
}

export function validateSectorCoords(lat: number, lon: number): GeoValidationResult {
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return { ok: false, message: 'Координаты должны быть числами.' };
  }

  if (looksLikeSwappedCoords(lat, lon)) {
    return {
      ok: false,
      suggestSwap: true,
      message:
        `Похоже, широта и долгота перепутаны: ${lat} / ${lon}. ` +
        'Широта: −90…90°, долгота: −180…180°. В KML/Google Earth порядок: долгота, широта.',
    };
  }

  const latOk = inRange(lat, GEO_BOUNDS.latMin, GEO_BOUNDS.latMax);
  const lonOk = inRange(lon, GEO_BOUNDS.lonMin, GEO_BOUNDS.lonMax);

  if (!latOk || !lonOk) {
    const parts: string[] = [];
    if (!latOk) {
      parts.push(`широта ${lat}° вне диапазона ${GEO_BOUNDS.latMin}…${GEO_BOUNDS.latMax}°`);
    }
    if (!lonOk) {
      parts.push(`долгота ${lon}° вне диапазона ${GEO_BOUNDS.lonMin}…${GEO_BOUNDS.lonMax}°`);
    }
    return {
      ok: false,
      message: `${parts.join('; ')}. Проверьте координаты на карте или в KML.`,
    };
  }

  return { ok: true };
}

export function formatBoundsHint(): string {
  return `WGS-84: широта ${GEO_BOUNDS.latMin}…${GEO_BOUNDS.latMax}°, долгота ${GEO_BOUNDS.lonMin}…${GEO_BOUNDS.lonMax}°`;
}
