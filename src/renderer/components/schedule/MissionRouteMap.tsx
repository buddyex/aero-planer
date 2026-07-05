import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Polygon, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import type { Sector } from '../../types';
import {
  kmToMeters,
  parseSectorPolygon,
  RISK_COLORS,
  UDMURT_MAP_CENTER,
  UDMURT_MAP_ZOOM,
} from '../../utils/map';
import { OfflineTileLayer } from '../map/OfflineTileLayer';
import './MissionRouteMap.css';

interface MissionRouteMapProps {
  sector: Sector | undefined;
  routeGeometry: string | null;
  drawEnabled: boolean;
  onRouteChange: (geoJson: string | null) => void;
}

function parseRouteLatLngs(routeGeometry: string | null): [number, number][] {
  if (!routeGeometry) return [];
  try {
    const parsed = JSON.parse(routeGeometry);
    const coords = parsed?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return [];
    return coords.map(([lon, lat]: [number, number]) => [lat, lon]);
  } catch {
    return [];
  }
}

function RouteDrawControl({
  enabled,
  routeGeometry,
  onRouteChange,
}: {
  enabled: boolean;
  routeGeometry: string | null;
  onRouteChange: (geoJson: string | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const existing = parseRouteLatLngs(routeGeometry);
    if (existing.length >= 2) {
      const line = L.polyline(existing, { color: '#38bdf8', weight: 3 });
      drawnItems.addLayer(line);
    }

    const drawOptions: L.Control.DrawConstructorOptions = {
      position: 'topright',
      draw: {
        polygon: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
        polyline: enabled
          ? {
              shapeOptions: { color: '#38bdf8', weight: 3 },
            }
          : false,
      },
    };

    if (enabled) {
      drawOptions.edit = { featureGroup: drawnItems };
    }

    const drawControl = new L.Control.Draw(drawOptions);

    if (enabled) {
      map.addControl(drawControl);
    }

    const handleCreated = (event: L.LeafletEvent & { layer: L.Layer }) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      const geo = (event.layer as L.Polyline).toGeoJSON();
      onRouteChange(JSON.stringify(geo.geometry));
    };

    const handleEdited = () => {
      const layers = drawnItems.getLayers();
      if (layers.length === 0) {
        onRouteChange(null);
        return;
      }
      const geo = (layers[0] as L.Polyline).toGeoJSON();
      onRouteChange(JSON.stringify(geo.geometry));
    };

    const handleDeleted = () => {
      onRouteChange(null);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      if (enabled) {
        map.removeControl(drawControl);
      }
      map.removeLayer(drawnItems);
    };
  }, [map, enabled, routeGeometry, onRouteChange]);

  return null;
}

export function MissionRouteMap({
  sector,
  routeGeometry,
  drawEnabled,
  onRouteChange,
}: MissionRouteMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (sector?.center_lat != null && sector?.center_lon != null) {
      return [sector.center_lat, sector.center_lon];
    }
    return UDMURT_MAP_CENTER;
  }, [sector?.center_lat, sector?.center_lon]);

  const ring = sector ? parseSectorPolygon(sector) : null;
  const routeLatLngs = parseRouteLatLngs(routeGeometry);
  const sectorColor = sector ? RISK_COLORS[sector.risk_level] : '#64748b';

  return (
    <div className="mission-route-map">
      <MapContainer center={center} zoom={UDMURT_MAP_ZOOM + 1} className="mission-route-map__canvas">
        <OfflineTileLayer />
        {ring && ring.length >= 3 ? (
          <Polygon
            positions={ring}
            pathOptions={{
              color: sectorColor,
              fillColor: sectorColor,
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        ) : sector?.center_lat != null && sector.center_lon != null ? (
          <Circle
            center={[sector.center_lat, sector.center_lon]}
            radius={kmToMeters(sector.radius_km ?? 20)}
            pathOptions={{
              color: sectorColor,
              fillColor: sectorColor,
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        ) : null}
        {routeLatLngs.length >= 2 && !drawEnabled && (
          <Polyline positions={routeLatLngs} pathOptions={{ color: '#38bdf8', weight: 3 }} />
        )}
        <RouteDrawControl
          enabled={drawEnabled}
          routeGeometry={routeGeometry}
          onRouteChange={onRouteChange}
        />
      </MapContainer>
    </div>
  );
}
