import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import type { Mission } from '../../types';
import { parseMissionTime } from '../../utils/weather';
import { MissionDetailModal } from '../schedule/MissionDetailModal';
import { GlassCard } from '../ui/GlassCard';
import './UpcomingMissions.css';

export function UpcomingMissions() {
  const { getUpcomingMissions, getDroneById, getSectorById, getOperatorById } = useAppData();
  const missions = getUpcomingMissions();
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openMissionDetail = (mission: Mission) => {
    setSelectedMission(mission);
    setDetailOpen(true);
  };

  const closeMissionDetail = () => {
    setDetailOpen(false);
    setSelectedMission(null);
  };

  return (
    <GlassCard className="upcoming-missions">
      <h2 className="section-title">Ближайшие вылеты</h2>
      <p className="section-subtitle">Миссии со статусом «К выполнению»</p>

      <ul className="upcoming-missions__list">
        {missions.length === 0 ? (
          <li className="upcoming-missions__empty">Нет запланированных миссий</li>
        ) : (
          missions.map((mission) => {
            const drone = getDroneById(mission.drone_id);
            const sector = getSectorById(mission.sector_id);
            const operator = getOperatorById(mission.operator_id);
            const isHighRisk = sector?.risk_level === 'Высокий';
            const isMediumRisk = sector?.risk_level === 'Средний';
            const startDate = parseMissionTime(mission.start_time);
            const hasStartTime = !Number.isNaN(startDate.getTime());

            return (
              <li key={mission.id}>
                <button
                  type="button"
                  className={`upcoming-missions__item ${
                    isHighRisk
                      ? 'upcoming-missions__item--high-risk'
                      : isMediumRisk
                        ? 'upcoming-missions__item--medium-risk'
                        : ''
                  }`}
                  onClick={() => openMissionDetail(mission)}
                >
                  <div className="upcoming-missions__time">
                    <span className="upcoming-missions__date">
                      {hasStartTime
                        ? startDate.toLocaleDateString('ru-RU')
                        : '—'}
                    </span>
                    <span className="upcoming-missions__hour">
                      {hasStartTime
                        ? startDate.toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                  </div>
                  <div className="upcoming-missions__info">
                    <span className="upcoming-missions__title">{mission.title}</span>
                    <span className="upcoming-missions__meta">
                      {drone?.serial_number} ·{' '}
                      {operator?.full_name ?? mission.operator_name ?? '—'} ·{' '}
                      {sector?.sector_name}
                    </span>
                  </div>
                  <span
                    className={`upcoming-missions__risk upcoming-missions__risk--${
                      sector?.risk_level === 'Низкий'
                        ? 'low'
                        : sector?.risk_level === 'Средний'
                          ? 'medium'
                          : 'high'
                    }`}
                  >
                    {sector?.risk_level}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <MissionDetailModal
        mission={selectedMission}
        open={detailOpen}
        onClose={closeMissionDetail}
      />
    </GlassCard>
  );
}
