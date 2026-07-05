import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../context/ApiContext';
import { useAppData } from '../../context/AppDataContext';

import type { MaintenanceLog } from '../../types';
import type { DroneRow } from '../../../shared/types/api.types';

import { canCompleteMaintenance } from '../../utils/permissions';
import { mapDroneRow } from '../../utils/drones';

import { GlassCard } from '../ui/GlassCard';

import { OperatorLink } from '../ui/OperatorLink';

import { AppSelect } from '../ui/AppSelect';

import { Modal } from '../ui/Modal';

import { BatteryRegistry } from './BatteryRegistry';

import './MaintenanceJournal.css';

import './BatteryRegistry.css';



const WORK_TYPES = ['Плановое ТО', 'Ремонт', 'Диагностика'] as const;



const MAINTENANCE_STATUSES = new Set(['На ТО', 'Ремонт', 'Диагностика']);

type MaintenanceTab = 'journal' | 'batteries';



export function MaintenanceJournal() {

  const { user } = useAuth();
  const api = useApi();
  const { drones, refreshAppData, patchDrone } = useAppData();

  const location = useLocation();

  const [logs, setLogs] = useState<MaintenanceLog[]>([]);

  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  const [completingId, setCompletingId] = useState<number | null>(null);

  const [droneId, setDroneId] = useState(drones[0]?.id ?? 1);

  const [workType, setWorkType] = useState<(typeof WORK_TYPES)[number]>('Плановое ТО');

  const [description, setDescription] = useState('');

  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MaintenanceTab>('journal');
  const [pendingBatteryInspections, setPendingBatteryInspections] = useState(0);



  const canComplete = user ? canCompleteMaintenance(user.role) : false;

  const availableDrones = useMemo(
    () => drones.filter((d) => d.status === 'Готов'),
    [drones],
  );

  useEffect(() => {
    if (!modalOpen) return;
    if (availableDrones.length === 0) {
      setDroneId(0);
      return;
    }
    if (!availableDrones.some((d) => d.id === droneId)) {
      setDroneId(availableDrones[0].id);
    }
  }, [modalOpen, availableDrones, droneId]);



  const loadLogs = useCallback(async () => {

    setLoading(true);

    const result = await api.getMaintenanceLogs();

    if (result.ok && result.data) {
      setLogs(result.data as MaintenanceLog[]);
    }

    setLoading(false);
  }, [api]);



  useEffect(() => {

    loadLogs();

    void refreshAppData();

  }, [loadLogs, location.pathname, refreshAppData]);



  useEffect(() => {

    const onFocus = () => {

      loadLogs();

      refreshAppData();

    };

    window.addEventListener('focus', onFocus);

    return () => window.removeEventListener('focus', onFocus);

  }, [loadLogs, refreshAppData]);



  const handleSubmit = async (e: FormEvent) => {

    e.preventDefault();

    if (!user) return;

    if (availableDrones.length === 0) {
      setError('Нет доступных бортов со статусом «Готов».');
      return;
    }

    setSaving(true);

    setError(null);



    const result = await api.addMaintenanceLog({
      drone_id: droneId,
      work_type: workType,
      description,
    });

    if (!result.ok) {
      setError(result.error ?? 'Не удалось сохранить запись.');
      setSaving(false);
      return;
    }
    const payload = result.data as { drone?: DroneRow } | undefined;
    if (payload?.drone) {
      patchDrone(mapDroneRow(payload.drone as unknown as Record<string, unknown>));
    }



    setModalOpen(false);

    setDescription('');

    setSaving(false);

    await loadLogs();

    await refreshAppData();

  };



  const handleCompleteMaintenance = async (log: MaintenanceLog) => {

    if (!user) return;

    setCompletingId(log.drone_id);
    setError(null);

    const result = await api.completeMaintenance(log.drone_id);

    if (!result.ok) {

      setError(result.error ?? 'Не удалось завершить обслуживание.');

      setCompletingId(null);

      return;

    }

    if (result.data) {

      patchDrone(mapDroneRow(result.data as unknown as Record<string, unknown>));

    }



    setCompletingId(null);

    await loadLogs();

    await refreshAppData();

  };



  return (

    <div className="maintenance-journal">

      <header className="maintenance-journal__header">

        <div>

          <h2 className="maintenance-journal__title">Журнал технического обслуживания</h2>

          <p className="maintenance-journal__desc">Учёт работ по флоту БПЛА и аккумуляторов</p>

        </div>

        {activeTab === 'journal' && (

          <button type="button" className="btn btn--primary" onClick={() => setModalOpen(true)}>

            + Новая запись ТО

          </button>

        )}

      </header>



      <nav className="maintenance-journal__tabs" aria-label="Разделы журнала ТО">

        <button

          type="button"

          className={`maintenance-journal__tab${activeTab === 'journal' ? ' maintenance-journal__tab--active' : ''}`}

          onClick={() => setActiveTab('journal')}

        >

          Журнал ТО

        </button>

        <button

          type="button"

          className={`maintenance-journal__tab${activeTab === 'batteries' ? ' maintenance-journal__tab--active' : ''}`}

          onClick={() => setActiveTab('batteries')}

        >

          Учёт АКБ
          {pendingBatteryInspections > 0 && (
            <span className="maintenance-journal__tab-badge">{pendingBatteryInspections}</span>
          )}

        </button>

      </nav>



      {activeTab === 'batteries' ? (

        <BatteryRegistry onPendingCountChange={setPendingBatteryInspections} />

      ) : (

        <>

      {error && (

        <p className="maintenance-journal__error maintenance-journal__error--banner" role="alert">

          {error}

        </p>

      )}



      <GlassCard className="maintenance-journal__card">

        {loading ? (

          <p className="maintenance-journal__loading">Загрузка журнала...</p>

        ) : logs.length === 0 ? (

          <p className="maintenance-journal__empty">Записей ТО пока нет</p>

        ) : (

          <ul className="maintenance-journal__list">

            {logs.map((log) => {

              const liveStatus =

                log.drone_status ??

                drones.find((d) => d.id === log.drone_id)?.status ??

                '—';

              const isMaintenanceWork =
                log.work_type === 'Плановое ТО' ||
                log.work_type === 'Ремонт' ||
                log.work_type === 'Диагностика';

              const isOpenSession = isMaintenanceWork && !log.closed_at;

              const showComplete =

                canComplete &&

                isOpenSession &&

                MAINTENANCE_STATUSES.has(liveStatus as string);

              const statusBadge = !isMaintenanceWork

                ? null

                : isOpenSession

                  ? liveStatus

                  : 'Завершено';



              return (

                <li key={log.id} className="maintenance-journal__item">

                  <div className="maintenance-journal__item-header">

                    <div className="maintenance-journal__item-tags">

                      <span className="maintenance-journal__work-type" title="Тип работ в записи журнала">

                        {log.work_type}

                      </span>

                      {statusBadge && (

                        <span

                          className={`maintenance-journal__drone-status maintenance-journal__drone-status--${String(statusBadge).replace(/\s+/g, '-')}`}

                          title={

                            isOpenSession

                              ? 'Текущий статус борта (активная сессия ТО)'

                              : 'Сессия обслуживания завершена'

                          }

                        >

                          {isOpenSession ? `Борт: ${statusBadge}` : statusBadge}

                        </span>

                      )}

                    </div>

                    <time className="maintenance-journal__date">{log.maintenance_date}</time>

                  </div>

                  <p className="maintenance-journal__drone">

                    {log.drone_name} ({log.drone_serial})

                  </p>

                  <p className="maintenance-journal__hours">

                    Налёт на момент записи:{' '}

                    {(log.hours_at_service ?? log.drone_flight_hours ?? 0).toFixed(1)} ч

                    {(log.hours_at_service ?? log.drone_flight_hours ?? 0) > 100 && (

                      <span className="maintenance-journal__hours-warn"> — превышен лимит ТО</span>

                    )}

                  </p>

                  {log.description && (

                    <p className="maintenance-journal__desc-text">{log.description}</p>

                  )}

                  <div className="maintenance-journal__item-footer">

                    <p className="maintenance-journal__operator">
                      Техник:{' '}
                      {log.operator_id ? (
                        <OperatorLink operatorId={log.operator_id} className="operator-link">
                          {log.operator_name ?? '—'}
                        </OperatorLink>
                      ) : (
                        log.operator_name ?? '—'
                      )}
                    </p>

                    {showComplete && (

                      <button

                        type="button"

                        className="btn btn--secondary maintenance-journal__complete-btn"

                        disabled={completingId === log.drone_id}

                        onClick={() => handleCompleteMaintenance(log)}

                      >

                        {completingId === log.drone_id

                          ? 'Завершение…'

                          : 'Завершить обслуживание'}

                      </button>

                    )}

                  </div>

                </li>

              );

            })}

          </ul>

        )}

      </GlassCard>



      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новая запись ТО">

        <form className="maintenance-journal__form" onSubmit={handleSubmit}>

          <div className="form-field">

            <label className="form-field__label" htmlFor="maint-drone">

              Борт БПЛА

            </label>

            <AppSelect

              id="maint-drone"

              value={droneId || availableDrones[0]?.id || ''}

              onChange={(v) => setDroneId(Number(v))}

              options={availableDrones.map((d) => ({

                value: d.id,

                label: `${d.name} — ${d.serial_number}`,

              }))}

              disabled={availableDrones.length === 0}

            />

            {availableDrones.length === 0 && (

              <span className="form-field__hint">

                Все борта заняты (миссия, ТО, ремонт или диагностика). Новая запись недоступна.

              </span>

            )}

          </div>



          <div className="form-field">

            <label className="form-field__label" htmlFor="maint-type">

              Тип работ

            </label>

            <AppSelect

              id="maint-type"

              value={workType}

              onChange={(v) => setWorkType(v as (typeof WORK_TYPES)[number])}

              options={WORK_TYPES.map((t) => ({ value: t, label: t }))}

            />

          </div>



          <div className="form-field">

            <label className="form-field__label" htmlFor="maint-desc">

              Описание

            </label>

            <textarea

              id="maint-desc"

              className="form-field__input maintenance-journal__textarea"

              rows={3}

              value={description}

              onChange={(e) => setDescription(e.target.value)}

              placeholder="Выполненные работы..."

            />

          </div>



          {error && modalOpen && (

            <p className="maintenance-journal__error" role="alert">

              {error}

            </p>

          )}



          <div className="maintenance-journal__form-actions">

            <button type="button" className="btn btn--secondary" onClick={() => setModalOpen(false)}>

              Отмена

            </button>

            <button type="submit" className="btn btn--primary" disabled={saving || availableDrones.length === 0}>

              {saving ? 'Сохранение...' : 'Сохранить'}

            </button>

          </div>

        </form>

      </Modal>

        </>

      )}

    </div>

  );

}


