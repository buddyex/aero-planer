import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import type { CreateSectorPayload, Sector } from '../../types';
import { canEditSectorBoundaries } from '../../utils/permissions';
import { sectorsToGeoJSON } from '../../utils/map';
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
import { MapLocationSearch, type MapSearchTarget } from './MapLocationSearch';
import { MapLibreViewport } from './MapLibreViewport';
import './SectorMap.css';

function sectorHasCoords(sector: Sector): sector is Sector & { center_lat: number; center_lon: number } {
  return sector.center_lat != null && sector.center_lon != null;
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
  const [view3d, setView3d] = useState(false);

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
  const sectorsGeoJson = useMemo(() => sectorsToGeoJSON(mappedSectors), [mappedSectors]);
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
    dismissLeafletPopups();

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

  const handleEditFromPopup = (sectorId: number) => {
    const sector = mappedSectors.find((s) => s.id === sectorId) ?? null;
    setEditSector(sector);
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

  const viewToggle = (
    <button
      type="button"
      className={`btn btn--ghost sector-map-card__btn sector-map-card__btn--view${view3d ? ' sector-map-card__btn--active' : ''}`}
      onClick={() => setView3d((v) => !v)}
      title={view3d ? 'Переключить в 2D' : 'Переключить в 3D'}
      aria-pressed={view3d}
    >
      {view3d ? '3D' : '2D'}
    </button>
  );

  const editActions = (
    <div className="sector-map-card__actions">
      {viewToggle}
      {canEdit ? (
        <>
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
        </>
      ) : null}
    </div>
  );

  const mapCanvas = (
    <div
      className={`sector-map-card__map${pickMode ? ' sector-map-card__map--pick' : ''}${mapBlocked ? ' sector-map-card__map--blocked' : ''}`}
    >
      {mounted ? (
        <MapLibreViewport
          sectorsGeoJson={sectorsGeoJson}
          pickMode={pickMode}
          mapBlocked={mapBlocked}
          flyTarget={flyTarget}
          view3d={view3d}
          onPick={handleMapPick}
          popupActions={{
            canEdit,
            onEdit: handleEditFromPopup,
            onDelete: handleDelete,
            onExportKml: handleExportSectorKml,
          }}
        />
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
