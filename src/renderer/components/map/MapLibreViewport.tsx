import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection, Polygon } from 'geojson';
import { useTheme } from '../../context/ThemeContext';
import {
  MAP_STYLES,
  UDMURT_MAP_CENTER_LNG_LAT,
  UDMURT_MAP_ZOOM,
} from '../../utils/map';
import type { MapSearchTarget } from './MapLocationSearch';
import 'maplibre-gl/dist/maplibre-gl.css';

const SECTORS_SOURCE = 'sectors';
const SECTORS_FILL = 'sectors-fill';
const SECTORS_EXTRUSION = 'sectors-extrusion';
const SECTORS_OUTLINE = 'sectors-outline';
const BUILDINGS_3D = 'aero-3d-buildings';

const DEFAULT_PITCH = 52;
const DEFAULT_BEARING = -18;

export interface SectorPopupActions {
  canEdit: boolean;
  canManage: boolean;
  onEdit: (sectorId: number) => void;
  onDelete: (sectorId: number, sectorName: string) => void;
  onExportKml: (sectorId: number) => void;
}

interface MapLibreViewportProps {
  sectorsGeoJson: FeatureCollection<Polygon>;
  pickMode: boolean;
  mapBlocked: boolean;
  flyTarget: MapSearchTarget | null;
  view3d: boolean;
  onPick: (lat: number, lon: number) => void;
  popupActions: SectorPopupActions;
}

function riskMod(level: string | undefined): 'high' | 'medium' | 'low' {
  if (level === 'Высокий') return 'high';
  if (level === 'Средний') return 'medium';
  return 'low';
}

function buildPopupHtml(
  props: Record<string, unknown>,
  canEdit: boolean,
  canManage: boolean,
): string {
  const name = String(props.name ?? 'Сектор');
  const risk = String(props.risk_level ?? 'Низкий');
  const shape = props.shape_type === 'polygon' ? 'полигон' : 'круг';
  const wind =
    props.wind_speed != null && props.wind_speed !== ''
      ? `${Number(props.wind_speed).toFixed(1)} м/с`
      : '—';
  const temp =
    props.temperature != null && props.temperature !== ''
      ? `${Number(props.temperature).toFixed(1)}°C`
      : '—';
  const id = Number(props.id);

  const buttons: string[] = [];
  if (canEdit || canManage) {
    buttons.push(`<button type="button" class="sector-map-popup__btn sector-map-popup__btn--export" data-action="export" data-id="${id}" title="Экспорт KML">
          <span class="sector-map-popup__btn-icon" aria-hidden>↓</span>KML
        </button>`);
  }
  if (canEdit) {
    buttons.push(`<button type="button" class="sector-map-popup__btn sector-map-popup__btn--edit" data-action="edit" data-id="${id}">
          Редактировать границы
        </button>`);
  }
  if (canManage) {
    buttons.push(`<button type="button" class="sector-map-popup__btn sector-map-popup__btn--delete" data-action="delete" data-id="${id}" data-name="${escapeAttr(name)}">
          Удалить
        </button>`);
  }
  const actions =
    buttons.length > 0 ? `<div class="sector-map-popup__actions">${buttons.join('')}</div>` : '';

  return `<div class="sector-map-popup sector-map-popup--${riskMod(risk)}">
    <div class="sector-map-popup__indicator" aria-hidden></div>
    <header class="sector-map-popup__header">
      <h3 class="sector-map-popup__name">${escapeHtml(name)}</h3>
      <span class="sector-map-popup__risk">${escapeHtml(risk)} риск</span>
    </header>
    <div class="sector-map-popup__metrics">
      <div class="sector-map-popup__metric">
        <span class="sector-map-popup__metric-label">Форма</span>
        <span class="sector-map-popup__metric-value">${shape}</span>
      </div>
      <div class="sector-map-popup__metric">
        <span class="sector-map-popup__metric-label">Ветер</span>
        <span class="sector-map-popup__metric-value">${wind}</span>
      </div>
      <div class="sector-map-popup__metric">
        <span class="sector-map-popup__metric-label">Темп.</span>
        <span class="sector-map-popup__metric-value">${temp}</span>
      </div>
    </div>
    ${actions}
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function findLabelLayerId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle().layers ?? [];
  for (const layer of layers) {
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      return layer.id;
    }
  }
  return undefined;
}

function addBuildings3D(map: maplibregl.Map) {
  if (map.getLayer(BUILDINGS_3D)) return;
  if (!map.getSource('openmaptiles')) return;

  const beforeId = findLabelLayerId(map);
  map.addLayer(
    {
      id: BUILDINGS_3D,
      source: 'openmaptiles',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'render_height'], 10],
          0,
          '#3d4a5c',
          40,
          '#5b6b82',
          120,
          '#7a8fa8',
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          0,
          15.5,
          ['coalesce', ['get', 'render_height'], 10],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    },
    beforeId,
  );

  if (map.getLayer('building')) {
    map.setLayoutProperty('building', 'visibility', 'none');
  }
}

function addSectorLayers(
  map: maplibregl.Map,
  data: FeatureCollection<Polygon>,
  view3d: boolean,
) {
  if (map.getSource(SECTORS_SOURCE)) {
    (map.getSource(SECTORS_SOURCE) as maplibregl.GeoJSONSource).setData(data);
    syncSectorLayerMode(map, view3d);
    return;
  }

  map.addSource(SECTORS_SOURCE, { type: 'geojson', data });

  const beforeId = findLabelLayerId(map);

  map.addLayer(
    {
      id: SECTORS_FILL,
      type: 'fill',
      source: SECTORS_SOURCE,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.22,
      },
      layout: { visibility: view3d ? 'none' : 'visible' },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: SECTORS_EXTRUSION,
      type: 'fill-extrusion',
      source: SECTORS_SOURCE,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.55,
      },
      layout: { visibility: view3d ? 'visible' : 'none' },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: SECTORS_OUTLINE,
      type: 'line',
      source: SECTORS_SOURCE,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2.2,
        'line-opacity': 0.95,
      },
    },
    beforeId,
  );
}

function syncSectorLayerMode(map: maplibregl.Map, view3d: boolean) {
  if (map.getLayer(SECTORS_FILL)) {
    map.setLayoutProperty(SECTORS_FILL, 'visibility', view3d ? 'none' : 'visible');
  }
  if (map.getLayer(SECTORS_EXTRUSION)) {
    map.setLayoutProperty(SECTORS_EXTRUSION, 'visibility', view3d ? 'visible' : 'none');
  }
}

export function MapLibreViewport({
  sectorsGeoJson,
  pickMode,
  mapBlocked,
  flyTarget,
  view3d,
  onPick,
  popupActions,
}: MapLibreViewportProps) {
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const onPickRef = useRef(onPick);
  const popupActionsRef = useRef(popupActions);
  const pickModeRef = useRef(pickMode);
  const mapBlockedRef = useRef(mapBlocked);
  const view3dRef = useRef(view3d);
  const sectorsRef = useRef(sectorsGeoJson);
  const [loadError, setLoadError] = useState<string | null>(null);

  onPickRef.current = onPick;
  popupActionsRef.current = popupActions;
  pickModeRef.current = pickMode;
  mapBlockedRef.current = mapBlocked;
  view3dRef.current = view3d;
  sectorsRef.current = sectorsGeoJson;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setLoadError(null);

    const map = new maplibregl.Map({
      container: el,
      style: isDark ? MAP_STYLES.dark : MAP_STYLES.light,
      center: UDMURT_MAP_CENTER_LNG_LAT,
      zoom: UDMURT_MAP_ZOOM,
      pitch: view3dRef.current ? DEFAULT_PITCH : 0,
      bearing: view3dRef.current ? DEFAULT_BEARING : 0,
      maxPitch: 70,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }),
      'bottom-right',
    );
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left');

    mapRef.current = map;
    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '320px',
      className: 'sector-map-popup-root sector-map-popup-root--ml',
      offset: 14,
    });

    const bumpSize = () => {
      try {
        map.resize();
      } catch {
        /* map may be removed */
      }
    };

    const onLoad = () => {
      bumpSize();
      addBuildings3D(map);
      addSectorLayers(map, sectorsRef.current, view3dRef.current);
      window.setTimeout(bumpSize, 50);
      window.setTimeout(bumpSize, 250);
    };

    map.on('load', onLoad);
    map.on('style.load', () => {
      bumpSize();
      addBuildings3D(map);
      addSectorLayers(map, sectorsRef.current, view3dRef.current);
    });
    map.on('error', (event) => {
      const message = event.error?.message ?? 'Не удалось загрузить карту';
      console.error('[MapLibre]', event.error ?? event);
      setLoadError(message);
    });

    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (mapBlockedRef.current) return;

      if (pickModeRef.current) {
        onPickRef.current(event.lngLat.lat, event.lngLat.lng);
        return;
      }

      const features = map.queryRenderedFeatures(event.point, {
        layers: [SECTORS_FILL, SECTORS_EXTRUSION].filter((id) => Boolean(map.getLayer(id))),
      });
      const feature = features[0];
      if (!feature?.properties) {
        popupRef.current?.remove();
        return;
      }

      const props = feature.properties as Record<string, unknown>;
      const actions = popupActionsRef.current;
      const html = buildPopupHtml(props, actions.canEdit, actions.canManage);

      popupRef.current?.setLngLat(event.lngLat).setHTML(html).addTo(map);

      const root = popupRef.current?.getElement();
      root?.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const action = btn.dataset.action;
          const id = Number(btn.dataset.id);
          const name = btn.dataset.name ?? '';
          popupRef.current?.remove();
          if (action === 'edit') actions.onEdit(id);
          if (action === 'delete') actions.onDelete(id, name);
          if (action === 'export') actions.onExportKml(id);
        });
      });
    };

    map.on('click', onClick);

    const setPointer = () => {
      map.getCanvas().style.cursor = pickModeRef.current ? 'crosshair' : 'pointer';
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = pickModeRef.current ? 'crosshair' : '';
    };

    map.on('mouseenter', SECTORS_FILL, setPointer);
    map.on('mouseleave', SECTORS_FILL, clearPointer);
    map.on('mouseenter', SECTORS_EXTRUSION, setPointer);
    map.on('mouseleave', SECTORS_EXTRUSION, clearPointer);

    const raf = window.requestAnimationFrame(bumpSize);
    window.addEventListener('resize', bumpSize);
    const parent = el.parentElement;
    let observer: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => bumpSize());
      observer.observe(parent);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', bumpSize);
      observer?.disconnect();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [isDark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SECTORS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(sectorsGeoJson);
    } else {
      addSectorLayers(map, sectorsGeoJson, view3d);
    }
  }, [sectorsGeoJson, view3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncSectorLayerMode(map, view3d);
    map.easeTo({
      pitch: view3d ? DEFAULT_PITCH : 0,
      bearing: view3d ? DEFAULT_BEARING : 0,
      duration: 900,
    });
  }, [view3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({
      center: [flyTarget.lon, flyTarget.lat],
      zoom: Math.max(map.getZoom(), 11),
      pitch: view3dRef.current ? 55 : 0,
      bearing: view3dRef.current ? DEFAULT_BEARING : 0,
      duration: 1600,
      essential: true,
    });
  }, [flyTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : '';
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
    if (mapBlocked) {
      map.boxZoom.disable();
      map.scrollZoom.disable();
      map.dragPan.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
    } else {
      map.boxZoom.enable();
      map.scrollZoom.enable();
      map.dragPan.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
    }
  }, [pickMode, mapBlocked]);

  return (
    <div className="sector-map-ml-wrap">
      <div ref={containerRef} className="sector-map sector-map--maplibre" />
      {loadError && (
        <div className="sector-map-ml-error" role="alert">
          Карта: {loadError}
        </div>
      )}
    </div>
  );
}
