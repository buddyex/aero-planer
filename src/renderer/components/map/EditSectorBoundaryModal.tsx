import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, MapContainer, Polygon, useMapEvents } from 'react-leaflet';
import { OfflineTileLayer } from './OfflineTileLayer';
import type { Sector, SectorShapeType, UpdateSectorBoundaryPayload } from '../../types';
import { kmToMeters, parseSectorPolygon, RISK_COLORS, UDMURT_MAP_CENTER, UDMURT_MAP_ZOOM } from '../../utils/map';
import { blurLeafletMaps, purgeOrphanModalNodes } from '../../utils/mapFocus';
import './EditSectorBoundaryModal.css';

function BoundaryClickHandler({
  enabled,
  onAdd,
}: {
  enabled: boolean;
  onAdd: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onAdd(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

interface EditSectorBoundaryModalProps {
  sector: Sector | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (
    sectorId: number,
    payload: UpdateSectorBoundaryPayload,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function EditSectorBoundaryModal({
  sector,
  open,
  onClose,
  onSubmit,
}: EditSectorBoundaryModalProps) {
  const [shapeType, setShapeType] = useState<SectorShapeType>('circle');
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [lat, setLat] = useState('56.8500');
  const [lon, setLon] = useState('53.2100');
  const [radius, setRadius] = useState('20');
  const [drawMode, setDrawMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const latInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    setError(null);
    setDrawMode(false);
    blurLeafletMaps();
    onCloseRef.current();
    requestAnimationFrame(() => purgeOrphanModalNodes('.edit-sector-modal'));
  }, []);

  useEffect(() => {
    if (!open || !sector) return;

    const polygon = parseSectorPolygon(sector);
    const nextShape = sector.shape_type === 'polygon' || polygon ? 'polygon' : 'circle';
    setShapeType(nextShape);
    setVertices(polygon ?? []);
    setLat((sector.center_lat ?? UDMURT_MAP_CENTER[0]).toFixed(4));
    setLon((sector.center_lon ?? UDMURT_MAP_CENTER[1]).toFixed(4));
    setRadius(String(sector.radius_km ?? 20));
    setDrawMode(false);
    setError(null);
  }, [open, sector]);

  useLayoutEffect(() => {
    if (!open) {
      requestAnimationFrame(() => purgeOrphanModalNodes('.edit-sector-modal'));
      return;
    }

    blurLeafletMaps();
    if (latInputRef.current) {
      latInputRef.current.focus({ preventScroll: true });
    } else {
      document.querySelector<HTMLInputElement>('.edit-sector-modal__shape-toggle input')?.focus();
    }
  }, [open, shapeType]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      blurLeafletMaps();
    };
  }, [open, handleClose]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (vertices.length > 0) return vertices[0];
    return [Number(lat) || UDMURT_MAP_CENTER[0], Number(lon) || UDMURT_MAP_CENTER[1]];
  }, [vertices, lat, lon]);

  if (!open || !sector) return null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const payload: UpdateSectorBoundaryPayload =
      shapeType === 'polygon'
        ? {
            shape_type: 'polygon',
            boundary_polygon: vertices,
          }
        : {
            shape_type: 'circle',
            center_lat: Number(String(lat).replace(',', '.')),
            center_lon: Number(String(lon).replace(',', '.')),
            radius_km: Number(radius),
          };

    const result = await onSubmit(sector.id, payload);
    setSaving(false);

    if (result.ok) {
      handleClose();
      return;
    }

    setError(result.error ?? 'Не удалось сохранить границы.');
  };

  return createPortal(
    <div className="edit-sector-modal" role="dialog" aria-modal="true">
      <div className="edit-sector-modal__backdrop" onClick={handleClose} aria-hidden />
      <form
        className="edit-sector-modal__panel"
        onSubmit={handleSave}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="edit-sector-modal__title">Границы: {sector.sector_name}</h3>
        <p className="edit-sector-modal__hint">
          Полигон: кликайте по карте, чтобы добавить вершины (минимум 3). Круг: центр и радиус.
        </p>

        <div className="edit-sector-modal__shape-toggle">
          <label>
            <input
              type="radio"
              name="shape"
              checked={shapeType === 'circle'}
              onChange={() => setShapeType('circle')}
            />
            Круг
          </label>
          <label>
            <input
              type="radio"
              name="shape"
              checked={shapeType === 'polygon'}
              onChange={() => setShapeType('polygon')}
            />
            Произвольный полигон
          </label>
        </div>

        {shapeType === 'circle' ? (
          <div className="edit-sector-modal__row">
            <div className="form-field">
              <label className="form-field__label" htmlFor="edit-sector-lat">
                Широта
              </label>
              <input
                ref={latInputRef}
                id="edit-sector-lat"
                className="form-field__input"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="edit-sector-lon">
                Долгота
              </label>
              <input
                id="edit-sector-lon"
                className="form-field__input"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="edit-sector-radius">
                Радиус (км)
              </label>
              <input
                id="edit-sector-radius"
                type="number"
                min="5"
                max="60"
                className="form-field__input"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="edit-sector-modal__polygon-tools">
            <button
              type="button"
              className={`btn btn--ghost${drawMode ? ' sector-map-card__btn--active' : ''}`}
              onClick={() => setDrawMode((prev) => !prev)}
            >
              {drawMode ? 'Рисование… клик по карте' : 'Добавить точки на карте'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setVertices((prev) => prev.slice(0, -1))}
              disabled={vertices.length === 0}
            >
              Отменить точку
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setVertices([])}
              disabled={vertices.length === 0}
            >
              Очистить
            </button>
            <span className="edit-sector-modal__vertex-count">Точек: {vertices.length}</span>
          </div>
        )}

        <div className="edit-sector-modal__map">
          <MapContainer
            center={mapCenter}
            zoom={UDMURT_MAP_ZOOM + 2}
            scrollWheelZoom
            keyboard={drawMode && shapeType === 'polygon'}
            className="edit-sector-map"
          >
            <OfflineTileLayer />
            <BoundaryClickHandler
              enabled={shapeType === 'polygon' && drawMode}
              onAdd={(nextLat, nextLon) => setVertices((prev) => [...prev, [nextLat, nextLon]])}
            />
            {shapeType === 'polygon' && vertices.length >= 2 && (
              <Polygon
                positions={vertices}
                pathOptions={{
                  color: RISK_COLORS[sector.risk_level],
                  fillColor: RISK_COLORS[sector.risk_level],
                  fillOpacity: 0.2,
                  weight: 2,
                }}
              />
            )}
            {shapeType === 'circle' && (
              <Circle
                center={[Number(lat) || mapCenter[0], Number(lon) || mapCenter[1]]}
                radius={kmToMeters(Number(radius) || 20)}
                pathOptions={{
                  color: RISK_COLORS[sector.risk_level],
                  fillColor: RISK_COLORS[sector.risk_level],
                  fillOpacity: 0.2,
                  weight: 2,
                }}
              />
            )}
          </MapContainer>
        </div>

        {error && (
          <p className="edit-sector-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="edit-sector-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn btn--accent" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить границы'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
