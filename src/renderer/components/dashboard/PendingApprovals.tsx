import { useMemo, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import type { Mission } from '../../types';
import { isManagerLikeRole } from '../../utils/operationalKpis';
import { formatDisplayTime } from '../../utils/weather';
import { MissionApprovalModal } from './MissionApprovalModal';
import './PendingApprovals.css';

export function PendingApprovals() {
  const { missions, refreshAppData } = useAppData();
  const { user } = useAuth();
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);

  const pending = useMemo(
    () =>
      missions
        .filter((m) => m.status === 'Ожидает утверждения')
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [missions],
  );

  if (!user || !isManagerLikeRole(user.role)) {
    return null;
  }

  return (
    <section className="pending-approvals" aria-labelledby="pending-approvals-title">
      <div className="pending-approvals__header">
        <h2 id="pending-approvals-title" className="pending-approvals__title">
          Требуют утверждения
        </h2>
        <span className="pending-approvals__count">{pending.length}</span>
      </div>

      {pending.length === 0 ? (
        <p className="pending-approvals__empty">Нет миссий, ожидающих согласования.</p>
      ) : (
        <ul className="pending-approvals__list">
          {pending.map((mission) => (
            <li key={mission.id} className="pending-approvals__list-item">
              <button
                type="button"
                className="pending-approvals__item"
                onClick={() => setSelectedMission(mission)}
              >
                <span className="pending-approvals__item-title">{mission.title}</span>
                <div className="pending-approvals__item-grid">
                  <div>
                    <span className="pending-approvals__label">Оператор</span>
                    <span className="pending-approvals__value">
                      {mission.operator_name ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="pending-approvals__label">Сектор</span>
                    <span className="pending-approvals__value">
                      {mission.sector_name ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="pending-approvals__label">Начало</span>
                    <span className="pending-approvals__value">
                      {formatDisplayTime(mission.start_time)}
                    </span>
                  </div>
                  <div>
                    <span className="pending-approvals__label">Окончание</span>
                    <span className="pending-approvals__value">
                      {formatDisplayTime(mission.end_time)}
                    </span>
                  </div>
                </div>
                {mission.creator_name ? (
                  <span className="pending-approvals__item-author">
                    Автор: {mission.creator_name}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <MissionApprovalModal
        mission={selectedMission}
        open={selectedMission != null}
        onClose={() => setSelectedMission(null)}
        onResolved={() => void refreshAppData()}
      />
    </section>
  );
}
