import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Drone, DronePayload, DroneStatus } from '../../types';
import { useAppData } from '../../context/AppDataContext';
import { useApi } from '../../context/ApiContext';
import { countDronesByStatus } from '../../utils/drones';
import { GlassCard } from '../ui/GlassCard';
import { DroneFormModal } from './DroneFormModal';
import { FleetToast } from './FleetToast';
import './FleetManager.css';

/** CSS-модификатор индикатора статуса на карточке борта */
const STATUS_INDICATOR: Record<DroneStatus, string> = {
  Готов: 'fleet-card__status--ready',
  Запланирован: 'fleet-card__status--planned',
  'На ТО': 'fleet-card__status--maintenance',
  Ремонт: 'fleet-card__status--repair',
  Диагностика: 'fleet-card__status--diagnostics',
  'В полете': 'fleet-card__status--flying',
};

function DroneCard({
  drone,
  onEdit,
  onDelete,
  deleting,
}: {
  drone: Drone;
  onEdit: (drone: Drone) => void;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  return (
    <GlassCard className="fleet-card">
      <header className="fleet-card__header">
        <div className="fleet-card__title-block">
          <span
            className={`fleet-card__status ${STATUS_INDICATOR[drone.status] ?? ''}`}
            title={drone.status}
            aria-label={`Статус: ${drone.status}`}
          />
          <div>
            <h3 className="fleet-card__name">{drone.name}</h3>
            <p className="fleet-card__serial">{drone.serial_number}</p>
          </div>
        </div>
        <span className="fleet-card__badge">{drone.status}</span>
      </header>

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
            className={`fleet-card__spec-value${(drone.flight_hours ?? 0) > 100 ? ' fleet-card__spec-value--warn' : ''}`}
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

      <footer className="fleet-card__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEdit(drone)}>
          Изменить
        </button>
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={() => onDelete(drone.id)}
          disabled={deleting}
        >
          {deleting ? '…' : 'Удалить'}
        </button>
      </footer>
    </GlassCard>
  );
}

/**
 * Центр управления парком БПЛА.
 * Единый источник данных — AppDataContext (синхронизация с SQLite через refreshAppData).
 */
export function FleetManager() {
  const api = useApi();
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
  const [toastError, setToastError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const dronesInDiagnosticsCount = useMemo(
    () => countDronesByStatus(drones, 'Диагностика'),
    [drones],
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

  const handleSubmit = async (payload: DronePayload): Promise<{ ok: boolean; error?: string }> => {
    const result = editingDrone
      ? await api.updateDrone(editingDrone.id, payload)
      : await api.addDrone(payload);

    if (result.ok) {
      await refreshAppData();
      return { ok: true };
    }

    const errorText = result.error ?? 'Ошибка сохранения данных борта.';
    showError(errorText);
    return { ok: false, error: errorText };
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить борт из реестра? Это действие необратимо.')) return;

    setDeletingId(id);
    const result = await api.deleteDrone(id);
    setDeletingId(null);

    if (result.ok) {
      await refreshAppData();
      return;
    }

    showError(result.error ?? 'Не удалось удалить борт.');
  };

  return (
    <div className="fleet-manager">
      <header className="fleet-manager__header">
        <div>
          <h1 className="fleet-manager__title">Управление парком БПЛА</h1>
          <p className="fleet-manager__subtitle">
            Реестр бортов с ТТХ
          </p>
        </div>
        <div className="fleet-manager__header-actions">
          <div className="fleet-manager__stats">
            <span className="fleet-manager__stat">Всего: {drones.length}</span>
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
          <button type="button" className="btn btn--primary" onClick={handleOpenCreate}>
            + Добавить дрон
          </button>
        </div>
      </header>

      {loading ? (
        <div className="fleet-manager__loading">
          <span className="fleet-manager__spinner" aria-hidden />
          Загрузка реестра…
        </div>
      ) : drones.length === 0 ? (
        <GlassCard className="fleet-manager__empty">
          <p>Реестр пуст. Добавьте первый борт БПЛА.</p>
          <button type="button" className="btn btn--primary" onClick={handleOpenCreate}>
            Добавить дрон
          </button>
        </GlassCard>
      ) : (
        <div className="fleet-manager__grid">
          {drones.map((drone) => (
            <DroneCard
              key={drone.id}
              drone={drone}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              deleting={deletingId === drone.id}
            />
          ))}
        </div>
      )}

      <DroneFormModal
        open={modalOpen}
        editingDrone={editingDrone}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      {toastError && <FleetToast message={toastError} onClose={() => setToastError(null)} />}
    </div>
  );
}
