import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Drone, DronePayload, DroneStatus } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { useApi } from '../../context/ApiContext';
import { useAuth } from '../../context/AuthContext';
import { countDronesByStatus, resolveDronePhotoUrl } from '../../utils/drones';
import { isDroneNearMaintenance } from '../../utils/maintenanceRules';
import {
  canManageDronePhotos,
  canManageFleet,
  canRestoreWrittenOffDrone,
} from '../../utils/permissions';
import { GlassCard } from '../ui/GlassCard';
import { DroneFormModal, type DroneFormSubmitExtras } from './DroneFormModal';
import { FleetToast } from './FleetToast';
import { WriteOffDroneModal } from './WriteOffDroneModal';
import './FleetManager.css';

type FleetTab = 'active' | 'written_off';

const STATUS_INDICATOR: Record<DroneStatus, string> = {
  Готов: 'fleet-card__status--ready',
  Запланирован: 'fleet-card__status--planned',
  'На ТО': 'fleet-card__status--maintenance',
  Ремонт: 'fleet-card__status--repair',
  Диагностика: 'fleet-card__status--diagnostics',
  'В полете': 'fleet-card__status--flying',
  Списан: 'fleet-card__status--written-off',
};

function formatWrittenOffAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DroneCard({
  drone,
  canEdit,
  canRestore,
  onEdit,
  onWriteOff,
  onRestore,
  restoring,
}: {
  drone: Drone;
  canEdit: boolean;
  canRestore: boolean;
  onEdit: (drone: Drone) => void;
  onWriteOff: (drone: Drone) => void;
  onRestore: (drone: Drone) => void;
  restoring: boolean;
}) {
  const photoSrc = resolveDronePhotoUrl(drone.photo_url);
  const writtenOff = drone.status === 'Списан';
  const writtenOffLabel = formatWrittenOffAt(drone.written_off_at);

  return (
    <GlassCard className={`fleet-card${writtenOff ? ' fleet-card--written-off' : ''}`}>
      <div className={`fleet-card__media${photoSrc ? '' : ' fleet-card__media--empty'}`}>
        {photoSrc ? (
          <img src={photoSrc} alt={drone.name} className="fleet-card__photo" loading="lazy" />
        ) : (
          <div className="fleet-card__photo-fallback" aria-hidden>
            <svg viewBox="0 0 80 48" className="fleet-card__silhouette">
              <path
                fill="currentColor"
                d="M40 8c-2.2 0-4 1.5-4 3.4V14H28l-4 5H14c-2.2 0-4 1.8-4 4v14c0 2.2 1.8 4 4 4h52c2.2 0 4-1.8 4-4V23c0-2.2-1.8-4-4-4H56l-4-5h-8v-2.6C44 9.5 42.2 8 40 8zm0 14a9 9 0 110 18 9 9 0 010-18zm0 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z"
              />
            </svg>
          </div>
        )}
        <span
          className={`fleet-card__status fleet-card__status--overlay ${STATUS_INDICATOR[drone.status] ?? ''}`}
          title={drone.status}
          aria-label={`Статус: ${drone.status}`}
        />
      </div>

      <header className="fleet-card__header">
        <div className="fleet-card__title-block">
          <div>
            <h3 className="fleet-card__name">{drone.name}</h3>
            <p className="fleet-card__serial">{drone.serial_number}</p>
          </div>
        </div>
        <div className="fleet-card__badges">
          <span className={`fleet-card__badge${writtenOff ? ' fleet-card__badge--written-off' : ''}`}>
            {drone.status}
          </span>
          {!writtenOff && isDroneNearMaintenance(drone.flight_hours) && (
            <span className="fleet-card__badge fleet-card__badge--soon">Скоро ТО</span>
          )}
        </div>
      </header>

      {writtenOff && (writtenOffLabel || drone.written_off_reason) && (
        <div className="fleet-card__writeoff-meta">
          {writtenOffLabel && <span>Списан: {writtenOffLabel}</span>}
          {drone.written_off_reason && <span>{drone.written_off_reason}</span>}
        </div>
      )}

      <ul className="fleet-card__specs">
        <li className="fleet-card__spec">
          <span className="fleet-card__spec-icon" aria-hidden>
            💨
          </span>
          <span className="fleet-card__spec-label">Ветер</span>
          <span className="fleet-card__spec-value">{drone.max_wind_speed} м/с</span>
        </li>
        <li className="fleet-card__spec">
          <span className="fleet-card__spec-icon" aria-hidden>
            🔋
          </span>
          <span className="fleet-card__spec-label">АКБ</span>
          <span className="fleet-card__spec-value">{drone.battery_capacity.toLocaleString('ru-RU')} мАч</span>
        </li>
        <li className="fleet-card__spec">
          <span className="fleet-card__spec-icon" aria-hidden>
            ⚖
          </span>
          <span className="fleet-card__spec-label">Груз</span>
          <span className="fleet-card__spec-value">{drone.payload_capacity} кг</span>
        </li>
        <li className="fleet-card__spec">
          <span className="fleet-card__spec-icon" aria-hidden>
            🛫
          </span>
          <span className="fleet-card__spec-label">Налёт</span>
          <span
            className={`fleet-card__spec-value${(drone.flight_hours ?? 0) >= 100 ? ' fleet-card__spec-value--warn' : ''}`}
          >
            {(drone.flight_hours ?? 0).toFixed(1)} ч
          </span>
        </li>
        <li className="fleet-card__spec">
          <span className="fleet-card__spec-icon" aria-hidden>
            ⏱
          </span>
          <span className="fleet-card__spec-label">Полёт</span>
          <span className="fleet-card__spec-value">{drone.flight_time_max} мин</span>
        </li>
      </ul>

      {canEdit && !writtenOff && (
        <footer className="fleet-card__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEdit(drone)}>
            Изменить
          </button>
          <button type="button" className="btn btn--danger btn--sm" onClick={() => onWriteOff(drone)}>
            Списать
          </button>
        </footer>
      )}

      {writtenOff && canRestore && (
        <footer className="fleet-card__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => onRestore(drone)}
            disabled={restoring}
          >
            {restoring ? '…' : 'Восстановить в строй'}
          </button>
        </footer>
      )}
    </GlassCard>
  );
}

export function FleetManager() {
  const api = useApi();
  const { user } = useAuth();
  const {
    drones,
    refreshAppData,
    dronesInAirCount,
    dronesOnMaintenanceCount,
    dronesInRepairCount,
  } = useAppData();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDrone, setEditingDrone] = useState<Drone | null>(null);
  const [writeOffDrone, setWriteOffDrone] = useState<Drone | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [tab, setTab] = useState<FleetTab>('active');

  const canEdit = user ? canManageFleet(user.role) : false;
  const canPhotos = user ? canManageDronePhotos(user.role) : false;
  const canRestore = user ? canRestoreWrittenOffDrone(user.role) : false;

  const activeDrones = useMemo(() => drones.filter((d) => d.status !== 'Списан'), [drones]);
  const writtenOffDrones = useMemo(() => drones.filter((d) => d.status === 'Списан'), [drones]);
  const visibleDrones = tab === 'active' ? activeDrones : writtenOffDrones;

  const dronesInDiagnosticsCount = useMemo(
    () => countDronesByStatus(activeDrones, 'Диагностика'),
    [activeDrones],
  );

  const showError = useCallback((message: string) => {
    setToastError(message);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await refreshAppData();
      setLoading(false);
    };
    load();
  }, [refreshAppData]);

  const handleOpenCreate = () => {
    setEditingDrone(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (drone: Drone) => {
    setEditingDrone(drone);
    setModalOpen(true);
  };

  const handleSubmit = async (
    payload: DronePayload,
    extras?: DroneFormSubmitExtras,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = editingDrone
      ? await api.updateDrone(editingDrone.id, { ...payload, status: editingDrone.status })
      : await api.addDrone(payload);

    if (!result.ok) {
      const errorText = result.error ?? 'Ошибка сохранения данных борта.';
      showError(errorText);
      return { ok: false, error: errorText };
    }

    const droneId = result.data?.id ?? editingDrone?.id;
    if (canPhotos && droneId != null) {
      if (extras?.photoFile) {
        const photoResult = await api.uploadDronePhoto(droneId, extras.photoFile);
        if (!photoResult.ok) {
          const errorText = photoResult.error ?? 'Борт сохранён, но фото не загружено.';
          showError(errorText);
          await refreshAppData();
          return { ok: false, error: errorText };
        }
      } else if (extras?.removePhoto && editingDrone?.photo_url) {
        const photoResult = await api.deleteDronePhoto(droneId);
        if (!photoResult.ok) {
          const errorText = photoResult.error ?? 'Борт сохранён, но фото не удалено.';
          showError(errorText);
          await refreshAppData();
          return { ok: false, error: errorText };
        }
      }
    }

    await refreshAppData();
    return { ok: true };
  };

  const handleWriteOff = async (reason: string): Promise<{ ok: boolean; error?: string }> => {
    if (!writeOffDrone) return { ok: false, error: 'Борт не выбран.' };
    const result = await api.writeOffDrone(writeOffDrone.id, reason);
    if (!result.ok) {
      const errorText = result.error ?? 'Не удалось списать борт.';
      showError(errorText);
      return { ok: false, error: errorText };
    }
    await refreshAppData();
    setTab('written_off');
    return { ok: true };
  };

  const handleRestore = async (drone: Drone) => {
    if (!window.confirm(`Восстановить борт ${drone.serial_number} в строй?`)) return;
    setRestoringId(drone.id);
    const result = await api.restoreDrone(drone.id);
    setRestoringId(null);
    if (!result.ok) {
      showError(result.error ?? 'Не удалось восстановить борт.');
      return;
    }
    await refreshAppData();
    setTab('active');
  };

  return (
    <div className="fleet-manager">
      <header className="fleet-manager__header">
        <div>
          <h1 className="fleet-manager__title">Управление парком БПЛА</h1>
          <p className="fleet-manager__subtitle">Реестр бортов с ТТХ</p>
        </div>
        <div className="fleet-manager__header-actions">
          <div className="fleet-manager__stats">
            <span className="fleet-manager__stat">Активных: {activeDrones.length}</span>
            <span className="fleet-manager__stat">Списано: {writtenOffDrones.length}</span>
            <span className="fleet-manager__stat">
              <span className="fleet-manager__stat-dot fleet-manager__stat-dot--flying" />
              В полёте: {dronesInAirCount}
            </span>
            <span className="fleet-manager__stat">
              <span className="fleet-manager__stat-dot fleet-manager__stat-dot--maintenance" />
              На ТО: {dronesOnMaintenanceCount}
            </span>
            <span className="fleet-manager__stat">
              <span className="fleet-manager__stat-dot fleet-manager__stat-dot--repair" />
              Ремонт: {dronesInRepairCount}
            </span>
            <span className="fleet-manager__stat">
              <span className="fleet-manager__stat-dot fleet-manager__stat-dot--diagnostics" />
              Диагностика: {dronesInDiagnosticsCount}
            </span>
          </div>
          {canEdit && tab === 'active' && (
            <button type="button" className="btn btn--primary" onClick={handleOpenCreate}>
              + Добавить дрон
            </button>
          )}
        </div>
      </header>

      <div className="fleet-manager__tabs" role="tablist" aria-label="Фильтр флота">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={`fleet-manager__tab${tab === 'active' ? ' fleet-manager__tab--active' : ''}`}
          onClick={() => setTab('active')}
        >
          Активные ({activeDrones.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'written_off'}
          className={`fleet-manager__tab${tab === 'written_off' ? ' fleet-manager__tab--active' : ''}`}
          onClick={() => setTab('written_off')}
        >
          Списанные ({writtenOffDrones.length})
        </button>
      </div>

      {loading ? (
        <div className="fleet-manager__loading">
          <span className="fleet-manager__spinner" aria-hidden />
          Загрузка реестра…
        </div>
      ) : visibleDrones.length === 0 ? (
        <GlassCard className="fleet-manager__empty">
          <p>
            {tab === 'active'
              ? 'Активных бортов нет. Добавьте первый борт БПЛА.'
              : 'Списанных бортов нет.'}
          </p>
          {canEdit && tab === 'active' && (
            <button type="button" className="btn btn--primary" onClick={handleOpenCreate}>
              Добавить дрон
            </button>
          )}
        </GlassCard>
      ) : (
        <div className="fleet-manager__grid">
          {visibleDrones.map((drone) => (
            <DroneCard
              key={drone.id}
              drone={drone}
              canEdit={canEdit}
              canRestore={canRestore}
              onEdit={handleOpenEdit}
              onWriteOff={setWriteOffDrone}
              onRestore={handleRestore}
              restoring={restoringId === drone.id}
            />
          ))}
        </div>
      )}

      {canEdit && (
        <DroneFormModal
          open={modalOpen}
          editingDrone={editingDrone}
          canManagePhotos={canPhotos}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <WriteOffDroneModal
        open={writeOffDrone != null}
        drone={writeOffDrone}
        onClose={() => setWriteOffDrone(null)}
        onConfirm={handleWriteOff}
      />

      {toastError && <FleetToast message={toastError} onClose={() => setToastError(null)} />}
    </div>
  );
}
