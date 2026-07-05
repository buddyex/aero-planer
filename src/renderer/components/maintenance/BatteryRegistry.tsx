import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../context/ApiContext';
import { useAuth } from '../../context/AuthContext';
import type { Battery, BatteryInspectionLog } from '../../types';
import type { BatteryInspectionFormPayload } from './BatteryInspectionModal';
import { canCompleteMaintenance } from '../../utils/permissions';
import { GlassCard } from '../ui/GlassCard';
import { OperatorLink } from '../ui/OperatorLink';
import { BatteryFormModal } from './BatteryFormModal';
import { BatteryInspectionModal } from './BatteryInspectionModal';
import './BatteryRegistry.css';

type InspectionResultFilter = 'all' | BatteryInspectionLog['result'];
type InspectionPeriodFilter = 'all' | '30' | '90';

const RESULT_FILTER_OPTIONS: { id: InspectionResultFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'Пройдена', label: 'Пройдена' },
  { id: 'Не пройдена', label: 'Не пройдена' },
];

const PERIOD_FILTER_OPTIONS: { id: InspectionPeriodFilter; label: string }[] = [
  { id: 'all', label: 'Все время' },
  { id: '30', label: '30 дней' },
  { id: '90', label: '90 дней' },
];

function statusClass(status: Battery['status']): string {
  if (status === 'Отлично') return 'battery-registry__status--ok';
  if (status === 'Списано') return 'battery-registry__status--scrap';
  return 'battery-registry__status--warn';
}

function formatInspectionDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRecordCount(count: number): string {
  if (count === 1) return '1 запись';
  if (count > 1 && count < 5) return `${count} записи`;
  return `${count} записей`;
}

function isWithinPeriod(dateValue: string, period: InspectionPeriodFilter): boolean {
  if (period === 'all') return true;

  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return true;

  const days = Number(period);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);

  return parsed >= cutoff;
}

interface BatteryRegistryProps {
  onPendingCountChange?: (count: number) => void;
}

export function BatteryRegistry({ onPendingCountChange }: BatteryRegistryProps) {
  const api = useApi();
  const { user } = useAuth();
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [inspectionLogs, setInspectionLogs] = useState<BatteryInspectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [inspectionBattery, setInspectionBattery] = useState<Battery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<InspectionResultFilter>('all');
  const [batteryFilter, setBatteryFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<InspectionPeriodFilter>('all');

  const canInspect = user ? canCompleteMaintenance(user.role) : false;
  const pendingCount = useMemo(
    () => batteries.filter((battery) => battery.status === 'Требуется проверка').length,
    [batteries],
  );

  const filteredLogs = useMemo(() => {
    return inspectionLogs.filter((log) => {
      if (resultFilter !== 'all' && log.result !== resultFilter) return false;
      if (batteryFilter !== 'all' && log.battery_id !== batteryFilter) return false;
      if (!isWithinPeriod(log.inspection_date, periodFilter)) return false;
      return true;
    });
  }, [inspectionLogs, resultFilter, batteryFilter, periodFilter]);

  const inspectedBatteries = useMemo(() => {
    const entries = new Map<string, string>();
    for (const log of inspectionLogs) {
      if (!entries.has(log.battery_id)) {
        entries.set(log.battery_id, log.battery_serial ?? log.battery_id);
      }
    }
    return Array.from(entries.entries()).map(([id, serial]) => ({ id, serial }));
  }, [inspectionLogs]);

  const hasActiveFilters =
    resultFilter !== 'all' || batteryFilter !== 'all' || periodFilter !== 'all';

  useEffect(() => {
    if (batteryFilter === 'all') return;
    if (!inspectedBatteries.some((battery) => battery.id === batteryFilter)) {
      setBatteryFilter('all');
    }
  }, [batteryFilter, inspectedBatteries]);

  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [pendingCount, onPendingCountChange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [batteriesResult, logsResult] = await Promise.all([
      api.getAllBatteries(),
      api.getBatteryInspectionLogs(),
    ]);

    if (batteriesResult.ok && batteriesResult.data) {
      setBatteries(batteriesResult.data as Battery[]);
    } else {
      setBatteries([]);
      setError(batteriesResult.error ?? 'Не удалось загрузить реестр АКБ.');
    }

    if (logsResult.ok && logsResult.data) {
      setInspectionLogs(logsResult.data as BatteryInspectionLog[]);
    } else {
      setInspectionLogs([]);
    }

    setLoading(false);
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddBattery = async (serial_number: string, type: string, capacity: number) => {
    const result = await api.addBattery(serial_number, type, capacity);
    if (result.ok) {
      await loadData();
    }
    return { ok: result.ok, error: result.error };
  };

  const handleCompleteInspection = async (payload: BatteryInspectionFormPayload) => {
    if (!inspectionBattery) {
      return { ok: false, error: 'АКБ не выбрана.' };
    }

    const result = await api.completeBatteryInspection(inspectionBattery.id, payload);
    if (result.ok) {
      await loadData();
    }
    return { ok: result.ok, error: result.error };
  };

  return (
    <div className="battery-registry">
      <header className="battery-registry__header">
        <div>
          <h3 className="battery-registry__title">
            Учёт АКБ
            {pendingCount > 0 && (
              <span className="battery-registry__pending-badge">{pendingCount} требуют проверки</span>
            )}
          </h3>
          <p className="battery-registry__desc">
            Реестр аккумуляторов «Умный склад АКБ». Плановая проверка — каждые 50 циклов.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setModalOpen(true)}>
          + Добавить новую АКБ
        </button>
      </header>

      {error && (
        <p className="battery-registry__error battery-registry__error--banner" role="alert">
          {error}
        </p>
      )}

      <GlassCard className="battery-registry__card">
        {loading ? (
          <p className="battery-registry__loading">Загрузка реестра АКБ…</p>
        ) : batteries.length === 0 ? (
          <p className="battery-registry__empty">Аккумуляторы не зарегистрированы</p>
        ) : (
          <>
            <div className="battery-registry__table-wrap hidden md:block">
              <table className="battery-registry__table">
                <thead>
                  <tr>
                    <th>Серийный номер</th>
                    <th>Тип</th>
                    <th>Ёмкость, мАч</th>
                    <th>Циклы</th>
                    <th>Статус</th>
                    {canInspect && <th>Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {batteries.map((battery) => (
                    <tr key={battery.id}>
                      <td>{battery.serial_number}</td>
                      <td>{battery.type}</td>
                      <td>{battery.capacity.toLocaleString('ru-RU')}</td>
                      <td>{battery.cycle_count}</td>
                      <td>
                        <span className={`battery-registry__status ${statusClass(battery.status)}`}>
                          {battery.status}
                        </span>
                      </td>
                      {canInspect && (
                        <td>
                          {battery.status === 'Требуется проверка' ? (
                            <button
                              type="button"
                              className="btn btn--secondary battery-registry__inspect-btn"
                              onClick={() => setInspectionBattery(battery)}
                            >
                              Провести проверку
                            </button>
                          ) : (
                            <span className="battery-registry__no-action">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-3 md:hidden">
              {batteries.map((battery) => (
                <li
                  key={battery.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{battery.serial_number}</span>
                    <span className={`battery-registry__status ${statusClass(battery.status)}`}>
                      {battery.status}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-white/80">
                    <dt>Тип</dt>
                    <dd>{battery.type}</dd>
                    <dt>Ёмкость</dt>
                    <dd>{battery.capacity.toLocaleString('ru-RU')} мАч</dd>
                    <dt>Циклы</dt>
                    <dd>{battery.cycle_count}</dd>
                  </dl>
                  {canInspect && battery.status === 'Требуется проверка' && (
                    <button
                      type="button"
                      className="btn btn--secondary battery-registry__inspect-btn mt-1"
                      onClick={() => setInspectionBattery(battery)}
                    >
                      Провести проверку
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </GlassCard>

      <GlassCard className="battery-registry__card battery-registry__history">
        <div className="battery-registry__history-head">
          <h4 className="battery-registry__history-title">История проверок АКБ</h4>
          {!loading && inspectionLogs.length > 0 && (
            <span className="battery-registry__history-count">
              {formatRecordCount(filteredLogs.length)}
              {hasActiveFilters && filteredLogs.length !== inspectionLogs.length && (
                <span className="battery-registry__history-count-total">
                  {' '}
                  из {inspectionLogs.length}
                </span>
              )}
            </span>
          )}
        </div>

        {!loading && inspectionLogs.length > 0 && (
          <div className="battery-registry__history-filters">
            <div
              className="battery-registry__history-result-filters"
              role="tablist"
              aria-label="Фильтр по результату проверки"
            >
              {RESULT_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={resultFilter === option.id}
                  className={`battery-registry__history-filter ${
                    resultFilter === option.id ? 'battery-registry__history-filter--active' : ''
                  }`}
                  onClick={() => setResultFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="battery-registry__history-selects">
              <label className="battery-registry__history-select-label">
                <span className="battery-registry__history-select-caption">АКБ</span>
                <select
                  className="battery-registry__history-select"
                  value={batteryFilter}
                  onChange={(e) => setBatteryFilter(e.target.value)}
                  aria-label="Фильтр по АКБ"
                >
                  <option value="all">Все АКБ</option>
                  {inspectedBatteries.map((battery) => (
                    <option key={battery.id} value={battery.id}>
                      {battery.serial}
                    </option>
                  ))}
                </select>
              </label>

              <label className="battery-registry__history-select-label">
                <span className="battery-registry__history-select-caption">Период</span>
                <select
                  className="battery-registry__history-select"
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as InspectionPeriodFilter)}
                  aria-label="Фильтр по периоду"
                >
                  {PERIOD_FILTER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {loading ? (
          <p className="battery-registry__loading">Загрузка истории…</p>
        ) : inspectionLogs.length === 0 ? (
          <p className="battery-registry__empty">Проверок пока не проводилось</p>
        ) : filteredLogs.length === 0 ? (
          <p className="battery-registry__empty">Нет записей для выбранного фильтра</p>
        ) : (
          <ul className="battery-registry__history-list">
            {filteredLogs.map((log) => {
              const passed = log.result === 'Пройдена';

              return (
                <li key={log.id} className="battery-registry__history-item">
                  <div className="battery-registry__history-header">
                    <div className="battery-registry__history-leading">
                      <span className="battery-registry__history-battery">
                        {log.battery_serial ?? log.battery_id}
                      </span>
                      <span
                        className={`battery-registry__history-result ${passed ? 'battery-registry__history-result--pass' : 'battery-registry__history-result--fail'}`}
                      >
                        {log.result}
                      </span>
                    </div>
                    <time className="battery-registry__history-date" dateTime={log.inspection_date}>
                      {formatInspectionDate(log.inspection_date)}
                    </time>
                  </div>

                  <div className="battery-registry__history-chips">
                    <span className="battery-registry__history-chip">
                      Цикл {log.cycle_count_at_inspection}
                    </span>
                    <span className="battery-registry__history-chip">
                      Ёмкость {log.capacity_percent}%
                    </span>
                  </div>

                  {log.notes && (
                    <p className="battery-registry__history-notes">{log.notes}</p>
                  )}

                  <div className="battery-registry__history-footer">
                    <span className="battery-registry__history-operator-label">Техник</span>
                    {log.operator_id ? (
                      <OperatorLink operatorId={log.operator_id} className="operator-link">
                        {log.operator_name ?? '—'}
                      </OperatorLink>
                    ) : (
                      <span>{log.operator_name ?? '—'}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      <BatteryFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAddBattery}
      />

      <BatteryInspectionModal
        open={inspectionBattery != null}
        battery={inspectionBattery}
        onClose={() => setInspectionBattery(null)}
        onSubmit={handleCompleteInspection}
      />
    </div>
  );
}
