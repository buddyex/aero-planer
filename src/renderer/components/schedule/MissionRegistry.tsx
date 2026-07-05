import { useMemo, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import type { Mission, MissionStatus } from '../../types';
import { missionStatusClass } from '../../utils/missions';
import { formatDisplayTime } from '../../utils/weather';
import { GlassCard } from '../ui/GlassCard';
import { OperatorLink } from '../ui/OperatorLink';
import './MissionRegistry.css';

type MissionFilter = 'all' | MissionStatus;

const FILTER_OPTIONS: { id: MissionFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'К выполнению', label: 'К выполнению' },
  { id: 'Ожидает утверждения', label: 'Ожидает утверждения' },
  { id: 'Выполняется', label: 'Выполняется' },
  { id: 'Завершено', label: 'Завершено' },
  { id: 'Отменено', label: 'Отменено' },
];

interface MissionRegistryProps {
  onSelectMission: (mission: Mission) => void;
}

export function MissionRegistry({ onSelectMission }: MissionRegistryProps) {
  const { visibleMissions, getDroneById, getOperatorById, getSectorById } = useAppData();
  const [filter, setFilter] = useState<MissionFilter>('all');

  const filteredMissions = useMemo(() => {
    const list =
      filter === 'all'
        ? visibleMissions
        : visibleMissions.filter((mission) => mission.status === filter);
    return [...list].sort((a, b) => b.start_time.localeCompare(a.start_time));
  }, [visibleMissions, filter]);

  return (
    <GlassCard className="mission-registry">
      <div className="mission-registry__header">
        <div>
          <h3 className="mission-registry__title">Реестр миссий</h3>
          <p className="mission-registry__desc">
            Выберите миссию для просмотра деталей и смены статуса
          </p>
        </div>
        <div className="mission-registry__filters" role="tablist" aria-label="Фильтр миссий">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              className={`mission-registry__filter ${
                filter === option.id ? 'mission-registry__filter--active' : ''
              }`}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mission-registry__table-wrap hidden md:block overflow-x-auto">
        <table className="mission-registry__table w-full">
          <thead>
            <tr>
              <th>Миссия</th>
              <th>Оператор</th>
              <th>Борт</th>
              <th>Сектор</th>
              <th>Начало</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {filteredMissions.length === 0 ? (
              <tr>
                <td colSpan={6} className="mission-registry__empty">
                  Нет миссий для выбранного фильтра
                </td>
              </tr>
            ) : (
              filteredMissions.map((mission) => {
                const operator = getOperatorById(mission.operator_id);
                const drone = getDroneById(mission.drone_id);
                const sector = getSectorById(mission.sector_id);

                return (
                  <tr
                    key={mission.id}
                    className="mission-registry__row"
                    onClick={() => onSelectMission(mission)}
                  >
                    <td className="mission-registry__title-cell">{mission.title}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <OperatorLink
                        operatorId={mission.operator_id}
                        className="operator-link"
                      >
                        {mission.operator_name ?? operator?.full_name ?? '—'}
                      </OperatorLink>
                    </td>
                    <td>{mission.drone_serial ?? drone?.serial_number ?? '—'}</td>
                    <td>{mission.sector_name ?? sector?.sector_name ?? '—'}</td>
                    <td className="mission-registry__time">
                      {formatDisplayTime(mission.start_time)}
                    </td>
                    <td>
                      <span
                        className={`mission-registry__status mission-status ${missionStatusClass(
                          mission.status,
                        )}`}
                      >
                        {mission.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {filteredMissions.length === 0 ? (
          <li className="mission-registry__empty p-4 text-center">Нет миссий для выбранного фильтра</li>
        ) : (
          filteredMissions.map((mission) => {
            const operator = getOperatorById(mission.operator_id);
            const drone = getDroneById(mission.drone_id);
            const sector = getSectorById(mission.sector_id);

            return (
              <li
                key={mission.id}
                className="mission-registry__row rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2 cursor-pointer"
                onClick={() => onSelectMission(mission)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{mission.title}</span>
                  <span
                    className={`mission-registry__status mission-status shrink-0 ${missionStatusClass(mission.status)}`}
                  >
                    {mission.status}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-white/80">
                  <dt>Оператор</dt>
                  <dd onClick={(e) => e.stopPropagation()}>
                    <OperatorLink operatorId={mission.operator_id} className="operator-link">
                      {mission.operator_name ?? operator?.full_name ?? '—'}
                    </OperatorLink>
                  </dd>
                  <dt>Борт</dt>
                  <dd>{mission.drone_serial ?? drone?.serial_number ?? '—'}</dd>
                  <dt>Сектор</dt>
                  <dd>{mission.sector_name ?? sector?.sector_name ?? '—'}</dd>
                  <dt>Начало</dt>
                  <dd className="mission-registry__time">{formatDisplayTime(mission.start_time)}</dd>
                </dl>
              </li>
            );
          })
        )}
      </ul>
    </GlassCard>
  );
}
