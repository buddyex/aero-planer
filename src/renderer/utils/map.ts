import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import type { RiskLevel, Sector } from '../types';

/** Центр Удмуртской Республики (Ижевск) — Leaflet [lat, lon] */
export const UDMURT_MAP_CENTER: [number, number] = [56.85, 53.21];
/** MapLibre [lon, lat] */
export const UDMURT_MAP_CENTER_LNG_LAT: [number, number] = [53.21, 56.85];
export const UDMURT_MAP_ZOOM = 8;

const DARK_STYLE: StyleSpecification = {
  version: 8,
  name: 'aero-dark',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  layers: [
    {
      id: 'carto',
      type: 'raster',
      source: 'carto',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};

const LIGHT_STYLE: StyleSpecification = {
  version: 8,
  name: 'aero-light',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  layers: [
    {
      id: 'carto',
      type: 'raster',
      source: 'carto',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};

export const MAP_STYLES = {
  dark: DARK_STYLE,
  light: LIGHT_STYLE,
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  Низкий: '#22c55e',
  Средний: '#f59e0b',
  Высокий: '#ef4444',
};

/** Высота экструзии сектора (м) — намеренно крупная, чтобы объём читался на масштабе республики */
export const RISK_EXTRUSION_M: Record<RiskLevel, number> = {
  Низкий: 2800,
  Средний: 6500,
  Высокий: 12000,
};

export function kmToMeters(km: number): number {
  return km * 1000;
}

/** Полигон сектора: точки [lat, lon] (как в Leaflet / boundary_polygon) */
export function parseSectorPolygon(sector: {
  boundary_polygon?: string | null;
}): [number, number][] | null {
  if (!sector.boundary_polygon) return null;
  try {
    const parsed = JSON.parse(sector.boundary_polygon) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [Number(point[0]), Number(point[1])] as [number, number]);
  } catch {
    return null;
  }
}

/** Аппроксимация круга → кольцо GeoJSON [lon, lat] */
export function circleToLngLatRing(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 64,
): [number, number][] {
  const earthKm = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angular = radiusKm / earthKm;
  const ring: [number, number][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2),
      );
    ring.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return ring;
}

function riskKey(level: string | undefined): RiskLevel {
  if (level === 'Высокий' || level === 'Средний' || level === 'Низкий') return level;
  return 'Низкий';
}

export function sectorsToGeoJSON(
  sectors: Array<Sector & { center_lat: number; center_lon: number }>,
): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];

  for (const sector of sectors) {
    const risk = riskKey(sector.risk_level);
    const ringLatLon = parseSectorPolygon(sector);
    let lngLatRing: [number, number][];

    if (ringLatLon && ringLatLon.length >= 3) {
      lngLatRing = ringLatLon.map(([lat, lon]) => [lon, lat]);
      const first = lngLatRing[0];
      const last = lngLatRing[lngLatRing.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        lngLatRing = [...lngLatRing, first];
      }
    } else {
      lngLatRing = circleToLngLatRing(
        sector.center_lat,
        sector.center_lon,
        sector.radius_km ?? 20,
      );
    }

    features.push({
      type: 'Feature',
      id: sector.id,
      properties: {
        id: sector.id,
        name: sector.sector_name,
        risk_level: risk,
        color: RISK_COLORS[risk],
        height: RISK_EXTRUSION_M[risk],
        wind_speed: sector.wind_speed ?? null,
        temperature: sector.temperature ?? null,
        shape_type: ringLatLon && ringLatLon.length >= 3 ? 'polygon' : 'circle',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [lngLatRing],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
