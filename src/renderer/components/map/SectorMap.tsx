import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, MapContainer, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import type { CreateSectorPayload, RiskLevel, Sector } from '../../types';
import { canEditSectorBoundaries } from '../../utils/permissions';
import { formatMetric } from '../../utils/weather';
import {
  kmToMeters,
  parseSectorPolygon,
  RISK_COLORS,
  UDMURT_MAP_CENTER,
  UDMURT_MAP_ZOOM,
} from '../../utils/map';
import { GlassCard } from '../ui/GlassCard';
import {
  blurLeafletMaps,
  dismissLeafletPopups,
  prepareForNativeDialog,
  restorePageInput,
  setSectorMapKeyboardEnabled,
} from '../../utils/mapFocus';
import { CreateSectorModal } from './CreateSectorModal';
import { EditSectorBoundaryModal } from './EditSectorBoundaryModal';
import { OfflineTileLayer } from './OfflineTileLayer';
import { MapFlyTo, MapLocationSearch, type MapSearchTarget } from './MapLocationSearch';
import './SectorMap.css';

function MapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      map.invalidateSize();
    };
    invalidate();
    // Second pass after layout settles (HUD panels / flex)
    const raf = window.requestAnimationFrame(() => invalidate());
    window.addEventListener('resize', invalidate);

    const container = map.getContainer();
    const parent = container.parentElement;
    let observer: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => invalidate());
      observer.observe(parent);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', invalidate);
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

function sectorHasCoords(sector: Sector): sector is Sector & { center_lat: number; center_lon: number } {
  return sector.center_lat != null && sector.center_lon != null;
}

function SectorLayer({
  sector,
  canEdit,
  onEdit,
  onDelete,
  onExportKml,
}: {
  sector: Sector & { center_lat: number; center_lon: number };
  canEdit: boolean;
  onEdit: (sector: Sector) => void;
  onDelete: (sectorId: number, sectorName: string) => void;
  onExportKml: (sectorId: number) => void;
}) {
  const ring = parseSectorPolygon(sector);
  const pathOptions = {
    color: RISK_COLORS[sector.risk_level as RiskLevel],
    fillColor: RISK_COLORS[sector.risk_level as RiskLevel],
    fillOpacity: 0.22,
    weight: 2,
  };

  const popup = (
    <Popup>
      <div className="sector-map-popup">
        <strong>{sector.sector_name}</strong>
        <span>Риск: {sector.risk_level}</span>
        <span>Форма: {sector.shape_type === 'polygon' || ring ? 'полигон' : 'круг'}</span>
        {sector.wind_speed != null && (
          <span>
            Ветер {formatMetric(sector.wind_speed)} м/с · {formatMetric(sector.temperature)}°C
          </span>
        )}
        {canEdit && (
          <div className="sector-map-popup__actions">
            <button
              type="button"
              className="sector-map-popup__export"
              aria-label={`Экспорт KML: ${sector.sector_name}`}
              title="Экспорт KML"
              onClick={() => onExportKml(sector.id)}
            >
              ↓ KML
            </button>
            <button type="button" className="sector-map-popup__edit" onClick={() => onEdit(sector)}>
              Редактировать границы
            </button>
            <button
              type="button"
              className="sector-map-popup__delete"
              onClick={() => {
                dismissLeafletPopups();
                blurLeafletMaps();
                onDelete(sector.id, sector.sector_name);
              }}
            >
              Удалить
            </button>
          </div>
        )}
      </div>
    </Popup>
  );

  if (ring && ring.length >= 3) {
    return (
      <Polygon positions={ring} pathOptions={pathOptions}>
        {popup}
      </Polygon>
    );
  }

  return (
    <Circle
      center={[sector.center_lat, sector.center_lon]}
      radius={kmToMeters(sector.radius_km ?? 20)}
      pathOptions={pathOptions}
    >
      {popup}
    </Circle>
  );
}

export interface SectorMapProps {
  variant?: 'card' | 'hud';
}

export function SectorMap({ variant = 'card' }: SectorMapProps) {
  const isHud = variant === 'hud';
  const { user } = useAuth();
  const {
    sectors,
    hasBackend,
    createSector,
    updateSectorBoundary,
    importSectorsKml,
    exportSectorsKml,
    deleteSector,
  } = useAppData();

  const canEdit = Boolean(user && canEditSectorBoundaries(user.role) && hasBackend);

  const [mounted, setMounted] = useState(false);
  const [hudToolbarHost, setHudToolbarHost] = useState<HTMLElement | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSector, setEditSector] = useState<Sector | null>(null);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<MapSearchTarget | null>(null);
  const [kmlBusy, setKmlBusy] = useState(false);
  const [hudToolsOpen, setHudToolsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isHud) {
      setHudToolbarHost(null);
      return;
    }

    const bind = () => {
      const el = document.getElementById('dashboard-hud-map-toolbar');
      setHudToolbarHost((prev) => (prev === el ? prev : el));
    };

    bind();
    const raf = window.requestAnimationFrame(bind);
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [isHud]);

  const mappedSectors = useMemo(() => sectors.filter(sectorHasCoords), [sectors]);
  const sectorIdsKey = useMemo(() => mappedSectors.map((sector) => sector.id).join(','), [mappedSectors]);

  const mapBlocked = modalOpen || editSector != null;

  useEffect(() => {
    restorePageInput();
  }, [sectorIdsKey]);

  const openCreateModal = useCallback((coords: { lat: number; lon: number } | null) => {
    setPickMode(false);
    setDraftCoords(coords);
    setModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setModalOpen(false);
    setPickMode(false);
    blurLeafletMaps();
  }, []);

  useEffect(() => {
    setSectorMapKeyboardEnabled(pickMode && !mapBlocked);
  }, [pickMode, mapBlocked]);

  useEffect(() => () => blurLeafletMaps(), []);

  const closeEditSector = useCallback(() => {
    setEditSector(null);
    blurLeafletMaps();
  }, []);

  const handleMapPick = (lat: number, lon: number) => {
    if (pickMode) {
      openCreateModal({ lat, lon });
    }
  };

  const handleCreate = async (payload: CreateSectorPayload) => {
    setActionError(null);
    const result = await createSector(payload);
    if (!result.ok) {
      setActionError(result.error);
    }
    return result;
  };

  const handleDelete = async (sectorId: number, sectorName: string) => {
    prepareForNativeDialog();

    if (!window.confirm(`Вы уверены, что хотите удалить сектор «${sectorName}»?`)) {
      restorePageInput();
      return;
    }

    setActionError(null);
    setPickMode(false);
    setEditSector((prev) => (prev?.id === sectorId ? null : prev));

    const result = await deleteSector(sectorId);
    if (!result.ok) {
      setActionError(result.error ?? 'Не удалось удалить сектор.');
      restorePageInput();
      return;
    }

    restorePageInput();
  };

  const handleExportSectorKml = async (sectorId: number) => {
    setActionError(null);
    setActionInfo(null);
    setKmlBusy(true);
    const result = await exportSectorsKml(sectorId);
    setKmlBusy(false);
    if (result.ok) {
      setActionInfo(result.message ?? 'KML экспортирован.');
    } else if (result.error !== 'Экспорт отменён.') {
      setActionError(result.error);
    }
  };

  const handleImportKml = async () => {
    setActionError(null);
    setActionInfo(null);
    setKmlBusy(true);
    const result = await importSectorsKml();
    setKmlBusy(false);
    if (result.ok) {
      setActionInfo(result.message ?? 'KML импортирован.');
    } else if (result.error !== 'Импорт отменён.') {
      setActionError(result.error);
    }
  };

  const editActions = canEdit ? (
    <div className="sector-map-card__actions">
      <button
        type="button"
        className={`btn btn--ghost sector-map-card__btn${pickMode ? ' sector-map-card__btn--active' : ''}`}
        onClick={() => setPickMode((prev) => !prev)}
      >
        {pickMode ? 'Кликните на карту…' : '+ На карте'}
      </button>
      <button
        type="button"
        className="btn btn--ghost sector-map-card__btn"
        onClick={handleImportKml}
        disabled={kmlBusy}
      >
        Импорт KML
      </button>
    </div>
  ) : null;

  const mapCanvas = (
    <div
      className={`sector-map-card__map${pickMode ? ' sector-map-card__map--pick' : ''}${mapBlocked ? ' sector-map-card__map--blocked' : ''}`}
    >
      {mounted ? (
        <MapContainer
          center={UDMURT_MAP_CENTER}
          zoom={UDMURT_MAP_ZOOM}
          zoomControl={false}
          scrollWheelZoom={!mapBlocked}
          keyboard={!mapBlocked}
          attributionControl={false}
          className="sector-map"
        >
          <OfflineTileLayer />
          <MapResizeHandler />
          <MapFlyTo target={flyTarget} />
          <MapClickHandler enabled={pickMode} onPick={handleMapPick} />
          {mappedSectors.map((sector) => (
            <SectorLayer
              key={sector.id}
              sector={sector}
              canEdit={canEdit}
              onEdit={setEditSector}
              onDelete={handleDelete}
              onExportKml={handleExportSectorKml}
            />
          ))}
        </MapContainer>
      ) : (
        <div className="sector-map-card__placeholder">Загрузка карты…</div>
      )}
    </div>
  );

  const modals = (
    <>
      <CreateSectorModal
        open={modalOpen}
        initialLat={draftCoords?.lat}
        initialLon={draftCoords?.lon}
        onClose={closeCreateModal}
        onSubmit={handleCreate}
      />
      <EditSectorBoundaryModal
        sector={editSector}
        open={editSector != null}
        onClose={closeEditSector}
        onSubmit={updateSectorBoundary}
      />
    </>
  );

  if (isHud) {
    const toolbar = (
      <div
        className={`sector-map-card__hud-tools pointer-events-auto${
          hudToolsOpen ? ' sector-map-card__hud-tools--open' : ''
        }`}
      >
        <button
          type="button"
          className="sector-map-card__hud-tools-toggle"
          aria-expanded={hudToolsOpen}
          aria-controls="dashboard-hud-map-tools-panel"
          onClick={() => setHudToolsOpen((v) => !v)}
        >
          <span aria-hidden>{hudToolsOpen ? '✕' : '🔍'}</span>
          <span className="sector-map-card__hud-tools-toggle-label">
            {hudToolsOpen ? 'Закрыть' : 'Поиск'}
          </span>
        </button>
        <div id="dashboard-hud-map-tools-panel" className="sector-map-card__hud-toolbar">
          <MapLocationSearch
            onSearchResult={(target) => {
              setFlyTarget(target);
              setHudToolsOpen(false);
            }}
          />
          {editActions}
        </div>
      </div>
    );

    return (
      <div className="sector-map-card sector-map-card--hud">
        {hudToolbarHost ? createPortal(toolbar, hudToolbarHost) : null}
        {actionError && (
          <p className="sector-map-card__error sector-map-card__hud-alert" role="alert">
            {actionError}
          </p>
        )}
        {actionInfo && (
          <p className="sector-map-card__info sector-map-card__hud-alert" role="status">
            {actionInfo}
          </p>
        )}
        {mapCanvas}
        {modals}
      </div>
    );
  }

  return (
    <GlassCard accent className="sector-map-card">
      <div className="sector-map-card__header">
        <div className="sector-map-card__header-top">
          <h3 className="sector-map-card__title">
            <span className="sector-map-card__title-full">Карта секторов полётов</span>
            <span className="sector-map-card__title-short">Карта секторов</span>
          </h3>
          {editActions}
        </div>
        <MapLocationSearch onSearchResult={setFlyTarget} />
      </div>

      {actionError && (
        <p className="sector-map-card__error" role="alert">
          {actionError}
        </p>
      )}
      {actionInfo && (
        <p className="sector-map-card__info" role="status">
          {actionInfo}
        </p>
      )}

      {mapCanvas}
      {modals}
    </GlassCard>
  );
}
